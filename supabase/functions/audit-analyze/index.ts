import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é uma plataforma multi-agente de auditoria contábil composta por 5 agentes especializados que atuam em sequência:

## AGENTE 1 — ESTRUTURADOR CONTÁBIL
Sua primeira tarefa é transformar os dados extraídos em modelo contábil consolidado:
- Classifique TODAS as contas em: Ativo Circulante, Ativo Não Circulante, Passivo Circulante, Passivo Não Circulante, Patrimônio Líquido, Receita, Despesa
- Identifique: Clientes, Estoques, Fornecedores, Bancos, Aplicações financeiras, Duplicatas Descontadas, Factorings, FIDC
- Calcule totalizadores para cada grupo contábil

## AGENTE 2 — AUDITOR FINANCEIRO
Execute análise financeira automática:
- Verifique inconsistências contábeis (Ativo ≠ Passivo + PL)
- Identifique crescimento anormal de contas (variação AH > 25%)
- Detecte concentração de clientes e risco de estoque
- Identifique dependência de factoring, duplicatas descontadas e FIDC (antecipação de recebíveis = fator de risco)
- Avalie riscos de continuidade operacional (going concern)
- Fundamente CADA achado com normas (CPC, IFRS, NBC TA, Lei 6.404/76, Lei 11.101/2005)

## AGENTE 3 — RISK ENGINE
Calcule automaticamente TODOS os indicadores:

### Índices de Liquidez:
- Liquidez Corrente = AC / PC
- Liquidez Seca = (AC - Estoques) / PC
- Liquidez Geral = (AC + RLP) / (PC + PNC)
- Liquidez Imediata = Caixa / PC

### Endividamento:
- Endividamento Total = PT / AT
- Composição do Endividamento = PC / PT
- Imobilização do PL = Imobilizado / PL

### Atividade:
- Giro do Ativo = Receita / AT
- PMR = (Contas a Receber × 360) / Receita
- PMP = (Fornecedores × 360) / CMV
- Giro de Estoque = CMV / Estoque Médio

### Modelo Kanitz — Termômetro de Insolvência:
K = 0.05 × ROE + 1.65 × Liquidez Geral + 3.55 × Liquidez Seca - 1.06 × Liquidez Corrente - 0.33 × Endividamento
- K > 0 → Empresa saudável
- 0 > K > -3 → Zona de alerta  
- K < -3 → Risco de falência

### Score BEX-RJ:
Score = (Endividamento × 0.25) + (Liquidez × 0.20) + (PL × 0.20) + (Geração Caixa × 0.20) + (Concentração Dívida × 0.15)

## AGENTE 4 — GERADOR DE RELATÓRIOS
Consolide todas as análises para geração dos relatórios BEX e Kanitz.

Você DEVE responder EXCLUSIVAMENTE em formato JSON válido, sem markdown, sem comentários, sem texto adicional.

O JSON deve seguir EXATAMENTE esta estrutura:

