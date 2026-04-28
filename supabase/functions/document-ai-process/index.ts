import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import mammoth from "https://esm.sh/mammoth@1.8.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Tracking de uso (custos IA) ────────────────────────────────
async function trackUsage(input: {
  type: string; provider: string; service: string; document_id?: string | null;
  tokens_input?: number; tokens_output?: number; requests?: number; metadata?: Record<string, unknown>;
}) {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data: cfg } = await sb.from("ai_cost_config").select("*").eq("service", input.service).maybeSingle();
    const ti = Number(input.tokens_input || 0), to = Number(input.tokens_output || 0), rq = Number(input.requests || 0);
    const cost = cfg
      ? (ti / 1000) * Number(cfg.cost_per_1k_input || 0)
      + (to / 1000) * Number(cfg.cost_per_1k_output || 0)
      + rq * Number(cfg.cost_per_request || 0)
      + Number(cfg.cost_fixed || 0)
      : 0;
    await sb.from("ai_usage_logs").insert({
      type: input.type, provider: input.provider, service: input.service,
      document_id: input.document_id ?? null,
      tokens_input: ti, tokens_output: to, requests: rq,
      cost_calculated: cost, metadata: input.metadata ?? null,
    });
  } catch (e) { console.warn("trackUsage failed:", e); }
}


const STRUCTURE_PROMPT = `Você é o AGENTE PARSER CONTÁBIL BEX. Receberá o TEXTO BRUTO já extraído de um documento financeiro brasileiro (pode vir de OCR, planilha tabular, ou texto puro).

Identifique o tipo (Balancete, Balanço Patrimonial, DRE, DFC, Extrato) e estruture TODAS as contas com seus valores por período.

Responda EXCLUSIVAMENTE em JSON válido:
{
  "pdfType": "string (PDF, XLSX, CSV, DOCX, TXT...)",
  "documentInfo": { "empresa": "string", "periodo": "string", "tipo": "balancete|balanço|dre|dfc|extrato|relatório" },
  "years": ["2023","2022"],
  "balanco": [{ "conta": "1", "descricao": "ATIVO TOTAL", "values": {"2023": 1000000, "2022": 900000} }],
  "dre":     [{ "conta": "3.01", "descricao": "RECEITA LÍQUIDA", "values": {"2023": 500000, "2022": 450000} }]
}

REGRAS:
- Extraia TODAS as linhas, não resuma
- Valores numéricos puros (sem R$, sem pontos de milhar). Negativos com sinal -
- Se não distinguir Balanço de DRE, use "balanco"
- Responda APENAS com JSON`;

interface RequestBody {
  fileBase64: string;
  fileName?: string;
  mimeType?: string;
  projectId?: string;
  location?: string;
  processorId?: string;
}

// MIME types suportados nativamente pelo Document AI
const DOC_AI_MIMES = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/tiff", "image/bmp", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx (com OCR processor)
]);

const SPREADSHEET_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-excel", // xls
  "application/vnd.oasis.opendocument.spreadsheet", // ods
  "text/csv",
  "text/tab-separated-values",
]);

const WORD_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword", // doc
]);

const TEXT_MIMES = new Set(["text/plain", "text/markdown", "application/rtf", "text/rtf"]);

function inferMimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp", webp: "image/webp",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    csv: "text/csv", tsv: "text/tab-separated-values",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    txt: "text/plain", md: "text/markdown", rtf: "application/rtf",
  };
  return map[ext] || "application/octet-stream";
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function extractJson(raw: string): Record<string, unknown> {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("No JSON in AI response");
  cleaned = cleaned.substring(start);
  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    return JSON.parse(cleaned);
  }
}

// ─── Extractors por formato ─────────────────────────────────────
async function extractFromDocumentAI(
  fileBase64: string,
  mimeType: string,
  projectId: string,
  location: string,
  processorId: string,
  apiKey: string,
): Promise<{ text: string; pages: number; engine: string }> {
  const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawDocument: { content: fileBase64, mimeType } }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Document AI ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  return {
    text: data?.document?.text ?? "",
    pages: data?.document?.pages?.length ?? 0,
    engine: "google_document_ai",
  };
}

function extractFromSpreadsheet(bytes: Uint8Array): { text: string; pages: number; engine: string } {
  const wb = XLSX.read(bytes, { type: "array" });
  const sections: string[] = [];
  let totalRows = 0;
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false });
    const rowCount = csv.split("\n").length;
    totalRows += rowCount;
    sections.push(`=== Aba: ${sheetName} (${rowCount} linhas) ===\n${csv}`);
  }
  return {
    text: sections.join("\n\n"),
    pages: wb.SheetNames.length,
    engine: `xlsx-parser (${wb.SheetNames.length} abas, ${totalRows} linhas)`,
  };
}

