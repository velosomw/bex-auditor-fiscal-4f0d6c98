# MD-PORT-08 — Canonical Financial Snapshot e Source Binding

## 1. Objetivo

Este documento especifica, em nível de replicação exata (byte-a-byte de contrato de dados),
o mecanismo de **Snapshot Financeiro Certificado** (`CertifiedFinancialSnapshot`) da plataforma
BEx, implementado em `src/services/canonicalFinancialSnapshotService.ts`, e sua integração com
`src/services/bsDadosBuilder.ts`, `src/services/certificationResult.ts` e `src/pages/Audit.tsx`.

O objetivo é permitir que uma equipe de portabilidade (ex.: migração para Remix, para outro
runtime front-end, ou para um novo serviço de backend) reproduza **exatamente** o mesmo
comportamento de:

- congelamento imutável do snapshot (`Object.freeze`);
- geração determinística de `processing_run_id`, `source_file_hash`, `runtime_trace_id` e
  `snapshot_id`;
- o **hard gate de source binding**, que invalida o dataset de relatório quando há divergência
  entre a corrida de processamento esperada (`processingRunId`) e a corrida realmente
  materializada no snapshot (`snapshot.processing_run_id`);
- a garantia de **unified consumer parity**: dashboard (BEx interativo) e PDF (relatório final)
  leem exclusivamente do mesmo objeto `CertifiedFinancialSnapshot`, nunca recalculam fatos.

Este MD não normatiza os detalhes de extração contábil (isso é coberto por outros MDs de
`bsDadosBuilder.ts`); ele normatiza o **envelope de certificação** que embrulha o resultado da
extração e o disponibiliza aos consumidores (UI, PDF, exportações).

## 2. Escopo

Em escopo:
- Estrutura TypeScript completa de `CertifiedFinancialSnapshot`, `CanonicalFacts`,
  `CanonicalKanitzModel`, `CanonicalCompetencySnapshot`, `FactStatus`, `SnapshotSource`.
- Algoritmo de construção `buildCertifiedFinancialSnapshot()` passo a passo.
- Regras de hashing (`hashString`) e geração de IDs (`processing_run_id`, `runtime_trace_id`,
  `snapshot_id`).
- Regras de congelamento (`Object.freeze`) e o que fica congelado vs. não congelado.
- O hard gate de source binding em `src/pages/Audit.tsx` (linhas 2660-2697) e seu efeito em
  cascata sobre `CanonicalReportDataset`.
- Isolamento de cache via `useMemo` com array de dependências e implicações de invalidação.
- Unified consumer parity: os dois pontos de materialização do snapshot em `Audit.tsx` (BEx
  interativo em `~L2620` e fluxo de relatório final em `~L4936`), e o motivo pelo qual ambos
  devem convergir para o mesmo `snapshot_id`/`processing_run_id` quando operam sobre a mesma
  fonte.
- `certificationResult.ts` como registro estático de evidência de certificação de gates
  (`BEX_KANITZ_FINAL_CERTIFICATION`).

Fora de escopo (cobertos por outros MDs):
- Lógica interna de mapeamento Ref1 → BSDadosRow (`REF1_MAP`, `FALLBACK_PATTERNS`).
- Fórmulas de indicadores (`indicatorsEngine.ts`) e Kanitz mensal isolado
  (`kanitzMonthly.ts`) — ver MD-PORT-10.
- Resolução de fatos residuais (`residualFactsResolver.ts`).
- Persistência em Supabase (`audit-bs-dados` edge function, tabelas `bs_dados`, `indicadores`,
  `kanitz_scores`).

## 3. Pré-requisitos

- Conhecimento de TypeScript avançado (tipos discriminados, `Record<K,V>`, `Object.freeze`,
  genéricos).
- Familiaridade com React Hooks (`useMemo`, `useCallback`, `useEffect`) e a semântica de
  memoização por array de dependências.
- Entendimento do pipeline geral BEx:
  `Balancete (upload) → ParsedFinancialData (OCR/IA) → BalanceteEntry[] (metadados de mês) →
  BSDadosRow[] (bsDadosBuilder) → IndicatorRow (indicatorsEngine) →
  CertifiedFinancialSnapshot (canonicalFinancialSnapshotService) → CanonicalReportDataset
  (Audit.tsx) → UI / PDF`.
- Leitura prévia recomendada: `src/services/residualFactsResolver.ts` (para os tipos
  `BalanceClosure` e `ResidualFacts` usados como opacos neste documento).

## 4. Por que existe um Snapshot Certificado

O comentário de cabeçalho do arquivo fonte declara a motivação com precisão:

```ts
/**
 * MD-BEX-FINAL-RUNTIME-CUTOVER-AND-UNIFIED-REPORT-CONSUMER-001
 *
 * canonicalFinancialSnapshotService — ÚNICA fábrica de fatos financeiros da plataforma.
 *
 * BALANCETE → EXTRAÇÃO → WORKSPACE → CERTIFIED FINANCIAL SNAPSHOT → BEx / Kanitz
 *
 * Regras absolutas:
 *  - Nenhum consumer (narrativa, tabela, gráfico, cards, Kanitz embutido/standalone)
 *    pode localizar contas, somar contas, decidir sintética, recalcular PL/Receita/Estoques.
 *  - Proibido fallback para aiAnalysis, ParsedFinancialData bruto ou builders paralelos.
 *  - O snapshot é congelado (Object.freeze) após certificação.
 */
```

Antes da introdução deste serviço, cada consumidor (aba do dashboard, gerador de PDF, motor de
narrativa) recalculava os fatos financeiros de forma independente a partir de
`ParsedFinancialData` bruto, o que produzia divergências numéricas entre telas (ex.: PL exibido
na aba "Indicadores" diferente do PL usado no PDF). O `canonicalFinancialSnapshotService`
elimina esta classe de bug ao se tornar o **único ponto de materialização de fatos**, cujo
resultado é congelado e distribuído por referência a todos os consumidores.