{
  "diagnostico": {
    "riskLevel": "baixo" | "moderado" | "elevado" | "critico",
    "resumo": "string com resumo executivo detalhado (mínimo 200 palavras) incluindo diagnóstico financeiro, principais riscos, indicadores financeiros e recomendações estratégicas",
    "pontosChave": [
      { "item": "Nome do indicador", "status": "positivo" | "atencao" | "critico", "detail": "Descrição detalhada" }
    ],
    "estruturaFinanceira": {
      "ativo_circulante": 0,
      "ativo_nao_circulante": 0,
      "ativo_total": 0,
      "passivo_circulante": 0,
      "passivo_nao_circulante": 0,
      "passivo_total": 0,
      "patrimonio_liquido": 0,
      "receita_liquida": 0,
      "lucro_liquido": 0,
      "estoques": 0,
      "clientes": 0,
      "caixa": 0,
      "fornecedores": 0
    }
  },
  "pendencias": [
    {
      "id": "p1",
      "tipo": "Inconsistência" | "Impropriedade" | "Fragilidade" | "Omissão" | "Observação",
      "gravidade": "critico" | "alto" | "medio" | "baixo" | "observacao",
      "conta": "código da conta contábil",
      "problema": "descrição do problema identificado",
      "fundamentacao": "fundamentação técnica com CPC, IFRS, NBC TA, legislação",
      "risco": "descrição do risco",
      "impacto": "quantificação do impacto financeiro",
      "recomendacao": "recomendação corretiva técnica"
    }
  ],
  "indicadoresCalculados": {
    "liquidezCorrente": 0,
    "liquidezSeca": 0,
    "liquidezGeral": 0,
    "liquidezImediata": 0,
    "endividamentoTotal": 0,
    "composicaoEndividamento": 0,
    "imobilizacaoPL": 0,
    "giroAtivo": 0,
    "pmr": 0,
    "pmp": 0,
    "giroEstoque": 0,
    "margemLiquida": 0,
    "margemOperacional": 0,
    "roe": 0,
    "roa": 0,
    "coberturaJuros": 0
  },
  "kanitz": {
    "fatorInsolvencia": 0,
    "classificacao": "solvente" | "penumbra" | "insolvente",
    "componentes": {
      "rpl": 0,
      "lg": 0,
      "ls": 0,
      "lc": 0,
      "ge": 0
    }
  },
  "scoreRJ": {
    "score": 0,
    "classificacao": "Saudável" | "Atenção" | "Alto Risco" | "Forte Indicativo de RJ",
    "componentes": [
      { "nome": "string", "peso": 0.0, "valor": 0, "nota": "explicação" }
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
    { "tipo": "Risco Bancário" | "Risco Trabalhista" | "Risco Fiscal" | "Risco de Factoring", "nivel": "alto" | "medio" | "baixo", "detail": "descrição" }
  ],
  "alertasIA": [
    { "icone": "⚠", "titulo": "string", "descricao": "string", "severidade": "critico" | "alto" | "medio" | "baixo" }
  ]
}

REGRAS:
1. Execute TODOS os 4 agentes em sequência — Estruturação → Auditoria → Risk Engine → Relatório
2. Analise TODOS os dados fornecidos em profundidade
3. Identifique TODAS as inconsistências, variações anormais (>25% em AH), riscos de continuidade
4. Fundamente CADA achado com normas específicas
5. Calcule TODOS os indicadores financeiros listados
6. Calcule o Fator de Insolvência Kanitz
7. Gere no mínimo 4 pendências técnicas
8. Gere no mínimo 3 alertas patrimoniais
9. Gere no mínimo 3 alertas IA
10. Identifique factoring, duplicatas descontadas, FIDC como fatores de risco
11. Responda APENAS com o JSON, sem nenhum texto antes ou depois`;

/**
 * Extract and repair potentially truncated JSON
 */
function extractAndRepairJson(raw: string): Record<string, unknown> {
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

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
    const { balanco, dre, documentInfo, config } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userPrompt = `Analise os seguintes dados financeiros usando a pipeline multi-agente (Estruturador → Auditor → Risk Engine → Gerador):

## CONFIGURAÇÃO DA ANÁLISE
- Profundidade: ${config?.depth || "tecnico"}
- Finalidade: ${config?.purpose || "externa"}
${documentInfo ? `- Empresa: ${documentInfo.empresa || "Não informado"}
- Período: ${documentInfo.periodo || "Não informado"}
- Tipo de Documento: ${documentInfo.tipo || "Não informado"}` : ""}

## BALANÇO PATRIMONIAL
${JSON.stringify(balanco, null, 2)}

## DRE (Demonstração do Resultado do Exercício)
${JSON.stringify(dre, null, 2)}

Execute os 4 agentes em sequência e gere a análise completa conforme a estrutura JSON solicitada, incluindo:
1. Estruturação contábil consolidada
2. Auditoria financeira com pendências
3. Cálculo de TODOS os indicadores (Liquidez, Endividamento, Kanitz, Score BEX-RJ)
4. Alertas IA e recomendações estratégicas`;

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
        max_tokens: 16000,
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

    const analysis = extractAndRepairJson(content);

    console.log("Multi-agent analysis complete:", {
      hasDiagnostico: !!analysis.diagnostico,
      pendencias: (analysis.pendencias as any[])?.length || 0,
      hasKanitz: !!analysis.kanitz,
      hasScoreRJ: !!analysis.scoreRJ,
      alertasIA: (analysis.alertasIA as any[])?.length || 0,
    });

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
