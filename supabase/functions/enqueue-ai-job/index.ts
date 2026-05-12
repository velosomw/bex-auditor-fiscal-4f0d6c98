// ─────────────────────────────────────────────────────────────────
// BEx — Enqueue AI Job
// ─────────────────────────────────────────────────────────────────
// Enfileira um job assíncrono de IA (insight ou relatório) e retorna
// imediatamente o job_id. O processamento é feito por
// `process-ai-jobs-queue` (acionado por pg_cron + auto-trigger).
// ─────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const QUEUE_NAME = "bex_ai_jobs";

interface EnqueueBody {
  kind: "insight" | "report" | "custom";
  payload: Record<string, unknown>;
  document_id?: string | null;
  company_id?: string | null;
  priority?: number; // 1 (baixa) – 10 (alta), default 5
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return json({ error: "missing_auth" }, 401);
    }

    // Cliente com JWT do usuário (RLS aplicada à inserção)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "invalid_jwt" }, 401);
    const userId = userData.user.id;

    const body = (await req.json()) as EnqueueBody;
    if (!body?.kind || !["insight", "report", "custom"].includes(body.kind)) {
      return json({ error: "invalid_kind" }, 400);
    }
    if (!body.payload || typeof body.payload !== "object") {
      return json({ error: "invalid_payload" }, 400);
    }

    // 1) Insere o registro de tracking
    const { data: job, error: insErr } = await userClient
      .from("ai_jobs")
      .insert({
        kind: body.kind,
        priority: clamp(body.priority ?? 5, 1, 10),
        requested_by: userId,
        document_id: body.document_id ?? null,
        company_id: body.company_id ?? null,
        payload: body.payload,
        status: "queued",
      })
      .select("id")
      .single();

    if (insErr || !job) return json({ error: "insert_failed", detail: insErr?.message }, 500);

    // 2) Envia mensagem para pgmq (service role — ignora RLS)
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: msgId, error: qErr } = await adminClient.rpc("enqueue_email", {
      queue_name: QUEUE_NAME,
      payload: { job_id: job.id, kind: body.kind },
    });

    if (qErr) {
      // marca o job como failed para não ficar órfão
      await adminClient.from("ai_jobs").update({
        status: "failed",
        error_message: `enqueue_failed: ${qErr.message}`,
        finished_at: new Date().toISOString(),
      }).eq("id", job.id);
      return json({ error: "enqueue_failed", detail: qErr.message }, 500);
    }

    await adminClient.from("ai_jobs").update({ pgmq_msg_id: msgId }).eq("id", job.id);

    // 3) Dispara o worker em background (best-effort, não bloqueia a resposta)
    triggerWorker().catch((e) => console.warn("worker trigger failed:", e));

    return json({ job_id: job.id, status: "queued" }, 202);
  } catch (e) {
    console.error("enqueue-ai-job error:", e);
    return json({ error: "internal", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

async function triggerWorker() {
  // Chama o worker imediatamente (best-effort; o cron continua como rede de segurança)
  const url = `${SUPABASE_URL}/functions/v1/process-ai-jobs-queue`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ trigger: "auto" }),
  });
}