function extractFromCsv(bytes: Uint8Array): { text: string; pages: number; engine: string } {
  const text = new TextDecoder("utf-8").decode(bytes);
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  return { text, pages: 1, engine: `csv-parser (${rows.length} linhas)` };
}

async function extractFromDocx(bytes: Uint8Array): Promise<{ text: string; pages: number; engine: string }> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return { text: result.value, pages: 1, engine: "mammoth (docx)" };
}

function extractFromText(bytes: Uint8Array): { text: string; pages: number; engine: string } {
  const text = new TextDecoder("utf-8").decode(bytes);
  return { text, pages: 1, engine: "plain-text" };
}

// ─── Handler ───────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    let { fileBase64, fileName = "document", mimeType } = body;

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: "Nenhum arquivo fornecido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!mimeType || mimeType === "application/octet-stream") {
      mimeType = inferMimeFromName(fileName);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    console.log(`[document-ai-process] ${fileName} (${mimeType})`);

    let extraction: { text: string; pages: number; engine: string };
    const bytes = base64ToBytes(fileBase64);

    // ── Roteamento por tipo ──
    if (DOC_AI_MIMES.has(mimeType)) {
      const DOC_AI_KEY = Deno.env.get("GOOGLE_DOCUMENT_AI_API_KEY");
      const projectId = body.projectId ?? Deno.env.get("GOOGLE_DOC_AI_PROJECT_ID");
      const location = body.location ?? Deno.env.get("GOOGLE_DOC_AI_LOCATION") ?? "us";
      const processorId = body.processorId ?? Deno.env.get("GOOGLE_DOC_AI_PROCESSOR_ID");

      if (!DOC_AI_KEY) throw new Error("GOOGLE_DOCUMENT_AI_API_KEY não configurada");
      if (!projectId || !processorId) {
        return new Response(
          JSON.stringify({
            error: "Para PDFs/imagens é necessário configurar Project ID e Processor ID do Document AI.",
            missing: { projectId: !projectId, processorId: !processorId },
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      extraction = await extractFromDocumentAI(fileBase64, mimeType, projectId, location, processorId, DOC_AI_KEY);
      await trackUsage({
        type: "ocr", provider: "google", service: "document_ai",
        document_id: (body as any).documentId ?? null,
        requests: extraction.pages || 1,
        metadata: { fileName, mimeType, engine: extraction.engine },
      });
    } else if (SPREADSHEET_MIMES.has(mimeType)) {
      extraction = mimeType === "text/csv" || mimeType === "text/tab-separated-values"
        ? extractFromCsv(bytes)
        : extractFromSpreadsheet(bytes);
    } else if (WORD_MIMES.has(mimeType)) {
      extraction = await extractFromDocx(bytes);
    } else if (TEXT_MIMES.has(mimeType)) {
      extraction = extractFromText(bytes);
    } else {
      return new Response(
        JSON.stringify({
          error: `Formato não suportado: ${mimeType}. Suportados: PDF, imagens, XLSX, XLS, CSV, DOCX, TXT, RTF.`,
        }),
        { status: 415, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!extraction.text.trim()) {
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair texto do documento" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[document-ai-process] Extração ok: ${extraction.engine} → ${extraction.text.length} chars`);

    // Truncar para não estourar o contexto do Gemini
    const MAX_CHARS = 120_000;
    const inputText = extraction.text.length > MAX_CHARS
      ? extraction.text.slice(0, MAX_CHARS) + "\n\n[... TEXTO TRUNCADO ...]"
      : extraction.text;

    // ── Estruturação via Gemini ──
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: STRUCTURE_PROMPT },
          {
            role: "user",
            content: `Arquivo: ${fileName}\nFormato: ${mimeType}\nEngine de extração: ${extraction.engine}\n\nTEXTO EXTRAÍDO:\n${inputText}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit. Tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResp.text();
      console.error("Gemini error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "Falha na estruturação via IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content ?? "";
    const extracted = extractJson(content);

    return new Response(
      JSON.stringify({
        ok: true,
        pipeline: `${extraction.engine} → gemini-2.5-flash`,
        ocr: { pages: extraction.pages, chars: extraction.text.length, engine: extraction.engine },
        extracted,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("document-ai-process error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
