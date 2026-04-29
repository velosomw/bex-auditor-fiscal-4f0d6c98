import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════════
// CACHE DE APRENDIZADO CONTÁBIL — Camadas 1-3
// L1: pré-normalização local via contabil_dictionary (match exato)
// L2: RAG por embedding (match_contabil_dictionary)
// L3: envia ao Flash somente contas novas (dedupe + chunking)
// ═══════════════════════════════════════════════════════════════

function normalizeText(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface AccountRow { conta_original: string; valor: number; origem: "balanco" | "dre" }
interface ResolvedAccount extends AccountRow {
  conta_normalizada: string;
  categoria?: string;
  subcategoria?: string;
  layer: "L1_exact" | "L2_embedding" | "L3_ai";
  similarity?: number;
}

function flattenAccounts(payload: any, origem: "balanco" | "dre"): AccountRow[] {
  const out: AccountRow[] = [];
  const walk = (node: any) => {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node === "object") {
      const keys = Object.keys(node);
      const hasConta = keys.some(k => /conta|descric|nome|titulo/i.test(k));
      const hasValor = keys.some(k => /valor|saldo|total|montante/i.test(k));
      if (hasConta && hasValor) {
        const contaKey = keys.find(k => /conta|descric|nome|titulo/i.test(k))!;
        const valorKey = keys.find(k => /valor|saldo|total|montante/i.test(k))!;
        const v = Number(node[valorKey]);
        const c = String(node[contaKey] ?? "").trim();
        if (c && Number.isFinite(v)) out.push({ conta_original: c, valor: v, origem });
      }
      for (const k of keys) walk(node[k]);
    }
  };
  walk(payload);
  // dedupe por conta+valor
  const seen = new Set<string>();
  return out.filter(r => {
    const k = `${normalizeText(r.conta_original)}|${r.valor.toFixed(2)}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/text-embedding-004", input: text }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

async function resolveAccounts(
  accounts: AccountRow[],
  sb: any,
  apiKey: string,
): Promise<{
  resolved: ResolvedAccount[];
  unresolved: AccountRow[];
  stats: { total: number; l1: number; l2: number; l3: number; tokensSaved: number };
}> {
  const resolved: ResolvedAccount[] = [];
  const unresolved: AccountRow[] = [];

  // ─── L1: match exato no contabil_dictionary ───
  const normMap = new Map(accounts.map(a => [normalizeText(a.conta_original), a]));
  const normKeys = Array.from(normMap.keys());

  let dict: any[] = [];
  if (normKeys.length > 0) {
    const { data } = await sb
      .from("contabil_dictionary")
      .select("termo_original, termo_original_normalizado, termo_padrao, categoria, subcategoria, frequencia")
      .in("termo_original_normalizado", normKeys);
    dict = data ?? [];
  }
  const dictByNorm = new Map(dict.map((d: any) => [d.termo_original_normalizado, d]));

  const l1Hits: AccountRow[] = [];
  const remaining: AccountRow[] = [];
  for (const a of accounts) {
    const hit = dictByNorm.get(normalizeText(a.conta_original));
    if (hit && (hit.frequencia ?? 0) >= 3) {
      resolved.push({
        ...a,
        conta_normalizada: hit.termo_padrao,
        categoria: hit.categoria,
        subcategoria: hit.subcategoria,
        layer: "L1_exact",
      });
      l1Hits.push(a);
    } else {
      remaining.push(a);
    }
  }

  // ─── L2: RAG por embedding (apenas para não resolvidas em L1) ───
  // Limita L2 às top 25 contas mais "valiosas" (por |valor|) para controlar custo de embedding
  const sortedRemaining = [...remaining].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const l2Candidates = sortedRemaining.slice(0, 25);
  const l2Skipped = sortedRemaining.slice(25);

  for (const a of l2Candidates) {
    const emb = await generateEmbedding(a.conta_original, apiKey);
    if (!emb) { unresolved.push(a); continue; }
    const { data: matches } = await sb.rpc("match_contabil_dictionary", {
      query_embedding: emb,
      match_threshold: 0.85,
      match_count: 1,
    });
    const top = matches?.[0];
    if (top) {
      resolved.push({
        ...a,
        conta_normalizada: top.termo_padrao,
        categoria: top.categoria,
        layer: "L2_embedding",
        similarity: Number(top.similarity ?? 0),
      });
    } else {
      unresolved.push(a);
    }
  }
  unresolved.push(...l2Skipped);

  const l1 = l1Hits.length;
  const l2 = resolved.length - l1;
  const l3 = unresolved.length;
  // Estimativa de tokens economizados (~4 chars/token; conta + valor ~ 60 chars cada)
  const tokensSaved = Math.round(((l1 + l2) * 60) / 4);

  return {
    resolved,
    unresolved,
    stats: { total: accounts.length, l1, l2, l3, tokensSaved },
  };
}

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

const SYSTEM_PROMPT = `Você é uma plataforma multi-agente de auditoria contábil de nível SÊNIOR composta por 5 agentes que atuam em sequência. Combine ANÁLISE KANITZ AVANÇADA + RELATÓRIO EXECUTIVO ACIONÁVEL.

═══════════════════════════════════════════════════════════════
## AGENTE 1 — ESTRUTURADOR CONTÁBIL
═══════════════════════════════════════════════════════════════
Transforme os dados extraídos em modelo contábil consolidado:
- Classifique TODAS as contas em: Ativo Circulante, Ativo Não Circulante, Passivo Circulante, Passivo Não Circulante, Patrimônio Líquido, Receita, Custo, Despesa
- Identifique e totalize: Clientes, Estoques, Fornecedores, Bancos, Aplicações financeiras, Duplicatas Descontadas, Factoring, FIDC

═══════════════════════════════════════════════════════════════
## AGENTE 2 — VALIDADOR CONTÁBIL (CRÍTICO — execute SEMPRE)
═══════════════════════════════════════════════════════════════
VERIFIQUE OBRIGATORIAMENTE:
- Ativo = Passivo + PL (tolerância 2%)
- Receita − Despesas = Resultado coerente
- Contas duplicadas ou com sinal invertido
- Valores anômalos (zero, negativo onde não deveria)
Se houver inconsistência → registre em "pendencias" com gravidade adequada.

═══════════════════════════════════════════════════════════════
## AGENTE 3 — AUDITOR FINANCEIRO
═══════════════════════════════════════════════════════════════
Execute análise técnica APROFUNDADA:
- Variação horizontal (AH) > 25% = anômalo → investigar
- Concentração de clientes / risco de estoque parado
- Dependência de antecipação de recebíveis (factoring/FIDC/dupl. descontadas) = ALERTA DE LIQUIDEZ
- Going concern — sinais: PL negativo, prejuízos sucessivos, LC < 1
- Fundamente CADA achado com norma específica (CPC, IFRS, NBC TA, Lei 6.404/76, Lei 11.101/2005)

═══════════════════════════════════════════════════════════════
## AGENTE 4 — RISK ENGINE (cálculos automáticos)
═══════════════════════════════════════════════════════════════

### Liquidez:
- LC = AC / PC | LS = (AC − Estoques) / PC | LG = (AC + RLP) / (PC + PNC) | LI = Caixa / PC

### Endividamento:
- ET = PT / AT | CE = PC / PT | ImobPL = Imobilizado / PL

### Atividade:
- Giro Ativo = Receita / AT | PMR = (Clientes × 360) / Receita | PMP = (Fornecedores × 360) / CMV | Giro Estoque = CMV / Estoque Médio

### Rentabilidade:
- Margem Líquida, Margem Operacional, ROE, ROA, Cobertura de Juros

### Modelo Kanitz — Termômetro de Insolvência:
X1 = LL / PL | X2 = (AC + RLP) / (PC + ELP) | X3 = (AC − Estoques) / PC | X4 = AC / PC | X5 = − ((PC + ELP) / PL)
**FI = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5**
- FI > 0 → Solvência | 0 ≥ FI ≥ −3 → Penumbra | FI < −3 → Insolvência

### Score BEX-RJ:
Score = Endividamento×0.25 + Liquidez×0.20 + PL×0.20 + Geração Caixa×0.20 + Concentração Dívida×0.15

═══════════════════════════════════════════════════════════════
## AGENTE 5 — GERADOR DE RELATÓRIO EXECUTIVO
═══════════════════════════════════════════════════════════════
Linguagem profissional, OBJETIVA, FOCO EM DECISÃO.
- Resumo executivo (mín. 200 palavras): diagnóstico + riscos + recomendações
- Insights ACIONÁVEIS (não descritivos): "Custos consomem X% da receita — renegociar fornecedor Y"
- Recomendações com prioridade e prazo

═══════════════════════════════════════════════════════════════
## REGRAS GLOBAIS
═══════════════════════════════════════════════════════════════
1. NÃO INVENTE dados — base-se APENAS nos números fornecidos
2. Se um dado faltar → declare "não disponível" em vez de assumir
3. Use os DADOS NORMALIZADOS PELO PIPELINE como base preferencial
4. Use os EXEMPLOS VALIDADOS (few-shot) como padrão de qualidade
5. Responda EXCLUSIVAMENTE em JSON válido — sem markdown, sem texto antes/depois

═══════════════════════════════════════════════════════════════
## ESTRUTURA JSON OBRIGATÓRIA
═══════════════════════════════════════════════════════════════
{
  "diagnostico": {
    "riskLevel": "baixo" | "moderado" | "elevado" | "critico",
    "resumo": "string (mín. 200 palavras) — diagnóstico + riscos + indicadores + recomendações estratégicas",
    "pontosChave": [{ "item": "string", "status": "positivo" | "atencao" | "critico", "detail": "string" }],
    "estruturaFinanceira": {
      "ativo_circulante": 0, "ativo_nao_circulante": 0, "ativo_total": 0,
      "passivo_circulante": 0, "passivo_nao_circulante": 0, "passivo_total": 0,
      "patrimonio_liquido": 0, "receita_liquida": 0, "lucro_liquido": 0,
      "estoques": 0, "clientes": 0, "caixa": 0, "fornecedores": 0
    }
  },
  "validacaoContabil": {
    "valido": true, "ativo_total": 0, "passivo_pl_total": 0, "diferenca": 0,
    "erros": [], "alertas": []
  },
  "pendencias": [
    {
      "id": "p1",
      "tipo": "Inconsistência" | "Impropriedade" | "Fragilidade" | "Omissão" | "Observação",
      "gravidade": "critico" | "alto" | "medio" | "baixo" | "observacao",
      "conta": "código/descrição",
      "problema": "descrição técnica",
      "fundamentacao": "CPC/IFRS/NBC TA/Lei específicos",
      "risco": "descrição",
      "impacto": "quantificação financeira",
      "recomendacao": "ação corretiva específica"
    }
  ],
  "indicadoresCalculados": {
    "liquidezCorrente": 0, "liquidezSeca": 0, "liquidezGeral": 0, "liquidezImediata": 0,
    "endividamentoTotal": 0, "composicaoEndividamento": 0, "imobilizacaoPL": 0,
    "giroAtivo": 0, "pmr": 0, "pmp": 0, "giroEstoque": 0,
    "margemLiquida": 0, "margemOperacional": 0, "roe": 0, "roa": 0, "coberturaJuros": 0
  },
  "kanitz": {
    "fatorInsolvencia": 0,
    "classificacao": "solvente" | "penumbra" | "insolvente",
    "componentes": { "rpl": 0, "lg": 0, "ls": 0, "lc": 0, "ge": 0 }
  },
  "scoreRJ": {
    "score": 0,
    "classificacao": "Saudável" | "Atenção" | "Alto Risco" | "Forte Indicativo de RJ",
    "componentes": [{ "nome": "string", "peso": 0.0, "valor": 0, "nota": "string" }]
  },
  "alertasPatrimoniais": [
    { "conta": "código — descrição", "alerta": "pergunta sobre risco", "detail": "valores", "gravidade": "alto" | "medio" | "baixo" }
  ],
  "riscosEndividamento": [
    { "tipo": "Risco Bancário" | "Risco Trabalhista" | "Risco Fiscal" | "Risco de Factoring", "nivel": "alto" | "medio" | "baixo", "detail": "descrição" }
  ],
  "alertasIA": [
    { "icone": "⚠", "titulo": "string", "descricao": "insight ACIONÁVEL (não descritivo)", "severidade": "critico" | "alto" | "medio" | "baixo" }
  ],
  "relatorioExecutivo": {
    "resumo_executivo": "parágrafo executivo",
    "diagnostico": "diagnóstico técnico-financeiro",
    "pontos_atencao": ["ponto 1", "ponto 2"],
    "recomendacoes": [
      { "prioridade": "alta" | "media" | "baixa", "acao": "recomendação acionável", "prazo": "imediato | 30d | 90d" }
    ]
  }
}

CHECKLIST FINAL antes de responder:
✓ Validação contábil executada (Ativo = Passivo + PL)
✓ TODOS os 16 indicadores calculados
✓ Kanitz FI calculado com fórmula completa
✓ Mínimo 4 pendências fundamentadas em normas
✓ Mínimo 3 alertas patrimoniais e 3 alertas IA acionáveis
✓ Factoring/FIDC/dupl. descontadas identificados se presentes
✓ Relatório executivo com recomendações priorizadas
✓ APENAS JSON na resposta`;

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
    const { balanco, dre, documentInfo, config, pipeline } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Pipeline pré-processamento (opcional): contas normalizadas + few-shot + validação
    const pipelineBlock = pipeline
      ? `
## DADOS NORMALIZADOS PELO PIPELINE IA (use como base preferencial)
- Score de qualidade do parsing: ${(pipeline.quality_score * 100).toFixed(1)}%
- Validação contábil: Ativo=${pipeline.validation?.ativo?.toFixed(0)}, Passivo=${pipeline.validation?.passivo?.toFixed(0)}, PL=${pipeline.validation?.pl?.toFixed(0)}, válido=${pipeline.validation?.valid}
- Alertas do validador: ${(pipeline.validation?.alertas || []).join(" | ") || "nenhum"}
- Contas normalizadas (top 30):
${(pipeline.normalized || []).slice(0, 30).map((r: any) => `  • ${r.conta_normalizada} [${r.categoria}] = ${r.valor.toFixed(0)}`).join("\n")}
${(pipeline.few_shot_examples || []).length > 0 ? `
## EXEMPLOS DE ANÁLISES VALIDADAS POR AUDITORES (few-shot — siga padrões similares)
${(pipeline.few_shot_examples || []).slice(0, 3).map((ex: any, i: number) => `Exemplo ${i + 1}: ${JSON.stringify(ex.output).slice(0, 600)}`).join("\n\n")}
` : ""}
`
      : "";

    const userPrompt = `Analise os seguintes dados financeiros usando a pipeline multi-agente (Estruturador → Auditor → Risk Engine → Gerador):

## CONFIGURAÇÃO DA ANÁLISE
- Profundidade: ${config?.depth || "tecnico"}
- Finalidade: ${config?.purpose || "externa"}
${documentInfo ? `- Empresa: ${documentInfo.empresa || "Não informado"}
- Período: ${documentInfo.periodo || "Não informado"}
- Tipo de Documento: ${documentInfo.tipo || "Não informado"}` : ""}
${pipelineBlock}
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
        max_tokens: 24000,
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

    await trackUsage({
      type: "relatorio", provider: "google", service: "gemini_flash",
      document_id: (documentInfo as any)?.documentId ?? null,
      tokens_input: data.usage?.prompt_tokens ?? Math.ceil(userPrompt.length / 4),
      tokens_output: data.usage?.completion_tokens ?? Math.ceil(content.length / 4),
      requests: 1,
      metadata: { model: "gemini-3-flash-preview", phase: "insight", empresa: (documentInfo as any)?.empresa ?? null },
    });

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