Regra de ouro para portabilidade: **qualquer novo consumer** (nova aba, novo exportador, novo
endpoint de API) deve ler campos de `CertifiedFinancialSnapshot` — nunca deve importar
`bsDadosBuilder`, `indicatorsEngine` ou `ParsedFinancialData` diretamente para "recalcular" um
fato que já existe no snapshot.

## 5. Estrutura de Dados Completa (TypeScript)

### 5.1 `FactStatus`

```ts
export type FactStatus = "AVAILABLE" | "NOT_AVAILABLE";
```

Usado em `facts_status: Record<string, FactStatus>` para indicar, por chave de fato, se o valor
foi efetivamente extraído do balancete (`AVAILABLE`) ou se é um zero/NaN não certificado
(`NOT_AVAILABLE`). Este mapa é propagado de `BSDadosRow.facts_status` (produzido em
`bsDadosBuilder.ts`) sem transformação.

### 5.2 `CanonicalFacts`

```ts
export interface CanonicalFacts {
  ativo_circulante: number;
  ativo_nao_circulante: number;
  ativo_total: number;
  realizavel_longo_prazo: number;
  estoques: number;
  disponivel: number;
  passivo_circulante: number;
  passivo_nao_circulante: number;
  passivo_total: number;
  patrimonio_liquido: number;
  receita_liquida: number;
  resultado_liquido: number;
  /** §RESULT-CONTEXT — Resultado do período (competência) e acumulado no exercício. */
  resultado_competencia: number;
  resultado_acumulado: number;
  fornecedores: number;
  fornecedores_lp: number;
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
  divida_financeira_cp: number;
  divida_financeira_lp: number;
  tax_noncurrent: number; // MD-BEX-FINAL-RUNTIME-4-BINDING-GATE-PATCH-001 §8
}
```

Todas as chaves são `number` (nunca `string | number`, nunca opcionais). Os valores ausentes são
representados por `NaN` (nunca por `0` artificial) — ver seção 5.6 sobre a função `num()`.

### 5.3 `CanonicalKanitzModel`

```ts
export interface CanonicalKanitzModel {
  competency: string;
  applicable: boolean;
  reason_code: "EQUITY_POSITIVE" | "EQUITY_NON_POSITIVE";
  /** Fator de Insolvência — NaN quando não aplicável (nunca 0 artificial). */
  fi: number;
  rpl: number;
  lg: number;
  ls: number;
  lc: number;
  /** GE = Passivo Total Exigível / PL. Sem inversão de sinal, sem abs(). */
  ge: number;
  isg: number;
  classificacao: "saudavel" | "estavel" | "atencao" | "risco" | "insolvente" | "na";
}
```

Este é o **modelo Kanitz unificado**, compartilhado entre a visão embutida (dentro do BEx) e a
visão standalone (aba dedicada de Kanitz). Ver MD-PORT-10 para as fórmulas exatas de `fi`, `rpl`,
`lg`, `ls`, `lc`, `ge`.

### 5.4 `CanonicalCompetencySnapshot`

```ts
export interface CanonicalCompetencySnapshot {
  competency: string;
  facts: CanonicalFacts;
  facts_status: Record<string, FactStatus>;
  ratios: IndicatorRow;
  kanitz: CanonicalKanitzModel;
  /** MD-FINAL-RESIDUAL-001 — tributos, trabalhistas, empréstimos, despesas financeiras, EBITDA. */
  residual?: ResidualFacts;
  /** MD-FINAL-RESIDUAL-001 §34..§37 — modo de fechamento patrimonial. */
  closure: BalanceClosure;
}
```

Uma instância desta interface existe **por competência** (mês/ano). É o elemento atômico dentro
de `byCompetency`.

### 5.5 `CertifiedFinancialSnapshot` (raiz)

```ts
export interface CertifiedFinancialSnapshot {
  snapshot_id: string;
  processing_run_id: string; // MD-CUTOVER-001 §6
  runtime_trace_id: string;
  snapshot_version: string;
  company_id: string;
  metadata?: {
    company_name?: string;
    company_cnpj?: string;
  };
  competency: string;
  source_file_name: string;
  source_file_hash: string;
  processing_timestamp: string;

  facts: CanonicalFacts;
  facts_status: Record<string, FactStatus>;
  ratios: IndicatorRow;
  kanitz: CanonicalKanitzModel;
  residual?: ResidualFacts;
  closure: BalanceClosure;
  /** Séries por competência — Balance History, gráficos e tabelas consomem daqui. */
  byCompetency: Record<string, CanonicalCompetencySnapshot>;
  competencies: string[];
  /** Compat: mesma série de indicadores indexada por competência. */
  history: Record<string, IndicatorRow>;
  limitations: string[];
  report_certification_status: "CERTIFIED" | "FAILED";
}
```

Ponto crítico de replicação: os campos de nível raiz (`facts`, `facts_status`, `ratios`,
`kanitz`, `residual`, `closure`, `competency`) são **sempre um espelho da competência mais
recente** (`latestKey`), não um agregado. Séries completas (todas as competências) só existem em
`byCompetency` e `history`.

### 5.6 Constantes e helpers internos

```ts
const SNAPSHOT_VERSION = "MD-CUTOVER-001";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).toUpperCase();
}

function sortCompetencies(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const pa = a.includes("/") ? a.split("/").reverse().join("") : a;
    const pb = b.includes("/") ? b.split("/").reverse().join("") : b;
    return pa.localeCompare(pb);
  });
}
```

- `num()` é a função de coerção segura: qualquer valor que não seja `number` finito vira `NaN`.
  Isto substitui a prática legada de usar `0` como sentinela de "ausente", que causava falsos
  positivos em somatórios e Kanitz.
