# MD-PORT-12 — AI Narrative Binding (deterministicFacts, Prompts, Insights)

## 1. Objetivo
Especificar, com o texto real dos prompts e o fluxo real de dados de `src/services/auditAIService.ts`, como a narrativa gerada por IA é vinculada (bound) aos fatos determinísticos do balancete — proibindo terminantemente fallback de valores "legados"/inventados —, qual o contrato JSON de saída esperado, como esse resultado é persistido em `insights`, e como funciona a invalidação de cache e o binding por `runtime_trace_id`.

## 2. Escopo
- Função `analyzeFinancialData` (chamada de edge function `audit-analyze`).
- Função `streamAuditChat` (chamada de edge function `audit-chat`, streaming SSE).
- Bloco `deterministicFacts` e `financialConstraints`/`systemInstructions` — textos literais dos prompts.
- Contrato de dados de saída consumido pelo `Audit.tsx` (diagnóstico, problemas, positivos, riscos, recomendações, tendência).
- Binding via `runtime_trace_id`/`canonical_snapshot_id` (interface `CanonicalReportDataset`).
- Estratégia de cache (`audit_account_cache`, "L0 cache") e regras de invalidação.

Fora de escopo: parsing/extração de balancete (ver serviços de parsing), renderização visual (MD-PORT-11), gráficos (MD-PORT-13).

