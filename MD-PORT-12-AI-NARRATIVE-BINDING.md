# MD-PORT-12 — AI Narrative Binding (Vínculo Determinístico IA ↔ Fatos Contábeis)

> Escopo: como o front-end (`src/services/auditAIService.ts`) monta o payload enviado à Edge
> Function `supabase/functions/audit-analyze/index.ts`, como o `SYSTEM_PROMPT` e o `userPrompt`
> são construídos literalmente, como os `deterministicFacts` (bloco de "verdade contábil
> absoluta") são serializados, como a resposta JSON da IA é validada/reparada, e quais são as
> regras de invalidação de cache e os modos de falha esperados.

---

## 1. Visão geral do fluxo

```
Audit.tsx (ResultsPhase)
   │  monta deterministicFacts a partir de bsDadosBuilder + kanitzCalculator
   ▼
auditAIService.analyzeFinancialDataAI(parsed, config, ctx)
   │  ctx = { companyId, periodo, deterministicFacts }
   ▼
POST {SUPABASE_URL}/functions/v1/audit-analyze
   body: { balanco, dre, documentInfo, config, pipeline, deterministicFacts }
   ▼
audit-analyze/index.ts
   │  1. Cache de aprendizado contábil (L0 persistente → L1 exato → L2 embedding → L3 IA)
   │  2. Monta SYSTEM_PROMPT (5 agentes) + userPrompt (config + factsBlock + pipelineBlock + JSON)
   │  3. Chama google/gemini-3-flash-preview via ai.gateway.lovable.dev
   │  4. extractAndRepairJson(content) — parsing tolerante a truncamento
   │  5. Sanity check: sobrescreve campos contábeis que contradigam deterministicFacts (tol. 1%)
   │  6. trackUsage() — grava custo em ai_usage_logs
   ▼
Response { analysis, cacheStats }
```

O princípio central do binding é: **o motor matemático determinístico (BS & Dados / Kanitz)
é a fonte de verdade; a IA é consumidora e narradora, nunca recalculadora dos totais
contábeis-chave** (Ativo Total, Passivo Total, PL, Receita Líquida, Resultado). Isso é reforçado
em três camadas redundantes: (a) instrução textual no prompt, (b) bloco `factsBlock` marcado como
"NÃO-NEGOCIÁVEL", (c) pós-processamento com `diverges()` que sobrescreve valores divergentes >1%.

---

## 2. Chamada no front-end — `src/services/auditAIService.ts`

Trecho relevante (assinatura da função pública que monta o request e injeta `deterministicFacts`
via `ctx`):

```ts
export async function analyzeFinancialDataAI(
  parsed: ParsedFinancialData,
  config: { depth: string; purpose: string; useCache?: boolean },
  ctx?: { companyId?: string | null; periodo?: string | null; deterministicFacts?: any | null }
): Promise<{ analysis: any; cacheStats: any }> {
  // 1. USE EXCLUSIVAMENTE os valores fornecidos no bloco "balanco" e "deterministicFacts".
  // ...
  // Enriquecer documentInfo com contexto para ativar L0 cache (audit_account_cache)
  const documentInfo = {
    ...parsed.documentInfo,
    companyId: ctx?.companyId ?? null,
    periodo: ctx?.periodo ?? null,
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/audit-analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({
      balanco: parsed.balanco,
      dre: parsed.dre,
      documentInfo,
      config,
      pipeline: undefined, // reservado para pipeline pré-processado (few-shot, validação)
      deterministicFacts: ctx?.deterministicFacts ?? null,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return { analysis: data.analysis, cacheStats: data.cacheStats };
}
```

Regra de uso no chamador (`Audit.tsx`): `deterministicFacts` é montado **sempre que houver ao
menos 1 linha em `bsDados`** (resultado de `buildBSDados(parsed, entries)`), independentemente de
quantos meses estejam disponíveis. Nunca se envia `deterministicFacts: undefined` quando há
BS & Dados consolidado — isso é o gatilho que ativa o bloco de fatos no prompt (`facts &&
Array.isArray(facts.bsDados) && facts.bsDados.length > 0`).

### 2.1 Estrutura completa do `deterministicFacts`

```json
{
  "bsDados": [
    {
      "mesKey": "2026-03",
      "mes": "Março 2026",
      "receita_liquida": 1845320.50,
      "cmv": -1102980.10,
      "despesas": -498210.33,
      "resultado": 244130.07,
      "ativo_circulante": 3201540.00,
      "ativo_nao_circulante": 987650.20,
      "ativo_total": 4189190.20,
      "passivo_circulante": 1540220.00,
      "passivo_nao_circulante": 890340.00,
      "passivo_total": 2430560.00,
      "patrimonio_liquido": 1758630.20,
      "estoques": 612340.00,
      "disponivel": 341220.50,
      "divida_financeira": 780000.00,
      "divida_tributaria": 210330.00,
      "divida_trabalhista": 145600.00,
      "fornecedores": 398900.00,
      "credores_rj": 0,
      "divida_total": 1534830.00
    },
    {
      "mesKey": "2026-04",
      "mes": "Abril 2026",
      "receita_liquida": 1902100.00,
      "cmv": -1150430.00,
      "despesas": -512900.00,
      "resultado": 238770.00,
      "ativo_circulante": 3288900.00,
      "ativo_nao_circulante": 975300.00,
      "ativo_total": 4264200.00,
      "passivo_circulante": 1601200.00,
      "passivo_nao_circulante": 872000.00,
      "passivo_total": 2473200.00,
      "patrimonio_liquido": 1791000.00,
      "estoques": 640100.00,
      "disponivel": 355700.00,
      "divida_financeira": 765000.00,
      "divida_tributaria": 224100.00,
      "divida_trabalhista": 150200.00,
      "fornecedores": 412700.00,
      "credores_rj": 0,
      "divida_total": 1552000.00
    },
    {
      "mesKey": "2026-05",
      "mes": "Maio 2026",
      "receita_liquida": 1988760.00,
      "cmv": -1204100.00,
      "despesas": -520330.00,
      "resultado": 264330.00,
      "ativo_circulante": 3355600.00,
      "ativo_nao_circulante": 968100.00,
      "ativo_total": 4323700.00,
      "passivo_circulante": 1588400.00,
      "passivo_nao_circulante": 855900.00,
      "passivo_total": 2444300.00,
      "patrimonio_liquido": 1879400.00,
      "estoques": 655900.00,
      "disponivel": 372100.00,
      "divida_financeira": 748000.00,
      "divida_tributaria": 231400.00,
      "divida_trabalhista": 152800.00,
      "fornecedores": 426300.00,
      "credores_rj": 0,
      "divida_total": 1558500.00
    }
  ],
  "indicadores": [
    { "mes": "Março 2026",  "liquidezCorrente": 2.08, "liquidezSeca": 1.68, "liquidezImediata": 0.22, "cmvPercent": 59.8, "resultadoPercent": 13.2 },
    { "mes": "Abril 2026",  "liquidezCorrente": 2.05, "liquidezSeca": 1.66, "liquidezImediata": 0.22, "cmvPercent": 60.5, "resultadoPercent": 12.6 },
    { "mes": "Maio 2026",   "liquidezCorrente": 2.11, "liquidezSeca": 1.70, "liquidezImediata": 0.23, "cmvPercent": 60.6, "resultadoPercent": 13.3 }
  ],
  "kanitz": [
    { "mesKey": "2026-03", "score": 4.12, "rating": "solvente" },
    { "mesKey": "2026-04", "score": 3.98, "rating": "solvente" },
    { "mesKey": "2026-05", "score": 4.35, "rating": "solvente" }
  ]
}
```

Campos `bsDados[].*` mapeiam 1:1 para as colunas homônimas da tabela `bs_dados`
(ver `docs/BS_DADOS_ESPECIFICACAO.md`, seção 3). `ativo_total`/`passivo_total` são sempre
calculados como `ativo_circulante + ativo_nao_circulante` (grupo 12; **grupo 13/Permanente
NUNCA soma aqui**) e `passivo_circulante + passivo_nao_circulante` respectivamente, tanto no
front quanto no fallback do backend (linhas 698-699 do `audit-analyze/index.ts`).

---

## 3. `SYSTEM_PROMPT` completo (Edge Function) — 5 agentes

O texto abaixo é o `SYSTEM_PROMPT` literal usado em toda chamada a `audit-analyze` (constante
top-level, sem interpolação — é estático):

```
Você é uma plataforma multi-agente de auditoria contábil de nível SÊNIOR composta por 5 agentes que atuam em sequência. Combine ANÁLISE KANITZ AVANÇADA + RELATÓRIO EXECUTIVO ACIONÁVEL.

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
✓ APENAS JSON na resposta
```

---

## 4. `userPrompt` — montagem literal (template string real)

```ts
const userPrompt = `Analise os seguintes dados financeiros usando a pipeline multi-agente (Estruturador → Auditor → Risk Engine → Gerador):

## CONFIGURAÇÃO DA ANÁLISE
- Profundidade: ${config?.depth || "tecnico"}
- Finalidade: ${config?.purpose || "externa"}
${documentInfo ? `- Empresa: ${documentInfo.empresa || "Não informado"}
- Período: ${documentInfo.periodo || "Não informado"}
- Tipo de Documento: ${documentInfo.tipo || "Não informado"}` : ""}
${factsBlock}${pipelineBlock}

${resolvedAccountsBlock}
## BALANÇO PATRIMONIAL ${reducedBalanco !== balanco ? "(somente contas NÃO resolvidas pelo cache — Camada 3)" : ""}
${JSON.stringify(reducedBalanco, null, 2)}

## DRE ${reducedDre !== dre ? "(somente contas NÃO resolvidas pelo cache — Camada 3)" : "(Demonstração do Resultado do Exercício)"}
${JSON.stringify(reducedDre, null, 2)}

Execute os 4 agentes em sequência e gere a análise completa conforme a estrutura JSON solicitada, incluindo:
1. Estruturação contábil consolidada
2. Auditoria financeira com pendências
3. Cálculo de TODOS os indicadores (Liquidez, Endividamento, Kanitz, Score BEX-RJ)
4. Alertas IA e recomendações estratégicas`;
```

### 4.1 `factsBlock` — template literal exato

```ts
const factsBlock = facts ? `
## ⚠️ FATOS DETERMINÍSTICOS — VERDADE CONTÁBIL ABSOLUTA (NÃO REINTERPRETAR)
Estes valores foram consolidados pelo motor matemático BEx a partir do balancete bruto.
São **NÃO-NEGOCIÁVEIS**. NUNCA invente Passivo Total, PL ou Resultado diferentes destes.
Se um indicador depender de Passivo Total ou PL e estes não constarem aqui, marque como "não calculável" — NÃO chute.
**PROIBIDO**: retornar diagnostico.estruturaFinanceira.passivo_total, patrimonio_liquido, ativo_total, resultado, receita_liquida com valores diferentes destes (tolerância 1%).

${facts.bsDados.map((r: any) => (
`### ${r.mes} (${r.mesKey})
- Receita Líquida: ${Number(r.receita_liquida).toFixed(2)}
- CMV: ${Number(r.cmv).toFixed(2)} | Despesas: ${Number(r.despesas).toFixed(2)} | Resultado: ${Number(r.resultado).toFixed(2)}
- Ativo Circulante: ${Number(r.ativo_circulante).toFixed(2)} | Ativo Não Circulante: ${Number(r.ativo_nao_circulante ?? 0).toFixed(2)} | **Ativo Total: ${Number(r.ativo_total ?? (r.ativo_circulante + (r.ativo_nao_circulante ?? 0))).toFixed(2)}**
- Passivo Circulante: ${Number(r.passivo_circulante).toFixed(2)} | Passivo Não Circulante: ${Number(r.passivo_nao_circulante ?? 0).toFixed(2)} | **Passivo Total: ${Number(r.passivo_total ?? (r.passivo_circulante + (r.passivo_nao_circulante ?? 0))).toFixed(2)}**
- **Patrimônio Líquido: ${Number(r.patrimonio_liquido ?? 0).toFixed(2)}**
- Estoques: ${Number(r.estoques).toFixed(2)} | Disponível: ${Number(r.disponivel).toFixed(2)}
- Dívida Financeira: ${Number(r.divida_financeira).toFixed(2)} | Tributária: ${Number(r.divida_tributaria).toFixed(2)} | Trabalhista: ${Number(r.divida_trabalhista).toFixed(2)}
- Fornecedores: ${Number(r.fornecedores).toFixed(2)} | Credores RJ: ${Number(r.credores_rj).toFixed(2)} | Dívida Total: ${Number(r.divida_total).toFixed(2)}`
)).join("\n\n")}

${Array.isArray(facts.indicadores) && facts.indicadores.length > 0 ? `### Indicadores determinísticos (use estes valores diretamente)
${facts.indicadores.map((i: any) => `- ${i.mes}: LC=${i.liquidezCorrente ?? "—"} | LS=${i.liquidezSeca ?? "—"} | LI=${i.liquidezImediata ?? "—"} | CMV%=${i.cmvPercent ?? "—"} | Resultado%=${i.resultadoPercent ?? "—"}`).join("\n")}` : ""}
${Array.isArray(facts.kanitz) && facts.kanitz.length > 0 ? `### Kanitz determinístico (use estes valores — não recalcule)
${facts.kanitz.map((k: any) => `- ${k.mesKey}: K=${k.score} (${k.rating})`).join("\n")}` : ""}
` : "";
```

### 4.2 `pipelineBlock` (opcional — few-shot)

```ts
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
```

### 4.3 `resolvedAccountsBlock` — contexto do cache L1+L2

```ts
if (resolved.length > 0) {
  const sample = resolved.slice(0, 60).map(r =>
    `  • [${r.layer}] ${r.conta_original} → ${r.conta_normalizada} (${r.categoria ?? "?"}) = ${r.valor.toFixed(0)}`
  ).join("\n");
  resolvedAccountsBlock = `
## CONTAS PRÉ-RESOLVIDAS PELO CACHE DE APRENDIZADO (L1+L2)
Total resolvidas: ${resolved.length}/${stats.total} contas (${((resolved.length/stats.total)*100).toFixed(1)}%)
${sample}
${resolved.length > 60 ? `\n  …e mais ${resolved.length - 60} contas resolvidas (omitidas para reduzir tokens)` : ""}

USE estas contas já normalizadas como base. Os blocos abaixo de Balanço/DRE contêm SOMENTE as contas NÃO resolvidas (Camada 3) — analise-as priorizando contexto.
`;
}
```

---

## 5. Chamada ao gateway de IA

```ts
const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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
```

- `temperature: 0.3` — baixa, para reduzir variância narrativa entre execuções com o mesmo
  input (importante para os testes golden do MD-PORT-15).
- `max_tokens: 24000` — suficiente para o JSON completo com `pendencias`, `alertasIA` e
  `relatorioExecutivo` extensos; truncamentos ainda ocorrem em casos extremos (balancetes com
  >150 contas não resolvidas), tratados pelo reparador de JSON (seção 6).

---

## 6. Parsing/validação da resposta — `extractAndRepairJson`

Pipeline de tolerância a falhas, em ordem de tentativa:

1. **Strip de markdown**: remove ```` ```json ```` / ```` ``` ```` e texto antes do primeiro `{`.
2. **Parse direto**: `JSON.parse(cleaned)`.
3. **Sanitização leve**: remove vírgulas finais (`,}` → `}`, `,]` → `]`) e caracteres de controle
   exceto `\n`/`\t`; tenta parse novamente.
4. **Reparo de truncamento** (quando `max_tokens` corta o JSON no meio):
   - Varre a string caractere a caractere contando `{`/`}`/`[`/`]` fora de strings (com suporte a
     escape `\"`), determinando quantos fecham faltam.
   - Se a string termina no meio de uma string JSON (`inString === true`), acrescenta um `"` de
     fechamento.
   - Localiza o último ponto "seguro" de corte (`lastIndexOf` de `},`, `}`, `],`, `]`, `",`, `"`).
   - Se esse ponto estiver a mais de 50% do comprimento total, trunca ali, remove vírgula
     final pendente, e acrescenta `]`/`}` na quantidade exata computada.
   - Tenta `JSON.parse` do resultado reparado; loga `"Successfully repaired truncated JSON"`.
5. Se todas as tentativas falharem: `throw new Error("Não foi possível extrair JSON válido da resposta da IA.")`
   — propagado como erro 500 (`audit-analyze error`) até o front-end.

### 6.1 Sanity override (pós-parse) — enforcement do binding

```ts
if (facts && analysis?.diagnostico?.estruturaFinanceira) {
  const ultimo = facts.bsDados[facts.bsDados.length - 1];
  if (ultimo) {
    const ef = analysis.diagnostico.estruturaFinanceira;
    const tol = 0.01; // 1%
    const diverges = (a: number, b: number) =>
      Math.abs(b) > 1 && Math.abs((Number(a) - b) / b) > tol;
    const ativoTotal = Number(ultimo.ativo_total ?? (ultimo.ativo_circulante + (ultimo.ativo_nao_circulante ?? 0)));
    const passivoTotal = Number(ultimo.passivo_total ?? (ultimo.passivo_circulante + (ultimo.passivo_nao_circulante ?? 0)));
    const pl = Number(ultimo.patrimonio_liquido ?? 0);
    const overrides: string[] = [];
    if (diverges(ef.ativo_total, ativoTotal)) { ef.ativo_total = ativoTotal; overrides.push("ativo_total"); }
    if (diverges(ef.passivo_total, passivoTotal)) { ef.passivo_total = passivoTotal; overrides.push("passivo_total"); }
    if (diverges(ef.patrimonio_liquido, pl)) { ef.patrimonio_liquido = pl; overrides.push("patrimonio_liquido"); }
    if (diverges(ef.receita_liquida, ultimo.receita_liquida)) { ef.receita_liquida = ultimo.receita_liquida; overrides.push("receita_liquida"); }
    if (diverges(ef.lucro_liquido, ultimo.resultado)) { ef.lucro_liquido = ultimo.resultado; overrides.push("lucro_liquido"); }
    if (overrides.length > 0) {
      analysis._sanity_override = { campos: overrides, motivo: "IA contradisse fatos determinísticos; valores substituídos pelo motor matemático" };
      console.warn("[audit-analyze] sanity override:", overrides);
    }
  }
}
```

Notas importantes sobre o comportamento deste bloco:
- **Só compara o último mês** (`facts.bsDados[facts.bsDados.length - 1]`) — o diagnóstico
  narrativo é sempre sobre o período mais recente enviado.
- `diverges()` ignora divergências quando `|b| <= 1` (evita falso-positivo em contas zeradas).
- O campo `analysis._sanity_override` fica **visível no payload retornado ao front-end** e deve
  ser exibido/logado como evidência de auditoria (não removido silenciosamente) — é usado no
  protocolo de evidência do MD-PORT-15.
- Este override cobre apenas os 5 campos de `estruturaFinanceira`; ele **não** corrige
  `indicadoresCalculados`, `kanitz` nem `scoreRJ` — se a IA contradisser o Kanitz determinístico
  do `factsBlock`, isso só é pego visualmente (o front usa o Kanitz calculado localmente via
  `kanitzCalculator`, não o da IA, para a aba "Kanitz").

---

## 7. Cache de aprendizado contábil — regras de invalidação

O cache opera em 4 camadas (L0 a L3), todas dentro da mesma invocação de `audit-analyze`:

| Camada | Fonte | Critério de match | Persistência |
|---|---|---|---|
| L0 | `audit_account_cache` | `conta_original_normalizada` + `company_id` + `periodo` (exato) | leitura direta; hit incrementa `hits` |
| L1 | `contabil_dictionary` | `termo_original_normalizado` exato **e** `frequencia >= 3` | grava upsert em `audit_account_cache` |
| L2 | RPC `match_contabil_dictionary` (embedding) | `match_threshold: 0.85`, top-1 (`match_count: 1`) | grava upsert em `audit_account_cache` |
| L3 | Envio à IA (Gemini Flash) | fallback — contas que sobraram | não persistido diretamente; a IA resolve na narrativa |

### 7.1 Chave de invalidação

O `onConflict` do upsert é **`company_id,periodo,conta_original_normalizada`** — ou seja, o
cache é **escopado por empresa + período**. Isso significa:
- Reprocessar o **mesmo período** da **mesma empresa** com uma conta cujo texto mudou levemente
  (ex.: `"Caixa Geral"` → `"Caixa  Geral"` com espaço duplo) gera uma nova entrada de cache, pois
  `normalizeText()` normaliza espaços — portanto, na prática, variações de espaçamento/acentos/
  caixa NÃO geram nova chave (são absorvidas por `normalizeText`), mas uma mudança semântica
  (`"Caixa Loja 2"` vs `"Caixa Geral"`) sim.
- **Não há invalidação temporal automática** (TTL) — uma vez gravada, a entrada L1/L2 é reusada
  indefinidamente até ser sobrescrita por um novo `upsert` com o mesmo `onConflict`.
- **Invalidação manual**: para forçar re-resolução (ex.: correção de uma classificação errada
  aprendida), é necessário `DELETE FROM audit_account_cache WHERE company_id = ? AND periodo = ?
  AND conta_original_normalizada = ?` — não há endpoint de UI para isso; é operação SQL direta.
- **Cache desativado por request**: `config.useCache === false` desliga toda a Camada L0-L2 —
  todas as contas seguem para a IA (comportamento equivalente a "cold start").
- **`normKeys` vazio** (balanço/DRE sem contas com padrão `conta`+`valor` reconhecível por
  `flattenAccounts`) → cache é pulado silenciosamente (`if (normKeys.length > 0 && ...)`).

### 7.2 Efeito no prompt quando o cache resolve contas

Se `resolved.length > 0`, o balanço/DRE enviados no `userPrompt` são **substituídos** pela
versão reduzida (`reducedBalanco`/`reducedDre` contendo somente `unresolved`). Isso reduz
tokens mas também significa que a IA **nunca vê** as contas já resolvidas por L0/L1/L2 em
formato bruto — apenas o resumo em `resolvedAccountsBlock` (até 60 linhas, truncado com
"...e mais N contas resolvidas"). Esse truncamento de 60 é um modo de falha potencial: se
a narrativa exigir referenciar uma conta específica que caiu além do limite de 60, a IA não
terá visibilidade dela no prompt (mitigado pelo fato de que os *totais* já vêm no `factsBlock`).

---

## 8. Modos de falha e tratamento

| Falha | Causa | Tratamento |
|---|---|---|
| `429 Too Many Requests` | Rate limit do gateway Lovable AI | Retorna `{ error: "Rate limit excedido. Tente novamente em alguns segundos." }`, status 429; front exibe toast e não reprocessa automaticamente |
| `402 Payment Required` | Créditos de workspace esgotados | Retorna `{ error: "Créditos insuficientes. Adicione créditos ao workspace." }`, status 402 |
| Erro genérico do gateway (outro status) | Erro de modelo/infra | Loga `response.status` + corpo bruto; retorna `{ error: "Erro no gateway de IA" }`, status 500 |
| JSON irrecuperável | Truncamento severo ou conteúdo não-JSON | `extractAndRepairJson` lança exceção → capturada no `catch` externo → `{ error: e.message }`, status 500 |
| `LOVABLE_API_KEY` ausente | Configuração de ambiente incompleta | `throw new Error("LOVABLE_API_KEY is not configured")` antes de qualquer chamada de rede |
| Falha na resolução de cache (Supabase indisponível) | Erro de rede/permissão no Supabase | `catch (cacheErr)` interno — loga `"[CACHE] Falhou, seguindo sem cache:"` e segue com `balanco`/`dre` completos (sem cache), sem interromper o fluxo |
| Falha ao persistir cache (upsert) | Constraint/permissão | `catch (persistErr)` interno — loga `"[CACHE] persistência falhou:"`, análise prossegue normalmente (persistência é best-effort) |
| Divergência da IA vs. fatos determinísticos | Alucinação numérica do modelo | Sanity override (seção 6.1) substitui os 5 campos afetados e marca `_sanity_override` — **não é tratado como erro**, é correção silenciosa registrada |
| `trackUsage` falha | Tabela `ai_cost_config`/`ai_usage_logs` indisponível | `catch (e) { console.warn("trackUsage failed:", e) }` — não bloqueia a resposta ao usuário |
| Front-end recebe `response.ok === false` sem JSON parseável | Erro de rede/CORS | `err.json().catch(() => ({ error: "Erro desconhecido" }))` — sempre lança `Error` com mensagem amigável |

### 8.1 Garantias e não-garantias

- **Garantido**: `diagnostico.estruturaFinanceira.{ativo_total, passivo_total,
  patrimonio_liquido, receita_liquida, lucro_liquido}` do último mês nunca divergem de
  `deterministicFacts.bsDados[last]` em mais de 1% (enforced por código, não apenas por prompt).
- **Não garantido**: os 16 indicadores de `indicadoresCalculados`, os componentes de `kanitz` e
  `scoreRJ` retornados pela IA — estes são apenas *sugestões narrativas*; a UI usa os valores
  calculados localmente por `auditDatasetBuilder`/`kanitzCalculator` para exibição numérica,
  reservando o JSON da IA para textos (`pendencias`, `alertasIA`, `relatorioExecutivo`).
- **Não determinístico entre execuções**: mesmo com `temperature: 0.3` e os mesmos
  `deterministicFacts`, o texto de `resumo`, `pontosChave` e `recomendacoes` pode variar entre
  chamadas — os testes golden (MD-PORT-15) validam apenas os campos numéricos protegidos pelo
  sanity override e pelos indicadores calculados localmente, nunca a prosa da IA.