- `hashString()` implementa o algoritmo **djb2** (constante inicial `5381`, `h = h*33 + c`
  reescrito com shift `<<5`), com saída em base-36 maiúscula. É determinístico e **não
  criptográfico** — não deve ser usado como hash de integridade forte, apenas como fingerprint de
  identidade de corrida (ver seção 6).
- `sortCompetencies()` ordena chaves de competência que podem estar em formato `YYYY-MM` ou
  `MM/YYYY` (contém `/`). No segundo caso, inverte os segmentos antes de comparar
  lexicograficamente (`"03/2024"` → `"2024" + "03"` → comparável com `YYYY-MM`).

### 5.7 `SnapshotSource`

```ts
export interface SnapshotSource {
  companyId?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  processingRunId?: string; // MD-CUTOVER-001 §6
}
```

Parâmetro de entrada opcional de `buildCertifiedFinancialSnapshot`. Quando `processingRunId` é
omitido, o serviço gera um novo run id determinístico a partir do hash do arquivo (ver seção 6.2).

## 6. Construção do Snapshot — `buildCertifiedFinancialSnapshot`

### 6.1 Assinatura

```ts
export function buildCertifiedFinancialSnapshot(
  parsedData: ParsedFinancialData | null | undefined,
  balanceteEntries: BalanceteEntry[] | null | undefined,
  source: SnapshotSource = {}
): CertifiedFinancialSnapshot | null
```

Retorna `null` apenas em dois casos:
1. `parsedData` é `null`/`undefined`.
2. `buildBSDados(parsedData, balanceteEntries)` retorna um array vazio (nenhuma competência
   extraída).

Não há outro caminho de retorno `null` — mesmo dados incompletos ou com gates falhos produzem um
snapshot válido com `report_certification_status: "FAILED"` (ver seção 6.5), nunca `null`.

### 6.2 Passo a passo do algoritmo

```ts
export function buildCertifiedFinancialSnapshot(
  parsedData, balanceteEntries, source = {}
): CertifiedFinancialSnapshot | null {
  if (!parsedData) return null;
  const rows = buildBSDados(parsedData, balanceteEntries || []);
  if (!rows || rows.length === 0) return null;

  const byCompetency: Record<string, CanonicalCompetencySnapshot> = {};
  const history: Record<string, IndicatorRow> = {};

  for (const r of rows) {
    const ind = computeIndicatorsForRow(r);
    const facts = factsFromRow(r);
    byCompetency[r.mesKey] = {
      competency: r.mesKey,
      facts,
      facts_status: (r.facts_status as Record<string, FactStatus>) || {},
      ratios: ind,
      kanitz: buildCanonicalKanitz(r.mesKey, facts, ind),
      residual: r.residual_facts,
      closure: detectBalanceClosure({
        ativo_total: facts.ativo_total,
        passivo_circulante: facts.passivo_circulante,
        passivo_nao_circulante: facts.passivo_nao_circulante,
        patrimonio_liquido: facts.patrimonio_liquido,
        resultado_liquido: facts.resultado_liquido,
      }),
    };
    history[r.mesKey] = ind;
  }

  const competencies = sortCompetencies(Object.keys(byCompetency));
  const latestKey = competencies[competencies.length - 1];
  if (!latestKey) return null;
  const latest = byCompetency[latestKey];

  const fileName = source.fileName || (parsedData as any)?.fileName || "balancete";
  const fileHash = hashString(`${fileName}|${source.fileSize ?? 0}|${competencies.join(",")}`);
  const runId = source.processingRunId || `BEXRUN-${fileHash}-${new Date().getTime().toString(36).toUpperCase()}`;
  const traceId = `BEX-RUNTIME-${latestKey.replace(/[^0-9]/g, "")}-${fileHash}`;
  ...
}
```

Ordem de construção (não pode ser reordenada sem quebrar dependências):

1. **Materializar `BSDadosRow[]`** via `buildBSDados()` — fonte única contábil.
2. **Para cada linha (competência)**:
   a. calcular `IndicatorRow` via `computeIndicatorsForRow(r)`;
   b. extrair `CanonicalFacts` via `factsFromRow(r)` (normalização de sinais/NaN);
   c. montar o `CanonicalKanitzModel` via `buildCanonicalKanitz(mesKey, facts, ind)`;
   d. anexar `residual_facts` (produzido por `resolveResidualFacts` dentro do builder);
   e. detectar `closure` (modo de fechamento patrimonial) via `detectBalanceClosure()`.
3. **Ordenar competências** com `sortCompetencies()` e eleger `latestKey` (última competência
   cronológica) como a "vigente" para os campos de nível raiz.
4. **Gerar identificadores de corrida** (ver 6.2.1 abaixo).
5. **Montar o objeto `snapshot`** com campos raiz espelhando `latest`, mais as séries completas
   `byCompetency`/`history`/`competencies`.
6. **Determinar `report_certification_status`** (ver 6.5).
7. **Congelar** (`Object.freeze`) partes do objeto (ver 6.6).

### 6.2.1 Geração de identificadores

| Campo | Fórmula | Exemplo |
|---|---|---|
| `source_file_hash` (`fileHash`) | `hashString(`${fileName}\|${fileSize ?? 0}\|${competencies.join(",")}`)` | `"1F3K9A"` |
| `processing_run_id` (`runId`) | `source.processingRunId` OU `` `BEXRUN-${fileHash}-${Date.now().toString(36).toUpperCase()}` `` | `"BEXRUN-1F3K9A-LX2G7Z01"` |
| `runtime_trace_id` (`traceId`) | `` `BEX-RUNTIME-${latestKey.replace(/[^0-9]/g,"")}-${fileHash}` `` | `"BEX-RUNTIME-202403-1F3K9A"` |
| `snapshot_id` | `` `SNAP-${traceId}` `` | `"SNAP-BEX-RUNTIME-202403-1F3K9A"` |

