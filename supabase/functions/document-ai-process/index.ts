import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STRUCTURE_PROMPT = `Você é o AGENTE PARSER CONTÁBIL BEX. Receberá o TEXTO BRUTO já extraído (OCR Google Document AI) de um documento financeiro brasileiro.

Identifique o tipo (Balancete, Balanço Patrimonial, DRE, DFC, Extrato) e estruture TODAS as contas com seus valores por período.

Responda EXCLUSIVAMENTE em JSON válido:
{
  "pdfType": "string",
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
  // Opcionais — sobrescrevem env vars
  projectId?: string;
  location?: string; // ex.: "us" ou "eu"
  processorId?: string;
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    const { fileBase64, fileName = "document.pdf", mimeType = "application/pdf" } = body;

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: "Nenhum arquivo fornecido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const DOC_AI_KEY = Deno.env.get("GOOGLE_DOCUMENT_AI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!DOC_AI_KEY) throw new Error("GOOGLE_DOCUMENT_AI_API_KEY não configurada");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const projectId = body.projectId ?? Deno.env.get("GOOGLE_DOC_AI_PROJECT_ID");
    const location = body.location ?? Deno.env.get("GOOGLE_DOC_AI_LOCATION") ?? "us";
    const processorId = body.processorId ?? Deno.env.get("GOOGLE_DOC_AI_PROCESSOR_ID");

    if (!projectId || !processorId) {
      return new Response(
        JSON.stringify({
          error:
            "Configuração incompleta do Document AI. Informe projectId e processorId (ou configure GOOGLE_DOC_AI_PROJECT_ID e GOOGLE_DOC_AI_PROCESSOR_ID).",
          missing: { projectId: !projectId, processorId: !processorId },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===== STEP 1: OCR via Google Document AI =====
    const docAiUrl = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process?key=${DOC_AI_KEY}`;

    console.log(`[document-ai-process] OCR ${fileName} via processor ${processorId}@${location}`);

    const docAiResp = await fetch(docAiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawDocument: { content: fileBase64, mimeType },
      }),
    });

    if (!docAiResp.ok) {
      const errText = await docAiResp.text();
      console.error("Document AI error:", docAiResp.status, errText);
      return new Response(
        JSON.stringify({ error: `Document AI falhou (${docAiResp.status})`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const docAiData = await docAiResp.json();
    const extractedText: string = docAiData?.document?.text ?? "";
    const pageCount = docAiData?.document?.pages?.length ?? 0;

    if (!extractedText.trim()) {
      return new Response(
        JSON.stringify({ error: "Document AI não extraiu texto do documento" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[document-ai-process] OCR ok: ${pageCount} páginas, ${extractedText.length} chars`);

    // ===== STEP 2: Estruturação contábil via Gemini (Lovable AI Gateway) =====
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: STRUCTURE_PROMPT },
          {
            role: "user",
            content: `Arquivo: ${fileName}\nPáginas OCR: ${pageCount}\n\nTEXTO EXTRAÍDO:\n${extractedText}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit. Tente novamente." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResp.text();
      console.error("Gemini error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "Falha na estruturação via IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content ?? "";
    const extracted = extractJson(content);

    return new Response(
      JSON.stringify({
        ok: true,
        pipeline: "google_document_ai -> gemini-2.5-flash",
        ocr: { pages: pageCount, chars: extractedText.length },
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
