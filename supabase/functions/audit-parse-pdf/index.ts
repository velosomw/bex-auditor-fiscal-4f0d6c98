import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_PROMPT = `Você é o AGENTE PARSER MULTIFORMATO — um parser contábil especializado da plataforma BEX.

Sua função é reconhecer e interpretar diferentes formatos de arquivos financeiros.

## FORMATOS SUPORTADOS

**PDF (todos os tipos):** PDF padrão, PDF/A (A-1, A-2, A-3), PDF/X (X-1a, X-3, X-4), PDF/E, PDF/UA, PDF/VT, PDF OCR, PAdES (ISO)
**Planilhas Excel:** XLSX, XLSM, XLSB, XLTX, XLTM, XLS
**Documentos:** DOCX, DOC, TXT, RTF
**Dados estruturados:** JSON, XML, OFX (Open Financial Exchange), SPED (Sistema Público de Escrituração Digital)

## CAPACIDADES DE IDENTIFICAÇÃO

Identifique automaticamente o TIPO de documento:
- **Balancete** — lista de contas com saldos (débito/crédito/saldo)
- **Balanço Patrimonial** — Ativo × Passivo + PL
- **DRE** — Demonstração do Resultado do Exercício
- **DFC** — Demonstração de Fluxo de Caixa
- **Extrato Bancário** — movimentações com datas e valores
- **Relatório Financeiro** — análises e indicadores

## INSTRUÇÕES DE EXTRAÇÃO

1. Identifique TODAS as contas contábeis presentes
2. Extraia valores numéricos para cada período/ano
3. Classifique cada conta como BALANÇO ou DRE
4. Preserve a hierarquia contábil (contas sintéticas e analíticas)
5. Se houver múltiplos períodos, extraia todos
6. Converta todos os valores para formato numérico
7. Identifique o tipo/formato do documento
8. Para OFX, extraia transações e saldos bancários
9. Para SPED, identifique blocos e registros contábeis
10. Para XML, interprete a estrutura de tags financeiras

Responda EXCLUSIVAMENTE em JSON válido:

{
  "pdfType": "tipo do documento (PDF/A-1, DOCX, OFX, SPED, etc.)",
  "documentInfo": {
    "empresa": "nome da empresa se identificado",
    "periodo": "período do documento",
    "tipo": "balancete | balanço | dre | dfc | extrato | relatório"
  },
  "years": ["2023", "2022"],
  "balanco": [
    {
      "conta": "1",
      "descricao": "ATIVO TOTAL",
      "values": {"2023": 1000000, "2022": 900000}
    }
  ],
  "dre": [
    {
      "conta": "3.01",
      "descricao": "RECEITA LÍQUIDA",
      "values": {"2023": 500000, "2022": 450000}
    }
  ]
}

REGRAS:
- Extraia TODAS as linhas contábeis, não resuma
- Se não conseguir distinguir Balanço de DRE, coloque tudo em "balanco"
- Valores negativos com sinal negativo
- OCR para documentos digitalizados
- Para OFX: extraia BANKTRANLIST e converta para formato contábil
- Para SPED: extraia registros I150/I155 (balancete) e I350/I355 (DRE)
- Responda APENAS com JSON`;

function extractAndRepairJson(raw: string): Record<string, unknown> {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  if (jsonStart === -1) throw new Error("No JSON object found in AI response");
  cleaned = cleaned.substring(jsonStart);

  try { return JSON.parse(cleaned); } catch { /* continue */ }

  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, (ch) => ch === "\n" || ch === "\t" ? ch : "");

  try { return JSON.parse(cleaned); } catch { /* continue */ }

  let openBraces = 0, openBrackets = 0, inString = false, escape = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") openBraces++;
    else if (ch === "}") openBraces--;
    else if (ch === "[") openBrackets++;
    else if (ch === "]") openBrackets--;
  }

  if (inString) cleaned += '"';

  const lastComplete = Math.max(
    cleaned.lastIndexOf("},"), cleaned.lastIndexOf("}"),
    cleaned.lastIndexOf("],"), cleaned.lastIndexOf("]"),
    cleaned.lastIndexOf('",'), cleaned.lastIndexOf('"'),
  );

  if (lastComplete > cleaned.length * 0.5) {
    const trimmed = cleaned.substring(0, lastComplete + 1);
    let ob = 0, obk = 0, ins = false, esc = false;
    for (let i = 0; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { ins = !ins; continue; }
      if (ins) continue;
      if (c === "{") ob++;
      else if (c === "}") ob--;
      else if (c === "[") obk++;
      else if (c === "]") obk--;
    }

    let repaired = trimmed.replace(/,\s*$/, "");
    for (let i = 0; i < obk; i++) repaired += "]";
    for (let i = 0; i < ob; i++) repaired += "}";

    try {
      console.warn("Successfully repaired truncated JSON");
      return JSON.parse(repaired);
    } catch (e3) {
      console.error("Repair attempt failed:", e3);
    }
  }

  throw new Error("Não foi possível extrair JSON válido da resposta da IA.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileName, mimeType } = await req.json();
    
    if (!fileBase64) {
      return new Response(
        JSON.stringify({ error: "Nenhum arquivo fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log(`Processing file: ${fileName}, type: ${mimeType}, size: ${fileBase64.length} chars base64`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || "application/pdf"};base64,${fileBase64}`,
                },
              },
              {
                type: "text",
                text: `Extraia todos os dados financeiros deste documento (${fileName}). Identifique o tipo de documento (balancete, balanço, DRE, DFC, extrato) e extraia todas as contas contábeis com seus valores.`,
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar documento via IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const extracted = extractAndRepairJson(content);

    console.log(`Document parsed: ${(extracted.balanco as any[])?.length || 0} balanço rows, ${(extracted.dre as any[])?.length || 0} DRE rows, type: ${(extracted.documentInfo as any)?.tipo || extracted.pdfType}`);

    return new Response(
      JSON.stringify({ extracted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("audit-parse-pdf error:", e);
    const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
