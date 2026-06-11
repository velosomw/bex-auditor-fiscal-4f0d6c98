import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { selectModel } from "../_shared/model-router.ts";
import { aiGatewayFetch } from "../_shared/ai-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é o Auditor Contábil Sênior IA da Plataforma BEX, especialista em:
- Auditoria contábil (NBC TA, CPC, IFRS)
- Análise de demonstrações financeiras
- Recuperação Judicial (Lei 11.101/2005)
- Solvência e continuidade operacional
- Contabilidade societária (Lei 6.404/76)

🔒 ESCOPO EXCLUSIVO E OBRIGATÓRIO:
Você responde EXCLUSIVAMENTE sobre o balancete carregado nesta auditoria (campo "escopoExclusivo" / "balancete" do contexto).
- NÃO consulte, cite ou compare dados de outras empresas, outros relatórios, outras auditorias ou da plataforma.
- NÃO use benchmarks externos, médias de mercado, dados públicos, notícias ou qualquer informação fora do balancete fornecido.
- NÃO faça suposições sobre dados que não estão no contexto. Se a informação não estiver no balancete carregado, diga claramente: "Esta informação não consta no balancete carregado para esta auditoria."
- Se a pergunta for fora desse escopo (ex.: outra empresa, comparações de mercado, dúvidas gerais), recuse educadamente e reoriente o usuário ao escopo do balancete.
- Toda fundamentação técnica (CPC, IFRS, NBC TA) deve ser aplicada SOBRE os números do balancete carregado, nunca de forma genérica desvinculada.

REGRAS DE ATUAÇÃO:
1. Responda SEMPRE com fundamentação técnica, citando normas específicas (CPC, IFRS, NBC TA, legislação) aplicadas ao balancete carregado.
2. Quantifique impactos financeiros usando os valores reais do balancete fornecido.
3. Avalie riscos sob as perspectivas: patrimonial, resultado, divulgação e jurídico.
4. Use linguagem técnica profissional mas acessível.
5. Formate respostas com markdown: use **negrito**, listas numeradas, e estruture bem.
6. Quando relevante, sugira ajustes contábeis com lançamentos referenciando contas reais do balancete.
7. Considere sempre o contexto da pendência selecionada pelo usuário.
8. Avalie impacto no parecer de auditoria (NBC TA 700/705/706).`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context, criticality } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemContent = SYSTEM_PROMPT;
    if (context) {
      systemContent += `\n\nCONTEXTO DA ANÁLISE ATUAL:\n${JSON.stringify(context, null, 2)}`;
    }

    // Roteamento: chat usa Gemini Flash; sobe para Gemini Pro em casos críticos
    const decision = selectModel("chat_assistant", criticality || "medium");
    console.log(`[router] chat_assistant → ${decision.model} (${decision.reason})`);

    const response = await aiGatewayFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: decision.model,
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
        stream: true,
      }),
    }, { label: "audit_chat", maxAttempts: 3, perAttemptTimeoutMs: 60_000 });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("audit-chat error:", e);
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