Notas de determinismo:
- `source_file_hash` é **puramente determinístico**: depende apenas de `fileName`, `fileSize` e
  do conjunto ordenado de competências extraídas. Reprocessar o mesmo arquivo, com o mesmo
  conteúdo, sempre produz o mesmo `source_file_hash`.
- `processing_run_id` é **não determinístico por padrão** (contém `Date.now()`) — **a menos que**
  o chamador (`Audit.tsx`) passe `processingRunId` explicitamente. Isso é o que possibilita o
  hard gate de source binding: o run id é fixado externamente antes da criação do snapshot e
  depois comparado contra o run id efetivamente materializado.
- `runtime_trace_id` mistura os dígitos da competência mais recente com o hash de arquivo — serve
  como identificador legível em logs de auditoria correlacionando "qual mês" + "qual arquivo".
- `snapshot_id` é derivado 1:1 de `runtime_trace_id`, prefixado com `SNAP-`.

### 6.3 `factsFromRow` — normalização de `BSDadosRow` → `CanonicalFacts`

```ts
function factsFromRow(r: BSDadosRow): CanonicalFacts {
  const ac = r.ativo_circulante;
  const anc = r.ativo_nao_circulante;
  const pc = r.passivo_circulante;
  const pnc = r.passivo_nao_circulante;
  return {
    ativo_circulante: ac,
    ativo_nao_circulante: anc,
    // MD-P1-001: Ativo Total autoritativo (conta sintética "1") quando disponível.
    ativo_total: Number.isFinite(r.ativo_total as number) ? (r.ativo_total as number) : ac + anc,
    realizavel_longo_prazo: r.realizavel_longo_prazo,
    estoques: r.estoques,
    disponivel: r.disponivel,
    passivo_circulante: pc,
    passivo_nao_circulante: pnc,
    passivo_total: pc + pnc,
    patrimonio_liquido: r.patrimonio_liquido,
    receita_liquida: r.receita_liquida,
    resultado_liquido: r.resultado,
    resultado_competencia: Number.isFinite((r as any).resultado_competencia as number)
      ? ((r as any).resultado_competencia as number) : NaN,
    resultado_acumulado: Number.isFinite((r as any).resultado_acumulado as number)
      ? ((r as any).resultado_acumulado as number) : NaN,
    fornecedores: r.fornecedores,
    fornecedores_lp: num((r as any).fornecedores_lp || 0),
    divida_tributaria: Math.abs(r.divida_tributaria || 0),
    divida_trabalhista: Math.abs(r.divida_trabalhista || 0),
    divida_financeira: Math.abs(r.divida_financeira || 0),
    divida_financeira_cp: Math.abs((r as any).divida_financeira_cp || 0),
    divida_financeira_lp: Math.abs((r as any).divida_financeira_lp || 0),
    tax_noncurrent: num((r as any).tax_noncurrent || 0),
  };
}
```

Regras de sinal e prioridade a preservar exatamente:
- `ativo_total`: prioriza a conta sintética `1` (autoritativa) capturada no builder
  (`r.ativo_total`); só recorre à soma `ac + anc` se `r.ativo_total` não for finito.
- `passivo_total`: **sempre** recalculado como `pc + pnc` (não há campo sintético autoritativo
  para passivo total neste ponto).
- Todas as dívidas (`divida_tributaria`, `divida_trabalhista`, `divida_financeira` e suas
  variantes CP/LP) são normalizadas para **módulo positivo** com `Math.abs()`.
- `resultado_competencia` e `resultado_acumulado` usam `NaN` como sentinela de ausência (não
  `0`), preservando a semântica "não certificado" downstream nos indicadores.

### 6.4 `buildCanonicalKanitz` — modelo Kanitz unificado

```ts
export function buildCanonicalKanitz(competency: string, f: CanonicalFacts, ind: IndicatorRow): CanonicalKanitzModel {
  const applicable = f.patrimonio_liquido > 0;
  const lc = ind.liquidezCorrente;
  const ls = ind.liquidezSeca;
  const lg = ind.liquidezGeral;
  const isg = ind.isg;
  const rpl = applicable ? f.resultado_liquido / f.patrimonio_liquido : NaN;
  const ge = applicable ? f.passivo_total / f.patrimonio_liquido : NaN;
  const fi = applicable ? 0.05 * rpl + 1.65 * lg + 3.55 * ls - 1.06 * lc - 0.33 * ge : NaN;
  const classificacao: CanonicalKanitzModel["classificacao"] = !applicable
    ? "na"
    : fi > 1 ? "saudavel" : fi > 0 ? "estavel" : fi > -1 ? "atencao" : fi >= -3 ? "risco" : "insolvente";
  return {
    competency, applicable,
    reason_code: applicable ? "EQUITY_POSITIVE" : "EQUITY_NON_POSITIVE",
    fi, rpl, lg, ls, lc, ge, isg, classificacao,
  };
}
```

Este é o modelo Kanitz consumido pelo Kanitz "embutido" no BEx e pela aba standalone (ver
MD-PORT-10 para detalhamento numérico completo; aqui documenta-se somente sua integração com o
snapshot). Ponto essencial: `lc`, `ls`, `lg`, `isg` **não são recalculados** aqui — são lidos
diretamente de `IndicatorRow` (produzido por `indicatorsEngine.computeIndicatorsForRow`), o que
garante que o Kanitz do snapshot e os indicadores de liquidez exibidos em outras abas usem
exatamente os mesmos denominadores.

### 6.5 Certificação (`report_certification_status`)

```ts
const critical: (keyof CanonicalFacts)[] = [
  "ativo_circulante", "passivo_circulante", "patrimonio_liquido",
];
const latestRow = rows.find(r => r.mesKey === latestKey);
const gateFailures = (latestRow?.integrity_gates || []).filter(g => !g.passed);
const failed = critical.some(k => !Number.isFinite(num(latest.facts[k]))) || gateFailures.length > 0;
```

