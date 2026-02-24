import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um Agente IA Auditor Contábil Sênior, especialista em análise de demonstrações financeiras, auditoria contábil, recuperação judicial e solvência empresarial.

Sua tarefa é analisar os dados financeiros fornecidos e gerar uma análise técnica completa e estruturada.

Você DEVE responder EXCLUSIVAMENTE em formato JSON válido, sem markdown, sem comentários, sem texto adicional fora do JSON.

O JSON deve seguir EXATAMENTE esta estrutura:

{
  "diagnostico": {
    "riskLevel": "baixo" | "moderado" | "elevado" | "critico",
    "resumo": "string com resumo executivo detalhado (mínimo 200 palavras)",
    "pontosChave": [
      { "item": "Nome do indicador", "status": "positivo" | "atencao" | "critico", "detail": "Descrição detalhada" }
    ]
  },
  "pendencias": [
    {
      "id": "p1",
      "tipo": "Inconsistência" | "Impropriedade" | "Fragilidade" | "Omissão" | "Observação",
      "gravidade": "critico" | "alto" | "medio" | "baixo" | "observacao",
      "conta": "código da conta contábil",
      "problema": "descrição do problema identificado",
      "fundamentacao": "fundamentação técnica com referências a CPC, IFRS, NBC TA, legislação",
      "risco": "descrição do risco envolvido",
      "impacto": "quantificação do impacto financeiro",
      "recomendacao": "recomendação corretiva técnica"
    }
  ],
  "scoreRJ": {
    "score": 0-100,
    "classificacao": "Saudável" | "Atenção" | "Alto Risco" | "Forte Indicativo de RJ",
    "componentes": [
      { "nome": "string", "peso": 0.0-1.0, "valor": 0-100, "nota": "explicação" }
    ]
  },
  "alertasPatrimoniais": [
    {
      "conta": "código — descrição",
      "alerta": "pergunta sobre o risco",
      "detail": "detalhes com valores",
      "gravidade": "alto" | "medio" | "baixo"
    }
  ],
  "riscosEndividamento": [
    { "tipo": "Risco Bancário" | "Risco Trabalhista" | "Risco Fiscal", "nivel": "alto" | "medio" | "baixo", "detail": "descrição" }
  ]
}

REGRAS:
1. Analise TODOS os dados fornecidos em profundidade
2. Identifique TODAS as inconsistências, variações anormais (>25% em AH), riscos de continuidade
3. Fundamente CADA achado com normas específicas (CPC, IFRS, NBC TA, Lei 6.404/76, Lei 11.101/2005)
4. Quantifique impactos financeiros sempre que possível
5. O Score BEX-RJ deve considerar: Endividamento (25%), Liquidez (20%), PL (20%), Geração de Caixa (20%), Concentração de Dívida (15%)
6. Gere no mínimo 4 pendências técnicas
7. Gere no mínimo 3 alertas patrimoniais
8. Responda APENAS com o JSON, sem nenhum texto antes ou depois`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { balanco, dre, config } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userPrompt = `Analise os seguintes dados financeiros:

## CONFIGURAÇÃO DA ANÁLISE
- Profundidade: ${config?.depth || "tecnico"}
- Finalidade: ${config?.purpose || "externa"}

## BALANÇO PATRIMONIAL
${JSON.stringify(balanco, null, 2)}

## DRE (Demonstração do Resultado do Exercício)
${JSON.stringify(dre, null, 2)}

Gere a análise completa conforme a estrutura JSON solicitada.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse AI response - extract JSON from potential markdown wrapping
    let analysis;
    try {
      // Try direct parse first
      analysis = JSON.parse(content);
    } catch {
      // Try extracting from markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1].trim());
      } else {
        // Try finding JSON object in the response
        const braceStart = content.indexOf("{");
        const braceEnd = content.lastIndexOf("}");
        if (braceStart !== -1 && braceEnd !== -1) {
          analysis = JSON.parse(content.slice(braceStart, braceEnd + 1));
        } else {
          throw new Error("Could not parse AI response as JSON");
        }
      }
    }

    return new Response(JSON.stringify({ analysis }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("audit-analyze error:", e);
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
