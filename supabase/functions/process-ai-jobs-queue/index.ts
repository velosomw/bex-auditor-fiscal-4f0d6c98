// ─────────────────────────────────────────────────────────────────
// BEx — Worker da fila de jobs de IA
// ─────────────────────────────────────────────────────────────────
// Disparado por pg_cron a cada minuto + auto-trigger pós-enqueue.
// Lê em lote (até MAX_BATCH), respeita concorrência (CONCURRENCY)
// e usa retry/backoff via aiGatewayFetch.
// ─────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aiGatewayFetch } from "../_shared/ai-fetch.ts";
import { selectModel, computeCriticality, type RiskSignals } from "../_shared/model-router.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const QUEUE_NAME = "bex_ai_jobs";
const DLQ_NAME = "bex_ai_jobs_dlq";

const MAX_BATCH = 6;       // mensagens lidas do pgmq por execução
const CONCURRENCY = 3;     // jobs processados em paralelo
const VISIBILITY_SEC = 300; // 5 min — jobs longos ainda cabem

interface AIJob {
  id: string;
  kind: "insight" | "report" | "custom";
  payload: Record<string, unknown>;
  document_id: string | null;
  company_id: string | null;
  attempts: number;
  max_attempts: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    // 1) Lê mensagens do pgmq (libera msg para outras instâncias após VISIBILITY_SEC)
    const { data: msgs, error: readErr } = await sb.rpc("read_email_batch", {
      queue_name: QUEUE_NAME,
      batch_size: MAX_BATCH,
      vt: VISIBILITY_SEC,
    });

    if (readErr) {
      console.error("read_email_batch failed:", readErr);
      return json({ error: "read_failed" }, 500);
    }

    const messages = (msgs ?? []) as Array<{ msg_id: number; read_ct: number; message: { job_id: string; kind: string } }>;
    if (messages.length === 0) {
      return json({ processed: 0, duration_ms: Date.now() - t0 });
    }

    // 2) Reserva os jobs (FOR UPDATE SKIP LOCKED) → status=processing
    const ids = messages.map((m) => m.message?.job_id).filter(Boolean);
    const { data: claimedRaw } = await sb.rpc("ai_jobs_claim_batch", { p_limit: ids.length });
    const claimed: AIJob[] = (claimedRaw ?? []) as AIJob[];
    const claimedById = new Map(claimed.map((j) => [j.id, j]));