Regras de falha (`report_certification_status: "FAILED"`):
1. Qualquer um dos três fatos críticos (`ativo_circulante`, `passivo_circulante`,
   `patrimonio_liquido`) da competência mais recente não é um número finito (é `NaN`/`Infinity`).
2. Existe pelo menos um `IntegrityGateResult` com `passed: false` associado à linha mais recente
   (`latestRow.integrity_gates`), produzido pelo `p1SyntheticResolver.runIntegrityGates()` dentro
   de `bsDadosBuilder.ts`.

Se nenhuma das condições ocorrer, `report_certification_status: "CERTIFIED"`.

**Importante**: o snapshot é sempre retornado (mesmo com `FAILED`), permitindo que a UI exiba os
gates de integridade e as limitações (`limitations: string[]`, populado a partir de
`rows.find(...).errors`) sem bloquear a navegação; o bloqueio de publicação/exportação de PDF
deve ser decidido pelo consumidor com base em `report_certification_status`, não pela ausência do
snapshot.

### 6.6 Congelamento (imutabilidade)

```ts
Object.freeze(snapshot.facts);
Object.freeze(snapshot.kanitz);
Object.freeze(snapshot.byCompetency);
return Object.freeze(snapshot);
```

Pontos de replicação exatos:
- `Object.freeze` é **raso** (shallow) em JavaScript/TypeScript. O código congela explicitamente
  quatro referências: `snapshot.facts`, `snapshot.kanitz` (ambos objetos de nível raiz — a
  competência mais recente), `snapshot.byCompetency` (o mapa em si, não cada
  `CanonicalCompetencySnapshot` individual dentro dele) e finalmente o próprio `snapshot`.
- **Não são congelados individualmente**: `snapshot.ratios`, `snapshot.residual`,
  `snapshot.closure`, `snapshot.history`, nem os objetos internos de cada entrada de
  `byCompetency` (ex.: `byCompetency["2024-03"].facts` não é congelado separadamente — apenas o
  container `byCompetency` como um todo é congelado, o que impede adicionar/remover chaves, mas
  não impede mutar propriedades dos objetos internos).
- Ao portar para outro runtime (ex.: um backend Node/Remix loader), replicar esta mesma política
  de congelamento parcial é opcional para correção funcional, mas é **obrigatório documentar**
  caso se decida congelar profundamente (deep-freeze), pois isso pode quebrar mutações
  incrementais que alguns componentes legados ainda realizam sobre `history`/`ratios` (nenhuma
  identificada no código atual, mas o contrato não impede).
- Em modo `strict`, qualquer tentativa de `snapshot.facts.ativo_total = 123` lança
  `TypeError: Cannot assign to read only property`. Fora de modo estrito, a atribuição falha
  silenciosamente. Componentes React devem tratar o snapshot como **somente leitura** em todos os
  casos — nunca clonar e mutar um `CertifiedFinancialSnapshot` diretamente; deve-se construir um
  novo objeto derivado (spread) se uma transformação de apresentação for necessária.

## 7. `certificationResult.ts` — Evidência estática de certificação

```ts
import { IndicatorRow } from "@/services/indicatorsEngine";
import { CertifiedFinancialSnapshot } from "@/services/canonicalFinancialSnapshotService";
import { BSDadosRow } from "@/services/bsDadosBuilder";

/**
 * MD-BEX-ACCOUNTING-DERIVED-FACTS-CERTIFICATION-AND-PUBLICATION-CORRECTION-001
 *
 * Resulting evidence of implementation and certification.
 */

export const BEX_KANITZ_FINAL_CERTIFICATION = {
  version: "2.1",
  status: "APPROVED (CORE FROZEN v1.1)",
  timestamp: "2026-08-11T17:05:00Z",
  gates: {
    negative_equity: "PASS",
    ebitda_reconciliation: "PASS",
    interest_coverage: "PASS",
    tax_lp_binding: "PASS",
    margin_parity: "PASS",
    safe_pagination: "PASS"
  }
};
```

Este arquivo **não exporta lógica executável de certificação** — é um registro estático
(constante) de evidência de que uma bateria de gates de homologação foi aprovada em uma data
específica, versão `2.1`, com o core marcado como `FROZEN v1.1`. Os imports de tipos
(`IndicatorRow`, `CertifiedFinancialSnapshot`, `BSDadosRow`) não são utilizados no corpo do
arquivo — eles documentam a **superfície de contrato** sobre a qual os gates foram validados
(qualquer alteração de tipo nesses três arquivos deveria, em tese, disparar nova rodada de
certificação).

Em uma re-implementação, este arquivo deve ser portado como um artefato de rastreabilidade
(changelog estruturado), não como código de runtime. Recomenda-se manter o mesmo formato de chave
(`gates: Record<string, "PASS" | "FAIL">`) para qualquer sistema de CI/CD que deseje consumir este
registro como gate de deploy.

## 8. Hard Gate de Source Binding em `src/pages/Audit.tsx`

### 8.1 Interface do dataset de relatório

```ts
/* ── MD-BEX-CANONICAL-RUNTIME-BINDING Interfaces ── */
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
  /** MD-CUTOVER-001 — snapshot certificado imutável (fonte única de todos os consumers). */
  snapshot?: CertifiedFinancialSnapshot;
  /** MD-CUTOVER-001 — fatos residuais expostos diretamente no dataset para consumers. */
  residual?: CertifiedFinancialSnapshot["residual"];
}
```

`CanonicalReportDataset` é a **projeção de apresentação** do snapshot: um subconjunto plano dos
campos mais usados pela UI/PDF, mais a referência completa ao `snapshot` original em
`dataset.snapshot`. Todo componente que precisar de um fato não presente na projeção plana deve
acessar `dataset.snapshot.facts.<campo>` — nunca deve recalcular.

### 8.2 Materialização do snapshot memoizada (fluxo BEx interativo)

