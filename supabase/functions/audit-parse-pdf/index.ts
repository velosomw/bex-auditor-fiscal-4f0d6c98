import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_PROMPT = `Você é um especialista em extração de dados financeiros de documentos contábeis.

Analise o documento fornecido e extraia TODOS os dados financeiros estruturados.

O documento pode estar em QUALQUER formato, incluindo:

**PDF (todos os tipos):**
- PDF padrão com texto selecionável
- PDF/A (ISO 19005) em todas as variantes (A-1, A-2, A-3)
- PDF/X (X-1a, X-3, X-4)
- PDF/E, PDF/UA, PDF/VT
- PDF digitalizado (OCR necessário)
- PDF com assinatura digital (PAdES - ISO)
- PDFs com tabelas, gráficos e formatação complexa

**Planilhas Excel (todos os tipos):**
- XLSX (Excel padrão)
- XLSM (Excel com macros)
- XLSB (Excel binário)
- XLTX (Template Excel)
- XLTM (Template Excel com macros)
- XLS (Excel 97-2003)

**Documentos de texto:**
- DOCX / DOC (Microsoft Word)
- TXT (texto puro)
- RTF (Rich Text Format)

INSTRUÇÕES:
1. Identifique TODAS as contas contábeis presentes no documento
2. Extraia os valores numéricos para cada período/ano disponível
3. Classifique cada conta como pertencente ao BALANÇO PATRIMONIAL ou à DRE
4. Preserve a hierarquia contábil (contas sintéticas e analíticas)
5. Se houver dados de múltiplos períodos, extraia todos
6. Converta todos os valores para formato numérico (sem formatação)
7. Identifique o tipo/formato do documento quando possível
8. Para documentos Word/TXT, interprete tabelas, listas e dados tabulares como dados contábeis

Responda EXCLUSIVAMENTE em JSON válido com esta estrutura:

{
  "pdfType": "tipo do documento identificado (ex: PDF/A-1, DOCX, TXT, XLSX, etc.)",
  "documentInfo": {
    "empresa": "nome da empresa se identificado",
    "periodo": "período do documento",
    "tipo": "tipo do demonstrativo (Balanço, DRE, Balancete, etc.)"
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
- Valores negativos devem ser representados com sinal negativo
- Se o documento for digitalizado (imagem), faça OCR e extraia os dados
- Para documentos Word, interprete formatação de tabelas e dados tabulados
- Para arquivos TXT, identifique padrões tabulares (separados por tab, espaços ou delimitadores)
- Responda APENAS com JSON, sem texto adicional`;
- Responda APENAS com JSON, sem texto adicional`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileName, mimeType } = await req.json();
    
    if (!fileBase64) {
      return new Response(
        JSON.stringify({ error: "Nenhum arquivo PDF fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log(`Processing PDF: ${fileName}, type: ${mimeType}, size: ${fileBase64.length} chars base64`);

    // Use Gemini with inline document data for PDF processing
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
                text: `Extraia todos os dados financeiros deste documento PDF (${fileName}). Identifique o tipo/formato do PDF e extraia todas as contas contábeis com seus valores.`,
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
        JSON.stringify({ error: "Erro ao processar PDF via IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the AI response
    let extracted;
    try {
      extracted = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[1].trim());
      } else {
        const braceStart = content.indexOf("{");
        const braceEnd = content.lastIndexOf("}");
        if (braceStart !== -1 && braceEnd !== -1) {
          extracted = JSON.parse(content.slice(braceStart, braceEnd + 1));
        } else {
          throw new Error("Não foi possível extrair dados estruturados do PDF");
        }
      }
    }

    console.log(`PDF parsed successfully: ${extracted.balanco?.length || 0} balanço rows, ${extracted.dre?.length || 0} DRE rows, type: ${extracted.pdfType}`);

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