    // 3) Processa em waves de CONCURRENCY
    let processed = 0;
    for (let i = 0; i < messages.length; i += CONCURRENCY) {
      const wave = messages.slice(i, i + CONCURRENCY);
      await Promise.all(
        wave.map(async (msg) => {
          const jobId = msg.message?.job_id;
          const job = jobId ? claimedById.get(jobId) : undefined;

          // Job não pôde ser reservado (já em processamento ou completed) — só remove a msg
          if (!job) {
            await sb.rpc("delete_email", { queue_name: QUEUE_NAME, message_id: msg.msg_id });
            return;
          }

          try {
            const result = await runJob(job);
            await sb.from("ai_jobs").update({
              status: "completed",
              result,
              finished_at: new Date().toISOString(),
              error_message: null,
            }).eq("id", job.id);
            await sb.rpc("delete_email", { queue_name: QUEUE_NAME, message_id: msg.msg_id });
            processed++;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[ai-jobs] job ${job.id} falhou:`, errMsg);

            // Se ainda há tentativas, devolve para 'queued' (msg será reprocessada após VT)
            if (job.attempts < job.max_attempts) {
              await sb.from("ai_jobs").update({
                status: "queued",
                error_message: errMsg.slice(0, 500),
              }).eq("id", job.id);
              // não deleta a msg → pgmq reentrega após visibility timeout
            } else {
              // Esgotou tentativas → failed + DLQ
              await sb.from("ai_jobs").update({
                status: "failed",
                error_message: errMsg.slice(0, 500),
                finished_at: new Date().toISOString(),
              }).eq("id", job.id);
              await sb.rpc("move_to_dlq", {
                source_queue: QUEUE_NAME,
                dlq_name: DLQ_NAME,
                message_id: msg.msg_id,
                payload: msg.message,
              });
            }
          }
        }),
      );
    }

    return json({ processed, total: messages.length, duration_ms: Date.now() - t0 });
  } catch (e) {
    console.error("process-ai-jobs-queue fatal:", e);
    return json({ error: "internal", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ──────────────────────────────────────────────────────────────
// Roteador interno por tipo de job
// ──────────────────────────────────────────────────────────────
async function runJob(job: AIJob): Promise<Record<string, unknown>> {
  switch (job.kind) {
    case "insight":
      return await runInsight(job);
    case "report":
      return await runReport(job);
    case "custom":
      return await runCustom(job);
    default:
      throw new Error(`kind_desconhecido:${job.kind}`);
  }
}

// ──────────────────────────────────────────────────────────────
// Insight: payload = { signals?, contexto, prompt? }
// ──────────────────────────────────────────────────────────────
async function runInsight(job: AIJob): Promise<Record<string, unknown>> {
  const p = job.payload as {
    signals?: RiskSignals;
    contexto: string;
    prompt?: string;
  };
  const decision = selectModel("audit_insights", "medium", p.signals);
  const userPrompt = p.prompt ?? "Analise este balancete e retorne JSON via tool call:";

  const resp = await aiGatewayFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: decision.model,
      messages: [
        {
          role: "system",
          content:
            "Você é o Auditor Contábil Sênior IA da BEX. Responda SEMPRE via tool call return_audit_insights, em PT-BR, técnico e direto, citando valores absolutos quando relevantes.",
        },
        { role: "user", content: `${userPrompt}\n\n${p.contexto}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_audit_insights",
          description: "Retorna análise estruturada do auditor.",
          parameters: {
            type: "object",
            properties: {
              resumo: { type: "string" },
              pontos_atencao: { type: "array", items: { type: "string" } },
              recomendacoes: { type: "array", items: { type: "string" } },
            },
            required: ["resumo", "pontos_atencao", "recomendacoes"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_audit_insights" } },
    }),
  }, { label: `aijob_insight:${decision.serviceTag}`, maxAttempts: 3, perAttemptTimeoutMs: 90_000 });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ai_gateway_${resp.status}:${t.slice(0, 200)}`);
  }
  const j = await resp.json();
  const tc = j.choices?.[0]?.message?.tool_calls?.[0];
  const args = JSON.parse(tc?.function?.arguments || "{}");
  return {
    insights: args,
    model: decision.model,
    provider: decision.provider,
    criticality: decision.criticality,
    usage: j.usage ?? null,
  };
}

// ──────────────────────────────────────────────────────────────
// Report: payload = { signals?, contexto, secoes }
// Geração de blocos de texto extensos para o relatório.
// ──────────────────────────────────────────────────────────────
async function runReport(job: AIJob): Promise<Record<string, unknown>> {
  const p = job.payload as {
    signals?: RiskSignals;
    contexto: string;
    secoes?: string[];
  };
  const decision = selectModel("report_generation", "medium", p.signals);
  const secoes = p.secoes ?? ["sumario_executivo", "analise_patrimonial", "analise_resultado", "recomendacoes"];

  const resp = await aiGatewayFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: decision.model,
      messages: [
        {
          role: "system",
          content:
            "Você é o Auditor Contábil Sênior IA da BEX. Gere o conteúdo de relatório técnico em PT-BR, formal, citando normas (CPC/IFRS/Lei 6.404/76) e valores absolutos. Cada seção deve ter 2-4 parágrafos.",
        },
        { role: "user", content: `Contexto:\n${p.contexto}\n\nGere as seguintes seções: ${secoes.join(", ")}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_report_sections",
          description: "Retorna seções textuais do relatório.",
          parameters: {
            type: "object",
            properties: {
              sections: {
                type: "object",
                additionalProperties: { type: "string" },
              },
            },
            required: ["sections"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_report_sections" } },
    }),
  }, { label: `aijob_report:${decision.serviceTag}`, maxAttempts: 3, perAttemptTimeoutMs: 120_000 });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ai_gateway_${resp.status}:${t.slice(0, 200)}`);
  }
  const j = await resp.json();
  const tc = j.choices?.[0]?.message?.tool_calls?.[0];
  const args = JSON.parse(tc?.function?.arguments || "{}");
  return {
    sections: args.sections ?? {},
    model: decision.model,
    provider: decision.provider,
    criticality: decision.criticality,
    usage: j.usage ?? null,
  };
}

// ──────────────────────────────────────────────────────────────
// Custom: payload = { model?, messages, ... } — encaminha cru
// ──────────────────────────────────────────────────────────────
async function runCustom(job: AIJob): Promise<Record<string, unknown>> {
  const p = job.payload as Record<string, unknown>;
  const resp = await aiGatewayFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", ...p }),
  }, { label: "aijob_custom", maxAttempts: 3, perAttemptTimeoutMs: 90_000 });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ai_gateway_${resp.status}:${t.slice(0, 200)}`);
  }
  return await resp.json();
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