```ts
/* MD-CUTOVER-001 §37 — snapshot materializado por serviço dedicado (sem assembly na UI). */
const snapshot = useMemo(
  () => buildCertifiedFinancialSnapshot(parsedData, balanceteEntries || [], {
    companyId: company?.id,
    fileName: uploadedFiles?.[0]?.name || sourceDocs?.[0]?.fileName || (balanceteEntries || [])[0]?.fileName || null,
    fileSize: uploadedFiles?.[0]?.size ?? sourceDocs?.[0]?.fileSize ?? null,
    processingRunId: processingRunId || undefined
  }),
  [parsedData, balanceteEntries, company, uploadedFiles, sourceDocs, processingRunId]
);
```

- `processingRunId` é um estado do componente `Audit.tsx` (ex.: definido no início do fluxo de
  upload/processamento de um arquivo, antes de qualquer chamada de IA/OCR).
- Quando presente, é repassado como `SnapshotSource.processingRunId`, forçando o snapshot a
  adotar **exatamente** esse run id em vez de gerar um novo com timestamp.

### 8.3 O gate propriamente dito

```ts
const reportDataset: CanonicalReportDataset | null = useMemo(() => {
  if (!snapshot) return null;

  // MD-CUTOVER-001 §11: Hard Gate de Source Binding
  if (processingRunId && snapshot.processing_run_id !== processingRunId) {
     console.error("SNAPSHOT_REUSE_CROSS_SOURCE_FAIL: Run ID mismatch detected.", { expected: processingRunId, got: snapshot.processing_run_id });
     return null;
  }

  return {
    runtime_trace_id: snapshot.runtime_trace_id,
    canonical_snapshot_id: snapshot.snapshot_id,
    processing_run_id: snapshot.processing_run_id,
    source_file_hash: snapshot.source_file_hash,
    competency: snapshot.competency,
    company_id: snapshot.company_id,
    generated_at: snapshot.processing_timestamp,
    facts: {
      ativo_circulante: snapshot.facts.ativo_circulante,
      ativo_nao_circulante: snapshot.facts.ativo_nao_circulante,
      passivo_circulante: snapshot.facts.passivo_circulante,
      passivo_nao_circulante: snapshot.facts.passivo_nao_circulante,
      patrimonio_liquido: snapshot.facts.patrimonio_liquido,
      receita_liquida: snapshot.facts.receita_liquida,
      resultado_liquido: snapshot.facts.resultado_liquido,
      estoques: snapshot.facts.estoques,
      fornecedores: snapshot.facts.fornecedores,
      disponivel: snapshot.facts.disponivel,
      realizavel_longo_prazo: snapshot.facts.realizavel_longo_prazo,
    } as any,
    ratios: snapshot.ratios,
    history: snapshot.history,
    kanitz: snapshot.kanitz,
    narratives: {},
    limitations: snapshot.limitations,
    snapshot,
  } as CanonicalReportDataset;
}, [snapshot, processingRunId]);
```

**Semântica do gate**: se `processingRunId` (o run id "esperado", fixado no início do fluxo do
usuário) está definido, mas o `snapshot.processing_run_id` (o run id efetivamente presente no
objeto materializado) é **diferente**, o dataset de relatório inteiro é anulado
(`return null`), impedindo que a UI publique um relatório fabricado a partir de uma corrida de
processamento errada (ex.: dados de uma empresa/arquivo diferente reaproveitados por engano em
memória/estado obsoleto do React).

Cenários reais que este gate previne:
- Usuário troca de empresa/arquivo rapidamente e um `useMemo` obsoleto (por race condition de
  atualização de estado assíncrono) retorna um snapshot antigo enquanto `processingRunId` já foi
  atualizado para o novo run.
- Reuso indevido de um snapshot em cache de uma aba de comparação/histórico que não deveria ser
  promovido a "relatório ativo".

Efeito em cascata: como `reportDataset` é `null`, todos os componentes que dependem dele (o
relatório A4, os gráficos, os cards de indicadores no modo de relatório final) devem tratar o
estado `null` como "sem dados prontos para publicação" e não devem cair em nenhum fallback de
recomputação — a UI deve exibir um estado de carregamento/erro, nunca substituir por dados
calculados ad-hoc.

### 8.4 Segundo ponto de materialização (fluxo de relatório final)

```ts
/* MD-CUTOVER-001 — mesmo serviço de snapshot usado pelo BEx (fonte única). */
const reportDataset: CanonicalReportDataset | null = useMemo(() => {
  const snap = buildCertifiedFinancialSnapshot(parsedData, balanceteEntries || [], {
    companyId: company?.id,
    fileName: uploadedFiles?.[0]?.name || sourceDocs?.[0]?.fileName || (balanceteEntries || [])[0]?.fileName || null,
    fileSize: uploadedFiles?.[0]?.size ?? sourceDocs?.[0]?.fileSize ?? null,
  });
  if (!snap) return null;
  return {
    runtime_trace_id: snap.runtime_trace_id,
    canonical_snapshot_id: snap.snapshot_id,
    competency: snap.competency,
    company_id: snap.company_id,
    generated_at: snap.processing_timestamp,
    facts: { /* mesmos 11 campos da seção 8.3 */ } as any,
    ratios: snap.ratios,
    history: snap.history,
    kanitz: snap.kanitz,
    narratives: {},
    limitations: snap.limitations,
    snapshot: snap,
  } as CanonicalReportDataset;
}, [parsedData, company, balanceteEntries, uploadedFiles, sourceDocs]);
```

Diferenças relevantes em relação a 8.3:
- Este segundo `useMemo` (usado no fluxo de geração de relatório/PDF, mais adiante no componente,
  próximo à linha 4936) **não recebe `processingRunId`** como parâmetro de origem nem aplica o
  hard gate de comparação. Isso é aceitável porque este ponto de materialização opera diretamente
  sobre `parsedData`/`balanceteEntries` já validados pelo fluxo anterior — não há um
  "processingRunId esperado" externo a comparar neste contexto.