## 3. Pré-requisitos
- Variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` configuradas no cliente.
- Edge functions Supabase `audit-analyze` e `audit-chat` publicadas (fora do escopo de frontend, mas o contrato de requisição/resposta é o descrito aqui).
- Estrutura `ParsedFinancialData` (balanço + DRE + anos) já populada antes de chamar `analyzeFinancialData`.
- Snapshot certificado (`CertifiedFinancialSnapshot`), quando disponível, para alimentar `deterministicFacts`.

## 4. Princípio geral: "Hard Financial Binding"
A codebase denomina esse conjunto de regras **"HARD FINANCIAL BINDING PROMPT INSTRUCTIONS"**, referenciado no código-fonte pelo identificador de mudança `MD-BEX-RUNTIME-LINEAGE-ROOT-CAUSE-REMEDIATION-001`. O princípio é: **a IA generativa nunca é fonte de verdade numérica** — ela só pode narrar/qualificar valores que já vieram determinísticamente do motor contábil (`indicatorsEngine`, `bsDadosBuilder`, `canonicalFinancialSnapshotService`). Qualquer tentativa da IA de citar um número que não esteja no payload enviado é considerada "hallucination" e proibida explicitamente no prompt.

## 5. Injeção de `deterministicFacts` — `analyzeFinancialData`
Assinatura real (linhas 964-969 de `auditAIService.ts`):
```ts
export async function analyzeFinancialData(
  parsedData: ParsedFinancialData,
  config: { depth: string; purpose: string },
  pipeline?: PipelineResult | null,
  ctx?: { companyId?: string | null; periodo?: string | null; deterministicFacts?: any | null }
): Promise<any> {
```
O parâmetro `ctx.deterministicFacts` é o canal oficial pelo qual os fatos certificados (PL, Receita, Resultado, Ativo Total, indicadores) chegam à IA. Ele é serializado e enviado literalmente no corpo da requisição:
```ts
body: JSON.stringify({
  balanco: parsedData.balanco,
  dre: parsedData.dre,
  documentInfo: docInfo,
  config: { ...config, customInstructions: financialConstraints },
  pipeline: pipeline ? { normalized: pipeline.normalized, few_shot_examples: pipeline.few_shot_examples, validation: pipeline.validation, quality_score: pipeline.scores.quality } : undefined,
  deterministicFacts: ctx?.deterministicFacts ?? null,
}),
```
Observações de implementação:
- `deterministicFacts` é passado como está — `ctx?.deterministicFacts ?? null` — sem transformação no cliente; a validação/normalização ocorre na edge function `audit-analyze` (fora do frontend).
- O bloco `balanco`/`dre` do `parsedData` é enviado em paralelo — a regra de prompt (§6) instrui a IA a usar SOMENTE esses dois canais (balanco + deterministicFacts), nunca inferir/memorizar valores de treinamento.
- `docInfo` é enriquecido com `companyId`/`periodo` do contexto **apenas se ainda não presentes** (`if (ctx?.companyId && !docInfo.companyId) docInfo.companyId = ctx.companyId;`), para ativar o cache L0 (`audit_account_cache`) por chave `companyId + periodo` — ver §9.

## 6. Prompt literal — `analyzeFinancialData` (`financialConstraints`)
Texto **exato** presente no código (linhas 973-980):
```
⚠️ REGRAS CRÍTICAS DE AUDITORIA (PROIBIDO HALLUCINAR):
1. USE EXCLUSIVAMENTE os valores fornecidos no bloco "balanco" e "deterministicFacts".
2. NUNCA cite valores de Patrimônio Líquido, Receita ou Ativo que não estejam nesses blocos.
3. O Score BEx foi DESATIVADO. Remova qualquer menção a pontuações numéricas (ex: 42.5).
4. Para Março/2026, os valores SOBERANOS são: PL R$ 61.992.771,89, Receita R$ 77.856.316,94, Resultado R$ 1.040.966,90, Ativo Total R$ 331.984.602,00.
```
Este bloco é injetado como `config.customInstructions` no payload enviado à edge function. Regras de replicação:
- A regra 3 ("Score BEx foi DESATIVADO") deve ser preservada literalmente ao portar — o produto **removeu deliberadamente** a pontuação numérica de Score BEx (havia um valor de exemplo "42.5" citado apenas como ilustração do que NÃO deve aparecer).
- A regra 4 fixa um "golden fact" hardcoded para a competência de Março/2026 (usado como ancoragem determinística de regressão/homologação — ver MD-PORT-15). Ao portar para outro ambiente/dataset, este bloco deve ser mantido como está para preservar paridade com os golden tests existentes, e qualquer nova competência "soberana" deve seguir o mesmo padrão de citação (valor por extenso em R$, 2 casas decimais, vírgula decimal).

## 7. Prompt literal — `streamAuditChat` (`systemInstructions`)
Texto **exato** presente no código (linhas 1038-1048), usado para o chat de auditoria assistido:
```
Você é um Auditor Contábil Sênior especializado em BEx/Kanitz.

⚠️ REGRAS CRÍTICAS DE DADOS (PROIBIDO HALLUCINAR):
1. USE EXCLUSIVAMENTE os valores fornecidos no bloco "context" abaixo.
2. NUNCA cite valores de Patrimônio Líquido, Receita ou Ativo que não estejam nesse bloco.
3. Se um campo estiver zerado ou ausente no bloco, declare-o como "Não Disponível" no relatório.
4. O Score BEx foi DESATIVADO. Remova qualquer menção a pontuações numéricas de Score BEx (ex: 42.5). Cite apenas indicadores de solvência individuais (LC, LS, LG, ISG).
5. PROIBIDO INVENTAR NARRATIVAS POSITIVAS PARA INDICADORES "N/A" OU ZERADOS.
6. Para Março/2026, os valores SOBERANOS são: PL R$ 61.992.771,89, Receita R$ 77.856.316,94, Resultado R$ 1.040.966,90, Ativo Total R$ 331.984.602,00. Qualquer divergência no texto é erro de auditoria.
```
Essa instrução é prependada como mensagem `system` antes de qualquer mensagem do usuário:
```ts
const enrichedMessages = [
  { role: "system", content: systemInstructions },
  ...messages
];
```
e enviada ao endpoint:
```ts
const resp = await fetch(`${SUPABASE_URL}/functions/v1/audit-chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
  body: JSON.stringify({ messages: enrichedMessages, context }),
});
```
Regra 5 (**"PROIBIDO INVENTAR NARRATIVAS POSITIVAS PARA INDICADORES 'N/A' OU ZERADOS"**) é a regra-mãe de todo o binding de narrativa: sempre que um indicador está indisponível/zerado, a IA deve declarar isso explicitamente ("Não Disponível"), nunca compensar com um texto genérico otimista.

## 8. Consumo do stream (SSE) — parser
`streamAuditChat` consome um stream SSE compatível com o formato "OpenAI-like" (`data: {...}\n\n`, terminador `data: [DONE]`), lendo via `ReadableStream`/`TextDecoder`:
```ts
const reader = resp.body.getReader();
const decoder = new TextDecoder();
let textBuffer = "";
let streamDone = false;

while (!streamDone) {
  const { done, value } = await reader.read();
  if (done) break;
  textBuffer += decoder.decode(value, { stream: true });
  let newlineIndex: number;
  while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
    let line = textBuffer.slice(0, newlineIndex);
    textBuffer = textBuffer.slice(newlineIndex + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.startsWith(":") || line.trim() === "") continue;
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (jsonStr === "[DONE]") { streamDone = true; break; }
    try {
      const parsed = JSON.parse(jsonStr);
      const content = parsed.choices?.[0]?.delta?.content as string | undefined;
      if (content) onDelta(content);
    } catch {
      textBuffer = line + "\n" + textBuffer; // linha incompleta, aguarda mais bytes
      break;
    }
  }
}
```
Ao final há um "flush" do buffer remanescente para garantir que o último fragmento (sem `\n` final) também seja processado. Esse parser deve ser replicado **exatamente** (incluindo o tratamento de linhas `:`/vazias como heartbeats/comentários SSE) para não perder tokens em streams lentos ou fragmentados por proxy.

## 9. Cache L0 (`audit_account_cache`) e invalidação
A chave de ativação do cache L0 é composta por `companyId + periodo`, enviada dentro de `documentInfo` (`docInfo.companyId`, `docInfo.periodo`), conforme comentário no código:
```ts
// Enriquecer documentInfo com contexto para ativar L0 cache (audit_account_cache)
const docInfo: any = { ...(parsedData.documentInfo || {}) };
if (ctx?.companyId && !docInfo.companyId) docInfo.companyId = ctx.companyId;
if (ctx?.periodo && !docInfo.periodo) docInfo.periodo = ctx.periodo;
```
Regras de invalidação a preservar ao portar:
- O cache é **por competência** (empresa + período/mês) — nunca compartilhado entre competências diferentes, mesmo da mesma empresa.
- Um novo upload de balancete para a mesma competência deve **sempre** invalidar o cache correspondente antes de reprocessar (a edge function é a responsável por essa invalidação no backend; o frontend garante isso enviando `documentId`/hash do arquivo em `parseDocumentAI`/`parseDocumentAI_internal`, que grava/atualiza `ocr_results` com `persisted: data.persisted === true`).
- `runtime_trace_id` (ver §10) NUNCA deve ser reaproveitado entre duas gerações de relatório distintas — cada geração cria um novo trace id, mesmo que o cache de fatos determinísticos (nível conta/balancete) seja reaproveitado.

## 10. Binding por `runtime_trace_id` / `canonical_snapshot_id`
Interface oficial (linhas 55-83 de `Audit.tsx`), que é o "envelope" de dados que amarra narrativa da IA aos fatos:
```ts
export interface CanonicalReportDataset {
  runtime_trace_id: string;
  canonical_snapshot_id: string;
  processing_run_id: string; // MD-CUTOVER-001 §6
  source_file_hash: string;  // MD-CUTOVER-001 §8
  competency: string;
  company_id: string;
  generated_at: string;
  facts: Partial<BSDadosRow> & {
    ativo_circulante: number;
    ativo_nao_circulante: number;
    passivo_circulante: number;
    passivo_nao_circulante: number;
    patrimonio_liquido: number;
    receita_liquida: number;
    resultado_liquido: number;
    estoques: number;
    fornecedores: number;
  };
  ratios: IndicatorRow;
  history: Record<string, IndicatorRow>;
  kanitz: any;
  narratives: Record<string, { text: string; fact_ids_used: string[] }>;
  limitations: string[];
  snapshot?: CertifiedFinancialSnapshot;
  residual?: CertifiedFinancialSnapshot["residual"];
}
```
Pontos de binding obrigatórios:
- `narratives: Record<string, { text: string; fact_ids_used: string[] }>` — cada bloco narrativo é indexado por uma chave (ex.: `"liquidez"`, `"endividamento"`, `"kanitz"`) e **carrega explicitamente** a lista `fact_ids_used` — os identificadores de fatos certificados (`fact_id` do `CertifiedFinancialSnapshot`) que fundamentam aquele texto. Isso é o mecanismo de auditabilidade: qualquer narrativa pode ser rastreada até os fatos numéricos exatos que a originaram.
- `runtime_trace_id` identifica de forma única **uma execução completa do pipeline** (parsing → cálculo → narrativa → render), e é usado, por exemplo, em `ReportFormulas` (`runtimeTraceId` prop) para exibir `Trace: {runtimeTraceId || "N/A"}` no cabeçalho do relatório técnico — permitindo correlacionar visualmente o PDF gerado com os logs de execução.
- `canonical_snapshot_id` referencia o snapshot imutável (`CertifiedFinancialSnapshot`) usado como fonte única de verdade — dois relatórios com o mesmo `canonical_snapshot_id` DEVEM produzir os mesmos fatos numéricos, mesmo que a narrativa textual da IA varie (a IA pode reformular frases, mas nunca os números).
- `source_file_hash` (MD-CUTOVER-001 §8) amarra o dataset ao hash do arquivo de origem — se o hash muda (novo upload), o `runtime_trace_id` deve necessariamente mudar também.
- `processing_run_id` (MD-CUTOVER-001 §6) identifica a execução do pipeline determinístico (separado do trace id de IA), permitindo reprocessamento idempotente.

Flags de congelamento (freeze gates) relevantes, definidas como constantes no topo de `Audit.tsx` e que **não podem ser reativadas/alteradas sem nova aprovação de mudança**:
```ts
const BEX_INCLUDE_KANITZ = false;
const RUNTIME_FORENSIC_CORRECTION_MODE = true; // MD-RUNTIME-PATH-FORENSIC-001
const FINAL_4_RENDERER_GATE_PATCH_FREEZE = true;
const FINAL_4_POINT_CONSUMER_PATCH_FREEZE = true;
const FINAL_RUNTIME_4_BINDING_PATCH_FREEZE = true;
const BEX_PRODUCTION_HOMOLOGATED = true;
const ACCOUNTING_CORE_FREEZE = true;
const FINAL_CORE_FREEZE = true;
const FINAL_CANONICAL_FREEZE = true;
const FINAL_METADATA_FREEZE = true;
const FINAL_COVERAGE_SSOT_FREEZE = true;
```
`BEX_INCLUDE_KANITZ = false` reforça a regra citada em MD-PORT-11 §13: *"Kanitz nunca é montado implicitamente dentro do BEx"* — os dois relatórios são gerados/exportados separadamente (containers `report-bex-container` e `report-kanitz-container` distintos).

## 11. Contrato JSON de saída
Embora a IA retorne texto livre narrativo por seção, o **contrato estrutural** que o frontend espera de volta da análise (`analyzeFinancialData`) — e que deve ser preservado byte-a-byte na porta — inclui os seguintes campos semânticos, presentes na modelagem de dados do relatório BEx (`resumo`, lista de achados/`p{n}`, e o dataset `CanonicalReportDataset.narratives`):

```json
{
  "diagnostico": "string — resumo executivo determinístico, referencia liquidez, endividamento, margem",
  "problemas": [
    {
      "id": "p4",
      "tipo": "Omissão | Inconsistência | Risco",
      "gravidade": "alto | medio | baixo",
      "conta": "2.02.01",
      "problema": "string curta descrevendo o achado",
      "fundamentacao": "string com base legal/normativa (CPC, IAS, Lei 11.101/2005)",
      "risco": "string",
      "impacto": "string com valor monetário quando aplicável",
      "recomendacao": "string"
    }
  ],
  "positivos": ["string — pontos fortes identificados, sempre ancorados em fato certificado"],
  "riscos": ["string — riscos identificados, com fact_ids_used implícitos via narrative binding"],
  "recomendacoes": ["string — ações sugeridas"],
  "tendencia": "melhora | estavel | deterioracao"
}
```
Exemplo real de item `problemas[]` (linha 1588 de `Audit.tsx`):
```json
{
  "id": "p4",
  "tipo": "Omissão",
  "gravidade": "alto",
  "conta": "2.02.01",
  "problema": "Empréstimos LP cresceram 57% — risco de covenant e refinanciamento",
  "fundamentacao": "CPC 25 / IAS 37 — Provisões devem ser reconhecidas quando há obrigação presente. Lei 11.101/2005 — Risco de pedido de recuperação judicial por credores.",
  "risco": "Risco de vencimento antecipado e inadimplência",
  "impacto": "Exposição bancária de R$ 136 milhões em longo prazo",
  "recomendacao": "Avaliar covenants ativos e capacidade de refinanciamento"
}
```
Exemplo real de `diagnostico`/resumo (linha 1573):
> "A empresa apresenta estrutura patrimonial equilibrada com PL positivo, porém com tendência de deterioração nos indicadores de liquidez e aumento expressivo do endividamento oneroso. A margem líquida caiu 60% no período, sinalizando pressão sobre a geração de caixa. O capital de giro líquido permanece positivo, mas com redução relativa frente ao crescimento do passivo circulante. Recomenda-se atenção especial à evolução do passivo oneroso e à capacidade de cobertura de juros."

Regras de validação do contrato ao portar:
- `gravidade` restrito a `{alto, medio, baixo}` — qualquer outro valor deve ser rejeitado/normalizado no frontend antes de renderizar badge de severidade.
- `impacto`, quando monetário, DEVE citar o valor em R$ com o mesmo formato usado nos fatos determinísticos (nunca um valor "aproximado" divergente do fato certificado correspondente).
- `tendencia` é usada para colorir/orientar o texto de fechamento do relatório (ex.: seta de tendência), e deve ser derivada comparando ao menos 2 competências do `history: Record<string, IndicatorRow>`.

## 12. Persistência em `insights` e invalidação de cache
- Após a chamada a `analyzeFinancialData`/geração completa do relatório, o resultado (diagnóstico + achados + narrativas com `fact_ids_used`) é persistido como parte do histórico de auditoria via `saveAuditBatch`/`saveGeneratedReport` (`@/services/auditHistoryService`, tipos `AuditHistoryEntry`/`GeneratedReportEntry`, importados em `Audit.tsx`).
- A camada de "insights automáticos" dos gráficos (`generateInsights`, em `auditChartsOptions.ts`) é **puramente determinística** (não usa IA) — calcula thresholds sobre `MonthlyDatum` (CMV%, margem, liquidez, EBITDA, evolução de dívida) e retorna `ChartInsight[]` com `tipo: "critico" | "atencao" | "info"`. Essa é uma segunda camada de narrativa, complementar à IA generativa, e **nunca deve ser confundida** com o binding de `deterministicFacts` — ela é regra de negócio pura em TypeScript, sem chamada de rede.
- Invalidação: qualquer novo processamento de balancete para a mesma empresa+competência deve gerar um novo `runtime_trace_id` e um novo `canonical_snapshot_id`; o insight anterior (registro em `insights`/histórico) permanece imutável como auditoria histórica, e o novo relatório passa a ser a referência corrente exibida na UI.

## 13. Checklist de Implementação
- [ ] `analyzeFinancialData` envia sempre `balanco`, `dre`, `documentInfo` (enriquecido com `companyId`/`periodo`), `config.customInstructions` = `financialConstraints`, e `deterministicFacts` literal do `ctx`.
- [ ] Texto de `financialConstraints` preservado literalmente (4 regras, incluindo a regra 4 com os valores soberanos de Março/2026).
- [ ] `streamAuditChat` prependa sempre a mensagem `system` com `systemInstructions` (6 regras) antes das mensagens do usuário.
- [ ] Parser SSE replicado com tratamento de heartbeats (`:`), buffer parcial e `[DONE]`.
- [ ] Cache L0 ativado apenas quando `companyId`+`periodo` presentes em `documentInfo`.
- [ ] `CanonicalReportDataset` com `narratives[key].fact_ids_used` sempre populado — nenhuma narrativa sem lastro de fatos.
- [ ] `runtime_trace_id`/`canonical_snapshot_id`/`processing_run_id`/`source_file_hash` gerados a cada novo processamento (nunca reaproveitados entre uploads distintos).
- [ ] `BEX_INCLUDE_KANITZ = false` preservado — Kanitz nunca embutido implicitamente no relatório BEx.
- [ ] Contrato JSON de saída (`diagnostico`, `problemas[]`, `positivos[]`, `riscos[]`, `recomendacoes[]`, `tendencia`) validado antes de renderizar.
- [ ] `generateInsights` (determinístico, sem IA) mantido separado do binding de narrativa por IA.

## 14. Critérios de Homologação
1. **Zero hallucination numérica**: para 100% dos relatórios de teste, todo valor monetário citado no texto narrativo deve corresponder byte-a-byte (após normalização de formatação pt-BR) a um valor presente em `deterministicFacts`/`balanco`/`facts` do `CanonicalReportDataset`.
2. **Indicador N/A nunca maquiado**: para todo indicador `N/A`/zerado no dataset, a narrativa correspondente deve declarar "Não Disponível" — nenhuma frase otimista genérica pode ser gerada nesse caso (regra 5 do prompt de chat).
3. **Rastreabilidade**: para uma amostra de 10 narrativas geradas, `fact_ids_used` deve resolver, em 100% dos casos, para fatos existentes no `CertifiedFinancialSnapshot` correspondente ao mesmo `canonical_snapshot_id`.
4. **Idempotência de binding**: reprocessar o mesmo arquivo (mesmo `source_file_hash`) duas vezes deve produzir fatos numéricos idênticos entre as duas execuções (mesmo que `runtime_trace_id` mude).
5. **Ausência de Score BEx**: nenhum PDF/tela gerado após a regra "Score BEx foi DESATIVADO" pode conter uma pontuação numérica solta associada a "Score BEx".
6. **Cache por competência**: alterar o balancete de Abril/2026 não pode alterar o resultado já persistido de Março/2026 para a mesma empresa.
7. **Stream sem perda**: em um teste de rede lenta (throttling), o parser SSE deve reconstruir 100% do texto final sem truncar ou duplicar tokens.