- Mesmo assim, o **mesmo serviço** (`buildCertifiedFinancialSnapshot`) e a **mesma projeção de
  campos planos** são usados, garantindo paridade de estrutura entre os dois pontos de consumo
  (interativo vs. PDF).
- Ambos os `useMemo` compartilham o mesmo shape de saída (`CanonicalReportDataset`), portanto
  qualquer componente de renderização (ex.: `<ReportA4Page />`, `<KanitzCard />`) pode ser
  reutilizado indistintamente entre os dois fluxos.

### 8.5 Consumo do `runtime_trace_id` por sub-componentes

```tsx
<... runtimeTraceId={reportDataset?.runtime_trace_id} ...>
```

O `runtime_trace_id` é propagado como prop para componentes filhos (ex.: cabeçalho do relatório,
rodapé de auditoria), permitindo que o PDF e a UI exibam o mesmo identificador de rastreabilidade
impresso, o que possibilita conferência manual pós-emissão ("este PDF corresponde a qual
`runtime_trace_id`?").

## 9. Isolamento e Invalidação de Cache

### 9.1 Escopo de memoização

O snapshot é recalculado (novo objeto, nova referência) sempre que qualquer item do array de
dependências do `useMemo` muda:

```
[parsedData, balanceteEntries, company, uploadedFiles, sourceDocs, processingRunId]
```

Implicações de portabilidade:
- **Nenhuma invalidação manual de cache é necessária** — a estratégia é puramente declarativa via
  identidade referencial de dependências do React. Ao portar para outro framework (ex.: um loader
  do Remix, que roda no servidor por requisição), a invalidação equivalente é *implícita*: cada
  requisição HTTP que carrega novos `parsedData`/`balanceteEntries` deve reconstruir o snapshot do
  zero (sem estado de servidor compartilhado entre requisições de usuários diferentes).
- Se `parsedData` ou `balanceteEntries` forem objetos recriados a cada render (ex.: literais de
  objeto/array inline) sem memoização upstream, o snapshot será reconstruído desnecessariamente
  em toda renderização — isso é custoso, pois `buildBSDados` + `computeIndicatorsForRow` +
  `buildCanonicalKanitz` rodam para **todas as competências**. A implementação de referência
  depende de que os produtores de `parsedData`/`balanceteEntries` (fluxo de upload/OCR)
  mantenham referências estáveis entre renders não relacionados.
- Não existe cache persistente (localStorage/IndexedDB/Supabase) do `CertifiedFinancialSnapshot`
  em si — ele é puramente derivado em memória a cada sessão de edição do BEx. A persistência
  ocorre em um nível mais baixo (tabelas `bs_dados`, `indicadores`, `kanitz_scores`, produzidas
  pela edge function `audit-bs-dados`), que devem ser recarregadas e re-hidratadas em
  `parsedData`/`balanceteEntries` antes de reconstruir o snapshot — nunca deve existir um segundo
  caminho de leitura direta de `CertifiedFinancialSnapshot` a partir do banco.

### 9.2 Isolamento entre auditorias/empresas

Como o `useMemo` depende de `company` (objeto de empresa ativa) e o `processing_run_id`
diferencia corridas de processamento, trocar de empresa força necessariamente uma nova
identidade de dependências, o que:
1. invalida o `useMemo` (novo cálculo de `snapshot`);
2. gera um novo `source_file_hash`/`processing_run_id`/`runtime_trace_id`/`snapshot_id`
   completamente diferentes (pois `fileName`, `fileSize` e `competencies` mudam);
3. garante que o hard gate da seção 8.3 rejeite qualquer resquício de estado assíncrono da
   empresa anterior que tente se materializar após a troca.

## 10. Unified Consumer Parity

"Unified consumer parity" é a garantia de que **dashboard interativo** e **PDF final** produzem
números idênticos para a mesma competência/arquivo, porque ambos:
1. chamam a mesma função `buildCertifiedFinancialSnapshot()`;
2. leem os mesmos campos de `CanonicalReportDataset.facts`/`.ratios`/`.kanitz`/`.snapshot`;
3. nunca importam `bsDadosBuilder`/`indicatorsEngine` diretamente para exibir um número "ao vivo"
   fora do snapshot (a única exceção legítima registrada no código é o cálculo de
   `computeIndicatorsFromParsed` usado como *ferramenta auxiliar de depuração/drill-down por
   competência* em `Audit.tsx`, que não é usado para os números publicados no relatório final,
   apenas para tabelas de detalhe).

Checklist de paridade a validar em qualquer porte:
- O componente de card de indicadores no dashboard deve renderizar
  `reportDataset.snapshot.byCompetency[competencyKey].ratios.<campo>` — o mesmo caminho de dados
  usado pelo componente de página A4 do PDF.
- O Kanitz exibido embutido no BEx e o Kanitz exibido na aba/relatório standalone devem ambos
  renderizar `reportDataset.snapshot.kanitz` (ou `byCompetency[key].kanitz` para séries
  históricas) — nunca uma reimplementação local da fórmula.
- Qualquer diferença de arredondamento entre telas deve ser tratada exclusivamente na camada de
  formatação de apresentação (ex.: `toFixed(2)` no componente), nunca recomputando o valor
  numérico de origem.

## 11. Pontos de Integração — Mapa de Dependências

```
ParsedFinancialData + BalanceteEntry[]
        │
        ▼
 buildBSDados()                          (bsDadosBuilder.ts)
        │  BSDadosRow[]
        ▼
 computeIndicatorsForRow() ── IndicatorRow      (indicatorsEngine.ts)
        │
        ▼
 factsFromRow() ── CanonicalFacts
        │
        ▼
 buildCanonicalKanitz() ── CanonicalKanitzModel
        │
        ▼
 detectBalanceClosure() ── BalanceClosure       (residualFactsResolver.ts)
        │
        ▼
 CanonicalCompetencySnapshot  (por competência, em byCompetency)
        │
        ▼
 CertifiedFinancialSnapshot   (buildCertifiedFinancialSnapshot, Object.freeze)
        │
        ├──▶ Audit.tsx (fluxo BEx interativo) ── hard gate source binding ──▶ CanonicalReportDataset ──▶ UI (dashboard)
        │
        └──▶ Audit.tsx (fluxo relatório final) ──────────────────────────▶ CanonicalReportDataset ──▶ PDF / Exportação
```

## 12. Checklist de Implementação

1. Portar as interfaces `FactStatus`, `CanonicalFacts`, `CanonicalKanitzModel`,
   `CanonicalCompetencySnapshot`, `CertifiedFinancialSnapshot`, `SnapshotSource` **com os nomes
   de campo exatos e tipos exatos** (nenhum campo opcional deve virar obrigatório e vice-versa).
2. Implementar `hashString()` com o algoritmo djb2 exato (constante `5381`, shift `<<5`,
   `Math.abs(...).toString(36).toUpperCase()`).
3. Implementar `num()` com a mesma semântica: qualquer não-`number`-finito vira `NaN` (nunca `0`).
4. Implementar `sortCompetencies()` com suporte a chaves `YYYY-MM` e `MM/YYYY` (detecção via
   `.includes("/")` e inversão de segmentos antes do `localeCompare`).
5. Implementar `factsFromRow()` respeitando a prioridade `ativo_total` sintético > soma AC+ANC, e
   o `Math.abs()` em todos os campos de dívida.
6. Implementar `buildCanonicalKanitz()` lendo `lc`/`ls`/`lg`/`isg` do `IndicatorRow` (nunca
   recalculando localmente), e aplicando `applicable = f.patrimonio_liquido > 0` como gate único
   de aplicabilidade.
7. Implementar `buildCertifiedFinancialSnapshot()` respeitando a ordem: rows → per-row
   CanonicalCompetencySnapshot → sortCompetencies → latestKey → geração de IDs → montagem do
   snapshot → cálculo de `report_certification_status` → `Object.freeze` (exatamente nos 4
   pontos: `facts`, `kanitz`, `byCompetency`, `snapshot`).
8. Replicar o critério de falha de certificação: 3 fatos críticos finitos + zero `integrity_gates`
   com `passed:false` na competência mais recente.
9. Implementar `CanonicalReportDataset` como projeção plana + referência ao snapshot completo
   (`snapshot?: CertifiedFinancialSnapshot`).
10. Implementar o hard gate de source binding exatamente como:
    `if (processingRunId && snapshot.processing_run_id !== processingRunId) return null;`
    incluindo o log `console.error("SNAPSHOT_REUSE_CROSS_SOURCE_FAIL: ...")`.
11. Garantir que os dois pontos de materialização (BEx interativo e relatório final) apontem para
    a mesma função de serviço e produzam o mesmo shape `CanonicalReportDataset`.
12. Garantir que nenhum componente de apresentação recalcule fatos a partir de `ParsedFinancialData`
    bruto — toda leitura deve passar por `reportDataset.snapshot.*`.
13. Documentar/replicar a política de congelamento raso e garantir que nenhum código downstream
    tente mutar `snapshot.facts`/`snapshot.kanitz`/`snapshot.byCompetency`.
14. Portar `certificationResult.ts` como artefato de rastreabilidade estática (não como lógica de
    runtime).

## 13. Critérios de Homologação

1. **Determinismo de hash**: para o mesmo `fileName`, `fileSize` e conjunto de competências, duas
   chamadas de `buildCertifiedFinancialSnapshot()` em processos distintos devem produzir o mesmo
   `source_file_hash`.
2. **Congelamento efetivo**: em modo estrito, `snapshot.facts.ativo_total = 999` deve lançar
   `TypeError`; o mesmo para `snapshot.kanitz.fi = 0` e para inserir uma nova chave em
   `snapshot.byCompetency`.
3. **Gate de source binding funcional**: simular um cenário onde `processingRunId` é definido
   como `"RUN-A"` mas o snapshot construído (por exemplo, devido a uma condição de corrida)
   carrega `processing_run_id = "RUN-B"`; o `reportDataset` resultante deve ser estritamente
   `null`, e o `console.error` de `SNAPSHOT_REUSE_CROSS_SOURCE_FAIL` deve ter sido chamado.
4. **Paridade de leitura**: para uma mesma competência, o valor de `patrimonio_liquido` exibido no
   card de indicadores do dashboard deve ser bit-a-bit igual (mesmo `number`) ao valor usado na
   página A4 do PDF, ambos lidos de `reportDataset.snapshot.facts.patrimonio_liquido` (ou
   `byCompetency[key].facts.patrimonio_liquido`).
5. **Status de certificação correto**: um snapshot cuja competência mais recente tenha
   `passivo_circulante = NaN` deve produzir `report_certification_status: "FAILED"`; um snapshot
   totalmente íntegro deve produzir `"CERTIFIED"`.
6. **Nulidade correta em ausência de dados**: `buildCertifiedFinancialSnapshot(null, [])` e
   `buildCertifiedFinancialSnapshot(parsedData, [])` quando `buildBSDados` retorna `[]` devem
   ambos retornar `null` (nunca lançar exceção, nunca retornar objeto parcial).
7. **Estabilidade de memoização**: em um teste de render React, alterar apenas um estado não
   listado nas dependências do `useMemo` (ex.: um estado de UI como "aba ativa") não deve
   provocar nova chamada de `buildCertifiedFinancialSnapshot` (verificável via spy/mocks).
8. **Ausência de fallback proibido**: varredura estática (grep) no código portado não deve
   encontrar nenhum consumidor de relatório importando `bsDadosBuilder`/`indicatorsEngine`
   diretamente para produzir um valor que já exista em `CertifiedFinancialSnapshot`.
