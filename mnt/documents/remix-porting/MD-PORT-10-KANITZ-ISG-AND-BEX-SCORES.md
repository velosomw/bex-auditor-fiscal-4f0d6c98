# MD-PORT-10 — Kanitz, ISG e BEx Solvency Scores

## 1. Objetivo

Especificar, para replicação exata, todas as fórmulas, insumos, faixas de classificação e regras
de persistência dos scores de solvência da plataforma BEx: **Fator de Insolvência de Kanitz
(FI/K)**, **Índice de Solvência Geral (ISG)** e o modelo **BEx-RJ / BEx Solvency Score**
resultante da combinação dos dois (`modelo_preferencial`). Fontes primárias analisadas:
`src/services/kanitzCalculator.ts`, `src/services/kanitzMonthly.ts`,
`supabase/functions/audit-bs-dados/core.ts` (função `computeKanitz`) e o schema da tabela
`kanitz_scores` (migrations `20260429204506_...sql` e `20260522013413_...sql`).

## 2. Escopo

Em escopo:
- Fórmula canônica `FI = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5` e suas **3 variantes de
  insumo** presentes no código-fonte (cliente `kanitzCalculator.ts`, cliente
  `kanitzMonthly.ts`, backend `core.ts`), com a definição exata de X1..X5 em cada variante.
- Faixas de classificação de risco (Kanitz) usadas em cada variante.
- Regra `NOT_APPLICABLE`/bloqueio quando `PL <= 0` (e a variante mais restritiva de bloqueio por
  `|PL| < 5% do Ativo Total`, presente apenas no backend).
- Fórmula `ISG = AT / (PC + PNC)` e suas faixas de classificação.
- O conceito de "BEx-RJ / BEx Solvency Score" como a política de **modelo preferencial**
  (`modelo_preferencial: "kanitz" | "isg"`) que a plataforma usa para decidir qual dos dois
  indicadores deve ser destacado como "score de solvência principal" de uma competência.
- Estrutura da tabela `kanitz_scores` e mapeamento exato de campos.
- Exemplos numéricos completos (marcados como **sintéticos**, pois não foi localizada massa de
  dados real de produção acessível neste ambiente de documentação).

Fora de escopo: extração contábil bruta (`bsDadosBuilder.ts`, Ref1/GROUP_LABELS — MD-PORT-08),
demais indicadores de liquidez/rentabilidade não ligados a Kanitz/ISG (`indicatorsEngine.ts`
cobre liquidez corrente/seca/geral, mas eles são tratados aqui apenas como insumos de Kanitz).

## 3. Pré-requisitos

- Conhecimento do modelo Kanitz clássico (Stephen Charles Kanitz, "Como prever falências", 1978).
- Leitura prévia de MD-PORT-08 (estrutura de `CanonicalFacts`, `CanonicalKanitzModel`,
  `IndicatorRow`).
- Entendimento de que a plataforma possui **três implementações paralelas e não totalmente
  idênticas** da fórmula Kanitz, cada uma otimizada para um contexto de consumo diferente:
  1. `canonicalFinancialSnapshotService.buildCanonicalKanitz()` — modelo unificado do snapshot
     (documentado em MD-PORT-08 seção 6.4; é o que efetivamente alimenta a UI/PDF via
     `CertifiedFinancialSnapshot.kanitz`).
  2. `kanitzCalculator.ts` — pipeline "V2" com camadas de auditoria/origem/bloqueio, histórico e
     usado para inputs vindos de OCR (`ParsedFinancialData`) ou de IA (`aiAnalysis`).
  3. `kanitzMonthly.ts` — série mensal com proxies determinísticos, consumida por componentes de
     série histórica/gráfico.
  4. `core.ts` (`computeKanitz`, edge function) — implementação backend "autoritativa" para
     persistência em `kanitz_scores`, com regra adicional de bloqueio por materialidade de PL.

  Este documento cobre as variantes **2, 3 e 4** (que usam explicitamente a nomenclatura
  X1..X5/RL-LG-LS-LC-GE citada no pedido); a variante 1 (RPL/LG/LS/LC/GE do snapshot) já está
  descrita em MD-PORT-08 e é referenciada aqui apenas para contraste.

## 4. Fórmula Canônica Kanitz

A fórmula, **idêntica em coeficientes** nas quatro implementações, é:

```
FI = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5
```

Onde, na convenção de nomenclatura usada por `kanitzMonthly.ts` (citada explicitamente no
cabeçalho do arquivo fonte):

```
X1 = Resultado / Ativo Total
X2 = Patrimônio Líquido / Ativo Total
X3 = Liquidez Geral
X4 = Liquidez Corrente
X5 = Endividamento Total = (PC + PNC) / Ativo Total   [Golden Test: 81,01%]
```

**Atenção**: esta é a definição documental (comentário de cabeçalho) de `kanitzMonthly.ts`, mas o
**código executável real** de X1..X5 em cada arquivo diverge ligeiramente entre si (ver seções
5, 6 e 7). A tabela abaixo consolida as três variantes de insumo efetivamente implementadas.

### 4.1 Tabela comparativa de insumos (X1..X5 por implementação)

| Símbolo | `kanitzCalculator.ts` (`computeIndicators`) | `kanitzMonthly.ts` (`calcKanitzScore`) | `core.ts` (`computeKanitz`, backend) |
|---|---|---|---|
| X1 (peso 0,05) | `RL = PL>0 ? lucroLiquido/PL : 0` | `RL = PL>0 ? resultado/PL : 0` | `x1 = safe(LL, PL)` = `LL/PL` (0 se `\|PL\|<0,01`) |
| X2 (peso 1,65) | `LG = (PC+ELP)>0 ? (AC+RLP)/(PC+ELP) : 0` | `LG = pt>0 ? (AC+RLPeff)/pt : (AC/(dividaTotal‖1))` | `x2 = safe(AC+RLP, PC+PNC)` |
| X3 (peso 3,55) | `LS = PC>0 ? (AC−estoques)/PC : 0` | `LS = (AC−estoques)/pc` (pc = PC‖1) | `x3 = safe(AC−estoques, PC)` |
| X4 (peso −1,06) | `LC = PC>0 ? AC/PC : 0` | `LC = AC/pc` (pc = PC‖1) | `x4 = safe(AC, PC)` |
| X5 (peso −0,33) | `GE = PL>0 ? (PC+ELP)/PL : 0` | `GE = PL>0 ? pt/PL : 0` | `x5 = safe(PC+PNC, PL)` |

Notas de nomenclatura: em `kanitzCalculator.ts` e `kanitzMonthly.ts`, X1 é chamado `rl`
("Rentabilidade do PL", não confundir com "Receita Líquida"), X2 é `lg` (Liquidez Geral), X3 é
`ls` (Liquidez Seca), X4 é `lc` (Liquidez Corrente), X5 é `ge` (Grau de Endividamento). No
backend `core.ts`, os mesmos cinco valores são nomeados diretamente `x1`..`x5` e persistidos com
esses nomes na tabela `kanitz_scores`.

`safe(n, d)` no backend é definido como:
```ts
const safe = (n: number, d: number) => (Math.abs(d) < 0.01 ? 0 : n / d);
```
ou seja, denominador "quase zero" (`|d| < 0.01`) produz `0` (não `NaN`/`Infinity`) — diferente da
convenção `NaN`-como-sentinela usada em `canonicalFinancialSnapshotService.ts` (MD-PORT-08). Esta
é uma divergência arquitetural conhecida entre a camada "snapshot" (mais recente, `NaN`-safe) e a
camada legada "backend core" (mais antiga, `0`-safe).

## 5. `kanitzCalculator.ts` — Pipeline V2 (Camadas 1–5)

### 5.1 Estruturas de dados

```ts
export type KanitzClassification = "saudavel" | "atencao" | "insolvencia" | "bloqueado";
export type KanitzOrigin = "ocr" | "ia" | "manual" | "integracao";

export interface KanitzNormalizedInput {
  periodo: string;
  ac: number;          // Ativo Circulante
  pc: number;          // Passivo Circulante
  rlp: number;         // Realizável a Longo Prazo
  elp: number;         // Exigível a Longo Prazo (= Passivo Não Circulante)
  pl: number;          // Patrimônio Líquido
  estoques: number;
  lucroLiquido: number;
  origem: KanitzOrigin;
  confianca: number;   // 0..1
  contasFaltantes: number;
  totalContasEsperadas: number;
}

export interface KanitzIndicators {
  rl: number;   // RL = Lucro Líquido / PL  (Rentabilidade do PL)
  lg: number;   // LG = (AC + RLP) / (PC + ELP)  Liquidez Geral
  ls: number;   // LS = (AC − Estoques) / PC     Liquidez Seca
  lc: number;   // LC = AC / PC                  Liquidez Corrente
  ge: number;   // GE = (PC + ELP) / PL          Grau de Endividamento
  isg: number;  // ISG = Ativo Total / Passivo Exigível (PC + PNC)
}
```

### 5.2 Camada 1 — extração de insumos (dois caminhos)

**Caminho OCR** (`extractFromParsed`) — varre `ParsedFinancialData.balanco`/`.dre` por palavra-
chave (`findValue`), com preferência de rótulo "total do X" sobre "X" simples:

```ts
const ac  = Math.abs(findValue(parsed, "total do ativo circulante", year) || findValue(parsed, "ativo circulante", year));
const pc  = Math.abs(findValue(parsed, "total do passivo circulante", year) || findValue(parsed, "passivo circulante", year));
const elp = Math.abs(
  findValue(parsed, "total do passivo não circulante", year) ||
  findValue(parsed, "passivo nao circulante", year) ||
  findValue(parsed, "passivo não circulante", year) ||
  findValue(parsed, "exigível a longo prazo", year)
);
const rlp = Math.abs(findValue(parsed, "realizável a longo prazo", year) || findValue(parsed, "realizavel", year));
// PL preserva o sinal — necessário para detectar PL negativo (bloqueio MD)
const pl = findValue(parsed, "total do patrimônio", year) ||
           findValue(parsed, "patrimonio líquido", year) ||
           findValue(parsed, "patrimônio líquido", year);
const estoques = Math.abs(findValue(parsed, "estoque", year));
const lucroLiquido = findValue(parsed, "resultado do exercício", year) || findValue(parsed, "lucro líquido", year);
```

Contagem de contas faltantes: `expected = ["ac","pc","elp","pl","estoques"]`;
`faltantes = expected.length - count(valores !== 0)`. Confiança fixa `confianca: 0.85` neste
caminho.

**Caminho IA** (`extractFromAiAnalysis`) — lê diretamente de
`aiAnalysis.diagnostico.estruturaFinanceira` (sem RLP, `rlp: 0` fixo), com `confianca: 0.75`.

### 5.3 Camada 5 — regras de bloqueio (`checkBlocks`)

```ts
export function checkBlocks(input: KanitzNormalizedInput): KanitzBlock {
  const reasons: string[] = [];
  // FACT 21: Applicability is mandatory if PL > 0
  if (input.pl <= 0) reasons.push("PL ≤ 0 (patrimônio líquido nulo ou negativo)");
  if (input.pc === 0) reasons.push("PC = 0 (passivo circulante ausente)");
  const pctFaltante = input.totalContasEsperadas > 0 ? input.contasFaltantes / input.totalContasEsperadas : 0;
  if (pctFaltante > 0.20) {
    reasons.push(`Dados incompletos: ${(pctFaltante * 100).toFixed(0)}% das contas faltantes`);
  }
  return { blocked: reasons.length > 0, reasons };
}
```

Três motivos de bloqueio, cada um adicionado independentemente à lista `reasons` (podem coexistir
todos ao mesmo tempo):
1. `PL <= 0`.
2. `PC === 0` (sem passivo circulante — indica dados incompletos, não necessariamente saudável).
3. Percentual de contas faltantes **estritamente maior que 20%** (`> 0.20`).

`block.blocked = reasons.length > 0`.

### 5.4 Camada 2 — Indicadores (`computeIndicators`)

```ts
export function computeIndicators(input: KanitzNormalizedInput): KanitzIndicators {
  const { ac, pc, rlp, elp, pl, estoques, lucroLiquido } = input;
  const rl = pl > 0 ? lucroLiquido / pl : 0;
  const lg = (pc + elp) > 0 ? (ac + rlp) / (pc + elp) : 0;
  const ls = pc > 0 ? (ac - estoques) / pc : 0;
  const lc = pc > 0 ? ac / pc : 0;
  const ge = pl > 0 ? (pc + elp) / pl : 0;
  const isg = (pc + elp) > 0 ? (ac + rlp + (input.rlp || 0)) / (pc + elp) : 0;
  return { rl, lg, ls, lc, ge, isg };
}
```

Nota de implementação a preservar literalmente: o cálculo de `isg` nesta função soma `rlp` **duas
vezes** (`ac + rlp + (input.rlp || 0)`) — isto é uma particularidade do código-fonte atual
(possível redundância defensiva, não um erro de dígito different; deve ser replicada tal como
está para manter paridade numérica exata com o sistema legado, a menos que o time de portabilidade
decida corrigi-la deliberadamente como parte de um novo MD de correção).

### 5.5 Camada 3 — Cálculo de K (`computeK`)

```ts
export function computeK(ind: KanitzIndicators): number {
  const K = (0.05 * ind.rl) + (1.65 * ind.lg) + (3.55 * ind.ls) - (1.06 * ind.lc) - (0.33 * ind.ge);
  console.log(`Assertion Match: RL=${ind.rl.toFixed(4)}, LG=${ind.lg.toFixed(4)}, LS=${ind.ls.toFixed(4)}, LC=${ind.lc.toFixed(4)}, GE=${ind.ge.toFixed(4)} | K=${K.toFixed(4)}`);
  return K;
}
```

### 5.6 Camada 4 — Classificação (`classifyK`)

```ts
export function classifyK(k: number): KanitzClassification {
  if (k > 0) return "saudavel";
  if (k > -3) return "atencao";
  return "insolvencia";
}
```

Faixas (aplicadas apenas se não bloqueado):
| Faixa de K | Classificação |
|---|---|
| `K > 0` | `saudavel` |
| `-3 < K <= 0` | `atencao` |
| `K <= -3` | `insolvencia` |
| bloqueado (`checkBlocks`) | `bloqueado` |

### 5.7 Pipeline completo (`calcKanitz`) e regra `NOT_APPLICABLE`

```ts
export function calcKanitz(input: KanitzNormalizedInput, kExcel?: number): KanitzResultV2 {
  const block = checkBlocks(input);
  const indicators = computeIndicators(input);
  const validation = validateIndicators(indicators);

  // MD-BEX-MULTI-BALANCETE Requirement 08: PL <= 0 implies NOT_APPLICABLE
  const isApplicable = input.pl > 0 && !block.blocked;
  const k = isApplicable ? computeK(indicators) : NaN;
  const classificacao: KanitzClassification = isApplicable ? classifyK(k) : "bloqueado";

  const cmp = compareWithExcel(k, kExcel);

  return {
    periodo: input.periodo, input, indicators, validation, k, classificacao, block,
    applicability: isApplicable ? "APPLICABLE" : "NOT_APPLICABLE",
    reason_code: input.pl > 0 ? "EQUITY_POSITIVE" : "EQUITY_NON_POSITIVE",
    alternative_indicator: "ISG",
    kExcel, diff: cmp.diff, diffStatus: cmp.status
  };
}
```

Regra `NOT_APPLICABLE` exata: `isApplicable = input.pl > 0 && !block.blocked`. Ou seja, mesmo com
`PL > 0`, o Kanitz pode ser marcado `NOT_APPLICABLE` se houver outro motivo de bloqueio (PC=0 ou
>20% de contas faltantes). Quando não aplicável: `k = NaN` (nunca `0`), `classificacao =
"bloqueado"`, e `alternative_indicator: "ISG"` é sempre anexado ao resultado como sugestão de
indicador substituto — este é o precursor conceitual do `modelo_preferencial` do backend (seção
7.6).

`reason_code` é derivado **apenas** de `pl > 0` (não do bloqueio completo): `"EQUITY_POSITIVE"` se
`PL > 0`, senão `"EQUITY_NON_POSITIVE"` — mesma convenção de `CanonicalKanitzModel.reason_code`
em MD-PORT-08.

### 5.8 Camada 5 — Cross-check com Excel (`compareWithExcel`)

```ts
export function compareWithExcel(k: number, kExcel?: number): { diff?: number; status?: ... } {
  if (kExcel === undefined || kExcel === null) return {};
  const diff = Math.abs(k - kExcel);
  let status;
  if (diff < 0.01) status = "OK";
  else if (diff < 0.1) status = "WARNING";
  else if (diff <= 0.5) status = "ERROR";
  else status = "CRITICAL";
  return { diff, status };
}
```

Faixas de divergência (golden test contra planilha de referência):
| `|K − K_Excel|` | Status |
|---|---|
| `< 0,01` | `OK` |
| `[0,01 ; 0,1)` | `WARNING` |
| `[0,1 ; 0,5]` | `ERROR` |
| `> 0,5` | `CRITICAL` |

### 5.9 Pipeline em lote (`buildKanitzSeries`) e fallback IA

```ts
export function buildKanitzSeries(parsed, aiAnalysis?): KanitzResultV2[] {
  const out: KanitzResultV2[] = [];
  if (parsed && parsed.years?.length) {
    for (const year of parsed.years) {
      const input = extractFromParsed(parsed, year, "ocr");
      out.push(calcKanitz(input));
    }
  }
  const allBlocked = out.length > 0 && out.every(r => r.block.blocked || (r.k === 0 && r.indicators.lc === 0));
  if (out.length === 0 || allBlocked) {
    const aiInput = extractFromAiAnalysis(aiAnalysis);
    if (aiInput) {
      const kAi = Number(aiAnalysis?.kanitz?.fatorInsolvencia);
      const result = calcKanitz(aiInput, isFinite(kAi) ? kAi : undefined);
      return [result];
    }
  }
  return out;
}
```

Regra de fallback: se **todos** os anos OCR estão bloqueados ou "vazios" (`k===0 && lc===0`),
tenta reconstituir um único resultado a partir de `aiAnalysis`, usando
`aiAnalysis.kanitz.fatorInsolvencia` (se numérico finito) como `kExcel` para cross-check.

### 5.10 Metadados visuais (`KANITZ_CLASS_META`)

```ts
export const KANITZ_CLASS_META: Record<KanitzClassification, {label, icon, color, tone}> = {
  saudavel:    { label: "SAUDÁVEL",    icon: "🟢", color: "hsl(150,70%,42%)", tone: "ok" },
  atencao:     { label: "ATENÇÃO",     icon: "🟡", color: "hsl(34,95%,55%)",  tone: "warn" },
  insolvencia: { label: "INSOLVÊNCIA", icon: "🔴", color: "hsl(0,75%,55%)",   tone: "danger" },
  bloqueado:   { label: "BLOQUEADO",   icon: "⛔", color: "hsl(220,10%,55%)", tone: "neutral" },
};
```

Mapeamento de compatibilidade legado (`mapToLegacyClass`): `saudavel→solvente`,
`insolvencia|bloqueado→insolvente`, qualquer outro (`atencao`) → `penumbra`.

## 6. `kanitzMonthly.ts` — Série Mensal com Proxies Determinísticos

### 6.1 Motivação e proxies documentados

```
Como o BSDadosRow é derivado de balancete (não DRE+BP completos), usamos
proxies determinísticos e transparentes:
  ativo_total ≈ ativo_circulante (proxy quando ANC não é capturado)
  patrimonio_liquido ≈ ativo_total − divida_total (equação contábil)
A UI exibe os valores derivados para auditoria.
```

### 6.2 `calcKanitzScore` — fórmula com RLP em cascata de prioridade

```ts
export function calcKanitzScore(input: {
  resultado: number; pl: number; ac: number; anc: number; pc: number; pnc: number;
  estoques: number; dividaTotal: number;
  rlp?: number; imobilizado?: number; intangivel?: number; investimentos?: number;
}): { K: number; RL: number; LG: number; LS: number; LC: number; GE: number } {
  const pl = input.pl;
  const pc = input.pc || 1;
  const at = (input.ac || 0) + (input.anc || 0);
  const pt = (input.pc || 0) + (input.pnc || 0);

  const RL = pl > 0 ? input.resultado / pl : 0;

  const rlpExplicit = input.rlp ?? 0;
  const rlpResidual = (input.anc || 0) - (input.imobilizado ?? 0) - (input.intangivel ?? 0) - (input.investimentos ?? 0);
  const rlpEff = rlpExplicit > 0 ? rlpExplicit : (rlpResidual > 0 ? rlpResidual : (input.anc || 0));
  const LG = pt > 0 ? (input.ac + rlpEff) / pt : (input.ac / (input.dividaTotal || 1));

  const LS = (input.ac - input.estoques) / pc;
  const LC = input.ac / pc;
  const GE = pl > 0 ? pt / pl : 0;

  const K = (0.05 * RL) + (1.65 * LG) + (3.55 * LS) - (1.06 * LC) - (0.33 * GE);
  return { K: Number(K.toFixed(4)), RL, LG, LS, LC, GE };
}
```

Prioridade de resolução de RLP (idêntica à do backend, seção 7): (1) RLP explícito discriminado
(Refs P..T do balancete) → (2) RLP residual = `ANC − Imobilizado − Intangível − Investimentos`
(se > 0) → (3) fallback = ANC total.

Divisor de segurança: `pc = input.pc || 1` (evita divisão por zero substituindo por `1`, não por
gate de `NaN`) — aplicado a LS e LC, mas **não** a LG (que usa `pt` com checagem explícita
`pt > 0`) nem a RL/GE (que usam checagem explícita `pl > 0`).

### 6.3 Classificação de 4 faixas (`classifyKanitz`) — diferente de `classifyK`

```ts
export function classifyKanitz(score: number): KanitzRating {
  if (score > 0) return "A";
  if (score > -3) return "B";
  if (score > -7) return "C";
  return "D";
}
```

| Faixa de K | Rating | Rótulo (`KANITZ_RATING_META`) | Tom |
|---|---|---|---|
| `K > 0` | `A` | "A - Saudável" 🟢 `hsl(150,70%,42%)` | `ok` |
| `-3 < K <= 0` | `B` | "B - Atenção" 🟡 `hsl(48,96%,53%)` | `warn` |
| `-7 < K <= -3` | `C` | "C - Risco" 🟠 `hsl(28,92%,55%)` | `alert` |
| `K <= -7` | `D` | "D - Insolvência" 🔴 `hsl(0,75%,55%)` | `danger` |

Esta é a variante de **4 faixas** (A/B/C/D), distinta da variante de **3 faixas**
(saudavel/atencao/insolvencia) de `kanitzCalculator.ts` e da variante de **5 faixas**
(saudavel/estavel/atencao/risco/insolvente) do modelo unificado do snapshot (MD-PORT-08 §6.4).
Estas três granularidades **coexistem no código-fonte atual** e devem ser portadas
separadamente, cada uma associada ao seu respectivo consumidor de UI — não devem ser unificadas
arbitrariamente sem uma decisão explícita de produto.

### 6.4 `buildKanitzMonthlySeries` — pipeline completo por linha

Para cada `BSDadosRow` ordenado por `mesKey`:

1. **Ativo Total**: `ativoTotal = ativo_circulante + ativo_nao_circulante`. Se `ativo_nao_circulante`
   não foi capturado (`<= 0`), gera warning `"Ativo Não Circulante não capturado — Ativo Total = AC (proxy)"`.
   Se `ativoTotal === 0`, warning `"Ativo total ausente — score não confiável"`.
2. **PL**: se `patrimonio_liquido !== 0` usa o valor real; senão usa proxy
   `ativoTotal - divida_total` com warning `"PL não capturado — usando Ativo Total − Dívida Total (aproximação)"`.
3. **Liquidez Corrente**: `ativo_circulante / passivo_circulante` (0 se `passivo_circulante <= 0`).
4. **Liquidez Geral**: `(ativo_circulante + rlpEff) / (passivo_circulante + passivo_nao_circulante)`
   com o mesmo esquema de prioridade de RLP da seção 6.2 (fallback para `liquidezCorrente` se
   `passivoTotal <= 0`).
5. Chama `calcKanitzScore(...)` com os valores acima.
6. Classifica via `classifyKanitz(K)` e monta `insight` via `genInsight(K, prevScore)`.

### 6.5 Geração de insight textual (`genInsight`)

```ts
function genInsight(score: number, prevScore?: number): string {
  if (score < -7) return "Alto risco de insolvência — reestruturação imediata recomendada (Lei 11.101/2005).";
  if (score < -3) return "Zona de risco elevado — fragilidade nos indicadores de liquidez e endividamento.";
  if (score < 0) return "Zona de atenção — monitorar evolução mensal e revisar política de capital.";
  if (prevScore !== undefined && score > prevScore + 0.3) return "Recuperação financeira em curso — score em melhora consistente.";
  return "Empresa financeiramente saudável — manter monitoramento trimestral.";
}
```

Ordem de avaliação estrita (primeiro `if` verdadeiro vence): `< -7` → insolvência/Lei 11.101/2005;
`< -3` → risco elevado; `< 0` → atenção; senão, se houve melhora `> +0,3` em relação ao mês
anterior → mensagem de recuperação; caso contrário → mensagem de saudável estável.

### 6.6 `summarizeKanitzSeries` — agregação da série

```ts
export function summarizeKanitzSeries(series: KanitzMonthlyResult[]): KanitzMonthlySummary | null {
  ...
  const avg = scores.reduce((a,b)=>a+b,0)/scores.length;
  const delta = series.length > 1 ? latest.score - earliest.score : 0;
  const trend = delta > 0.3 ? "up" : delta < -0.3 ? "down" : "stable";
  const globalRating = classifyKanitz(avg);
  ...
}
```

`trend` usa o mesmo limiar `0,3` de `genInsight`. `globalRating` classifica a **média** da série
(não o último valor) usando `classifyKanitz`.

## 7. `core.ts` (Backend) — `computeKanitz` Autoritativo para Persistência

### 7.1 Código-fonte completo da função

```ts
export function computeKanitz(rows: BSDadosRow[]): KanitzRow[] {
  return rows.map(r => {
    const AC = r.ativo_circulante;
    const ANC = r.ativo_nao_circulante;
    const PC = r.passivo_circulante;
    const PNC = r.passivo_nao_circulante;
    const PL = r.patrimonio_liquido;
    const LL = r.resultado;
    const RLP = r.realizavel_longo_prazo > 0
      ? r.realizavel_longo_prazo
      : Math.max(ANC - r.imobilizado - r.intangivel - r.investimentos, 0) || ANC;
    const safe = (n: number, d: number) => (Math.abs(d) < 0.01 ? 0 : n / d);

    // FIX #3 — Bloqueio metodológico: Kanitz é INVÁLIDO quando |PL| < 5% do Ativo Total
    const plMin = Math.max(r.ativo_total * 0.05, 1);
    const kanitzBloqueado = Math.abs(PL) < plMin || r.ativo_total <= 0;

    const x1 = safe(LL, PL);
    const x2 = safe(AC + RLP, PC + PNC);
    const x3 = safe(AC - r.estoques, PC);
    const x4 = safe(AC, PC);
    const x5 = safe(PC + PNC, PL);
    const scoreRaw = 0.05 * x1 + 1.65 * x2 + 3.55 * x3 - 1.06 * x4 - 0.33 * x5;
    const score = kanitzBloqueado ? 0 : scoreRaw;

    let rating = "Pré-Insolvência (Penumbra)";
    let insight = "Faixa de penumbra — sinais de fragilidade, monitorar.";
    if (kanitzBloqueado) {
      rating = "Bloqueado (PL insuficiente)";
      insight = `Kanitz não aplicável: |PL|=${Math.abs(PL).toFixed(0)} < 5% do Ativo Total (${r.ativo_total.toFixed(0)}). Use ISG.`;
    } else if (score > 0) { rating = "Solvente"; insight = "Empresa em situação financeira saudável (TK > 0)."; }
    else if (score < -3) { rating = "Insolvência (Falência)"; insight = "Forte indicativo de insolvência (TK < -3)."; }

    const passivoTotal = PC + PNC;
    const isg = safe(r.ativo_total, passivoTotal);
    let isg_rating = "Crítico/Insolvente";
    if (isg >= 1.5) isg_rating = "Excelente/Solvente";
    else if (isg >= 1.0) isg_rating = "Aceitável/Equilíbrio";

    const modelo_preferencial: "kanitz" | "isg" = (kanitzBloqueado || PL <= 0) ? "isg" : "kanitz";

    return {
      mesKey: r.mesKey, ativo_total: r.ativo_total, passivo_total: passivoTotal,
      patrimonio_liquido: PL,
      x1: Number(x1.toFixed(4)), x2: Number(x2.toFixed(4)), x3: Number(x3.toFixed(4)),
      x4: Number(x4.toFixed(4)), x5: Number(x5.toFixed(4)),
      score: Number(score.toFixed(4)), rating, insight,
      isg: Number(isg.toFixed(4)), isg_rating, modelo_preferencial,
    };
  });
}
```

### 7.2 Regra de bloqueio por materialidade de PL — exclusiva do backend

```ts
const plMin = Math.max(r.ativo_total * 0.05, 1);
const kanitzBloqueado = Math.abs(PL) < plMin || r.ativo_total <= 0;
```

Esta é a regra **mais restritiva** entre as quatro implementações: Kanitz é considerado
metodologicamente inválido não apenas quando `PL <= 0`, mas sempre que `|PL|` é **menor que 5% do
Ativo Total** (mínimo absoluto de `1`, para evitar divisão por valores ínfimos quando
`ativo_total` é pequeno), OU quando `ativo_total <= 0`. Justificativa no comentário do código:
"Kanitz é INVÁLIDO quando |PL| < 5% do Ativo Total (denominadores RPL e GE divergem). NBC TA 200
§A20 — ceticismo profissional." Quando bloqueado: `score = 0` (não `NaN` — divergência de
convenção de sentinela já registrada na seção 4.1), `rating = "Bloqueado (PL insuficiente)"`.

### 7.3 Faixas de classificação (`rating`, 4 categorias textuais)

| Condição | `rating` |
|---|---|
| `kanitzBloqueado` (|PL| < 5%·AT ou AT≤0) | `"Bloqueado (PL insuficiente)"` |
| não bloqueado E `score > 0` | `"Solvente"` |
| não bloqueado E `score < -3` | `"Insolvência (Falência)"` |
| não bloqueado E `-3 <= score <= 0` (default inicial) | `"Pré-Insolvência (Penumbra)"` |

### 7.4 ISG no backend

```
ISG = AT / (PC + PNC)   (via safe(), 0 se denominador quase-zero)
```

| Faixa de ISG | `isg_rating` |
|---|---|
| `ISG >= 1,5` | `"Excelente/Solvente"` |
| `1,0 <= ISG < 1,5` | `"Aceitável/Equilíbrio"` |
| `ISG < 1,0` | `"Crítico/Insolvente"` |

Esta é a mesma tabela de limiares (`1,5` e `1,0`) usada em `indicatorsEngine.buildISGSeries` (seção
8) e em `kanitzCalculator.KanitzIndicators.isg` (definição de fórmula), confirmando consistência
de faixas entre camadas, ainda que os rótulos textuais variem (`"Solvente"/"Atenção"/"Insolvente"`
no frontend vs. `"Excelente/Solvente"/"Aceitável/Equilíbrio"/"Crítico/Insolvente"` no backend).

### 7.5 `modelo_preferencial` — a política "BEx-RJ / BEx Solvency Score"

```ts
const modelo_preferencial: "kanitz" | "isg" = (kanitzBloqueado || PL <= 0) ? "isg" : "kanitz";
```

Esta é a **regra de decisão do BEx Solvency Score**: o sistema não exibe cegamente o Fator de
Insolvência de Kanitz como único score de solvência; ele decide, por competência, qual dos dois
indicadores (`kanitz` ou `isg`) deve ser tratado como o **indicador preferencial/principal** a ser
destacado na narrativa e nos cards de score, com base em:
- `kanitzBloqueado = true` (|PL| < 5% do AT, ou AT ≤ 0) → preferir `"isg"`;
- OU `PL <= 0` (patrimônio líquido negativo/nulo, tipicamente empresas em Recuperação Judicial ou
  insolvência técnica) → preferir `"isg"`;
- caso contrário → preferir `"kanitz"`.

Esta é a origem funcional do "BEX Solvency Score" mencionado no pedido: **não é uma terceira
fórmula numérica independente**, e sim uma **política de seleção binária** entre os dois scores já
calculados (Kanitz FI e ISG), fundamentada na premissa de que o modelo Kanitz perde validade
estatística quando o PL é negativo ou imaterial — cenário típico de empresas em processo de
Recuperação Judicial ("BEx-RJ"), para as quais o ISG (que depende apenas de Ativo Total e Passivo
Exigível, não do PL) é metodologicamente mais robusto.

## 8. ISG (Índice de Solvência Geral) — Definição Unificada

### 8.1 Fórmula

```
ISG = Ativo Total / (Passivo Circulante + Passivo Não Circulante)
    = AT / (PC + PNC)
```

Implementações equivalentes encontradas:
- `indicatorsEngine.computeIndicatorsForRow`: `isg: pt > 0 ? at / pt : NaN` (linha 171) —
  sentinela `NaN`.
- `indicatorsEngine.buildISGSeries`: `isg = pt > 0 ? at / pt : 0` (linha 215) — sentinela `0`
  (nesta função específica, não em `computeIndicatorsForRow`).
- `kanitzCalculator.computeIndicators`: `isg = (pc+elp)>0 ? (ac+rlp+(input.rlp||0))/(pc+elp) : 0`
  — usa AC+2×RLP em vez de Ativo Total puro (ver nota de redundância, seção 5.4).
- `core.ts computeKanitz`: `isg = safe(r.ativo_total, passivoTotal)` — sentinela `0`.
- `canonicalFinancialSnapshotService.buildCanonicalKanitz`: `isg = ind.isg` (lido diretamente de
  `IndicatorRow`, ou seja, herda a convenção `NaN` de `computeIndicatorsForRow`).

### 8.2 Faixas de classificação — `indicatorsEngine.buildISGSeries`

```ts
let label = "Insolvente"; let icon = "🔴"; let color = "hsl(0,75%,55%)";
if (isg >= 1.5) { label = "Solvente"; icon = "🟢"; color = "hsl(150,70%,42%)"; }
else if (isg >= 1.0) { label = "Atenção"; icon = "🟡"; color = "hsl(34,95%,55%)"; }
```

| Faixa de ISG | Rótulo (frontend `buildISGSeries`) | Rótulo (backend `core.ts`) |
|---|---|---|
| `ISG >= 1,5` | Solvente 🟢 | Excelente/Solvente |
| `1,0 <= ISG < 1,5` | Atenção 🟡 | Aceitável/Equilíbrio |
| `ISG < 1,0` | Insolvente 🔴 | Crítico/Insolvente |

`status` do `ISGResult`: `"AVAILABLE"` somente se
`facts_status.ativo_circulante === "AVAILABLE" && facts_status.passivo_circulante === "AVAILABLE"`,
senão `"NOT_AVAILABLE"`. `reason` é preenchido com
`"Patrimônio Líquido negativo — ISG é o principal indicador de solvência."` quando
`patrimonio_liquido <= 0` — reforçando a narrativa de que o ISG é o indicador substituto natural
do Kanitz nesses casos (mesma lógica de `modelo_preferencial`).

## 9. Persistência — Tabela `kanitz_scores`

### 9.1 DDL original (migration `20260429204506_...sql`)

```sql
CREATE TABLE IF NOT EXISTS public.kanitz_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL,
  mes DATE NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  rating TEXT NOT NULL DEFAULT 'B - Atenção',
  x1 NUMERIC,
  x2 NUMERIC,
  x3 NUMERIC,
  x4 NUMERIC,
  x5 NUMERIC,
  ativo_total NUMERIC,
  patrimonio_liquido NUMERIC,
  insight TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (audit_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_kanitz_scores_audit ON public.kanitz_scores(audit_id);
CREATE INDEX IF NOT EXISTS idx_kanitz_scores_mes ON public.kanitz_scores(mes);

ALTER TABLE public.kanitz_scores ENABLE ROW LEVEL SECURITY;
```

### 9.2 Extensão (migration `20260522013413_...sql`)

```sql
ALTER TABLE public.kanitz_scores
  ADD COLUMN IF NOT EXISTS passivo_total numeric,
  ADD COLUMN IF NOT EXISTS isg numeric,
  ADD COLUMN IF NOT EXISTS isg_rating text,
  ADD COLUMN IF NOT EXISTS modelo_preferencial text CHECK (modelo_preferencial IN ('kanitz','isg'));
```

### 9.3 Schema final consolidado

| Coluna | Tipo | Constraint | Origem no código (`core.ts` `KanitzRow`) |
|---|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` | gerado pelo banco |
| `audit_id` | `UUID` | `NOT NULL` | parâmetro externo (id da auditoria) |
| `mes` | `DATE` | `NOT NULL`, parte da `UNIQUE(audit_id, mes)` | `` `${k.mesKey}-01` `` |
| `score` | `NUMERIC` | `NOT NULL DEFAULT 0` | `k.score` (FI, 4 casas decimais) |
| `rating` | `TEXT` | `NOT NULL DEFAULT 'B - Atenção'` | `k.rating` |
| `x1`..`x5` | `NUMERIC` | nullable | `k.x1`..`k.x5` (4 casas decimais) |
| `ativo_total` | `NUMERIC` | nullable | `k.ativo_total` |
| `patrimonio_liquido` | `NUMERIC` | nullable | `k.patrimonio_liquido` |
| `passivo_total` | `NUMERIC` | nullable (add. posterior) | `k.passivo_total` |
| `isg` | `NUMERIC` | nullable (add. posterior) | `k.isg` (4 casas decimais) |
| `isg_rating` | `TEXT` | nullable (add. posterior) | `k.isg_rating` |
| `modelo_preferencial` | `TEXT` | `CHECK IN ('kanitz','isg')` (add. posterior) | `k.modelo_preferencial` |
| `insight` | `TEXT` | nullable | `k.insight` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | gerado pelo banco |

Constraint de unicidade `UNIQUE (audit_id, mes)`: garante **um registro por competência por
auditoria** — reprocessamentos (`reprocess_audit_id`) fazem `DELETE FROM kanitz_scores WHERE
audit_id = ...` antes de reinserir (upsert lógico via delete+insert, não `ON CONFLICT`).

### 9.4 Política RLS

```sql
CREATE POLICY "kz_sel" ON public.kanitz_scores FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
  AND (a.created_by = auth.uid()
       OR has_role(auth.uid(), 'gestor_ia'::app_role)
       OR has_role(auth.uid(), 'coordenadora'::app_role)
       OR has_role(auth.uid(), 'auditor_chefe'::app_role))));

CREATE POLICY "kz_ins" ON public.kanitz_scores FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
  AND a.created_by = auth.uid()));

CREATE POLICY "kz_upd" ON public.kanitz_scores FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
  AND (a.created_by = auth.uid()
       OR has_role(auth.uid(), 'gestor_ia'::app_role)
       OR has_role(auth.uid(), 'coordenadora'::app_role))));

CREATE POLICY "kz_del" ON public.kanitz_scores FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
  AND (a.created_by = auth.uid()
       OR has_role(auth.uid(), 'gestor_ia'::app_role)
       OR has_role(auth.uid(), 'coordenadora'::app_role))));
```

Regras: `SELECT` liberado ao criador da auditoria e aos papéis `gestor_ia`, `coordenadora`,
`auditor_chefe`; `INSERT` restrito ao criador; `UPDATE`/`DELETE` liberados ao criador e a
`gestor_ia`/`coordenadora` (nota: `auditor_chefe` **não** tem permissão de update/delete, apenas
de leitura — assimetria a preservar exatamente no porte).

### 9.5 Fluxo de gravação (edge function `audit-bs-dados`)

```ts
const kanitzRows = kanitz.map(k => ({
  audit_id: auditId, mes: `${k.mesKey}-01`,
  ativo_total: k.ativo_total, passivo_total: k.passivo_total,
  patrimonio_liquido: k.patrimonio_liquido,
  x1: k.x1, x2: k.x2, x3: k.x3, x4: k.x4, x5: k.x5,
  score: k.score, rating: k.rating, insight: k.insight,
  isg: k.isg, isg_rating: k.isg_rating,
  modelo_preferencial: k.modelo_preferencial,
}));
await supabase.from("kanitz_scores").delete().eq("audit_id", auditId);
if (kanitzRows.length) ops.push(supabase.from("kanitz_scores").insert(kanitzRows));
```

Este mesmo bloco existe duplicado em dois pontos do arquivo (`~L123` no modo `reprocess_audit_id`
e `~L378` no modo de processamento normal), com a mesma forma de mapeamento — ambos devem ser
portados de forma idêntica.

## 10. Tabelas de Memória de Cálculo (A e B) — Exemplos Numéricos Sintéticos

> **Aviso obrigatório de sinteticidade**: os valores abaixo são **fictícios**, criados apenas
> para ilustrar a aplicação literal das fórmulas descritas neste documento. Não foi localizada,
> no ambiente de documentação, nenhuma base de dados de produção acessível (`kanitz_scores` real)
> para extração de exemplos reais. Qualquer implementação de homologação deve **recalcular estes
> mesmos exemplos a partir dos algoritmos** e comparar bit-a-bit, não usar os números abaixo como
> "golden data" oficial.

### 10.1 Tabela A — Insumos contábeis sintéticos (competência "2024-03")

| Insumo | Símbolo | Valor sintético (R$) |
|---|---|---|
| Ativo Circulante | AC | 1.200.000,00 |
| Ativo Não Circulante | ANC | 800.000,00 |
| Ativo Total | AT | 2.000.000,00 |
| Realizável a Longo Prazo | RLP | 150.000,00 |
| Estoques | Estoques | 300.000,00 |
| Passivo Circulante | PC | 900.000,00 |
| Passivo Não Circulante | PNC | 400.000,00 |
| Patrimônio Líquido | PL | 700.000,00 |
| Resultado do Período | LL | 50.000,00 |
| Dívida Total | Dívida Total | 700.000,00 |

### 10.2 Tabela B — Memória de cálculo (backend `computeKanitz`, valores sintéticos)

Passo a passo usando os insumos da Tabela A:

```
RLP efetivo = 150.000,00 (explícito > 0, usado diretamente)
plMin = max(AT * 0.05, 1) = max(2.000.000 * 0.05, 1) = 100.000,00
kanitzBloqueado = (|PL| < plMin) OR (AT <= 0)
                = (700.000 < 100.000) OR (2.000.000 <= 0)
                = false OR false = false   → Kanitz APLICÁVEL

X1 = LL / PL           = 50.000 / 700.000        = 0,0714
X2 = (AC+RLP)/(PC+PNC) = (1.200.000+150.000)/(900.000+400.000) = 1.350.000/1.300.000 = 1,0385
X3 = (AC-Estoques)/PC  = (1.200.000-300.000)/900.000            = 900.000/900.000     = 1,0000
X4 = AC/PC             = 1.200.000/900.000                       = 1,3333
X5 = (PC+PNC)/PL       = 1.300.000/700.000                       = 1,8571

FI = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5
   = 0,05·0,0714 + 1,65·1,0385 + 3,55·1,0000 − 1,06·1,3333 − 0,33·1,8571
   = 0,00357 + 1,71353 + 3,55000 − 1,41333 − 0,61286
   = 3,2409  (arredondado 4 casas: 3,2409)

Classificação (rating backend): FI > 0 → "Solvente"

ISG = AT / (PC+PNC) = 2.000.000 / 1.300.000 = 1,5385
isg_rating: ISG >= 1,5 → "Excelente/Solvente"

modelo_preferencial: kanitzBloqueado=false E PL>0 → "kanitz"
```

Registro sintético resultante em `kanitz_scores` (competência 2024-03):

| Campo | Valor sintético |
|---|---|
| `mes` | `2024-03-01` |
| `score` | `3.2409` |
| `rating` | `Solvente` |
| `x1` | `0.0714` |
| `x2` | `1.0385` |
| `x3` | `1.0000` |
| `x4` | `1.3333` |
| `x5` | `1.8571` |
| `ativo_total` | `2000000.00` |
| `passivo_total` | `1300000.00` |
| `patrimonio_liquido` | `700000.00` |
| `isg` | `1.5385` |
| `isg_rating` | `Excelente/Solvente` |
| `modelo_preferencial` | `kanitz` |
| `insight` | `Empresa em situação financeira saudável (TK > 0).` |

### 10.3 Exemplo sintético de bloqueio (PL negativo / RJ)

Insumos sintéticos alternativos: `AC=1.000.000; ANC=500.000; AT=1.500.000; PC=1.100.000;
PNC=600.000; PL=-200.000; RLP=0; Estoques=250.000; LL=-180.000`.

```
plMin = max(1.500.000 * 0.05, 1) = 75.000
kanitzBloqueado = (|PL|=200.000 < 75.000)? NÃO. OR (AT<=0)? NÃO. → false
  Entretanto PL <= 0 (regra separada de modelo_preferencial) → true

X1..X5 calculados normalmente com safe() (denominadores não nulos):
X1 = LL/PL = -180.000 / -200.000 = 0,9000
X2 = (AC+RLP)/(PC+PNC) = 1.000.000/1.700.000 = 0,5882
X3 = (AC-Estoques)/PC = 750.000/1.100.000 = 0,6818
X4 = AC/PC = 1.000.000/1.100.000 = 0,9091
X5 = (PC+PNC)/PL = 1.700.000/-200.000 = -8,5000

FI = 0,05·0,9000 + 1,65·0,5882 + 3,55·0,6818 − 1,06·0,9091 − 0,33·(−8,5000)
   = 0,0450 + 0,9705 + 2,4204 − 0,9636 + 2,8050
   = 5,2773

rating: FI > 0 → "Solvente" (numericamente, apesar de PL negativo — resultado
matematicamente instável, exatamente a razão da regra de materialidade e do
modelo_preferencial="isg" sobrepor este resultado na apresentação)

ISG = AT/(PC+PNC) = 1.500.000/1.700.000 = 0,8824 → isg_rating: "Crítico/Insolvente"

modelo_preferencial: PL<=0 → "isg"  (a UI deve destacar ISG=0,8824/"Crítico/Insolvente",
mesmo que score Kanitz numericamente calculado seja "positivo")
```

Este exemplo sintético ilustra por que a política `modelo_preferencial` é indispensável: com
`PL < 0`, o Fator de Insolvência de Kanitz pode produzir um resultado numericamente positivo
(falso "saudável") por inversão de sinal em X1 e X5, sendo o ISG o indicador metodologicamente
correto a ser exibido como score principal nesse cenário.

## 11. Checklist de Implementação

1. Portar as **quatro variantes** de cálculo Kanitz separadamente, sem tentar unificá-las em uma
   única função, preservando os nomes de arquivo/módulo de origem como referência de rastreio:
   `canonicalFinancialSnapshotService.buildCanonicalKanitz` (MD-PORT-08), `kanitzCalculator.ts`
   (`computeIndicators`/`computeK`/`classifyK`/`calcKanitz`), `kanitzMonthly.ts`
   (`calcKanitzScore`/`classifyKanitz`), `core.ts` (`computeKanitz`).
2. Implementar a fórmula `FI = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5` com os
   **coeficientes exatos** em todas as variantes.
3. Replicar literalmente a assimetria de sentinela de "denominador zero": `NaN` no snapshot vs.
   `0` no backend/`kanitzMonthly`/`kanitzCalculator` — não normalizar sem uma decisão de produto
   explícita, pois narrativas e testes existentes dependem dessa distinção.
4. Implementar `checkBlocks()` com os três motivos de bloqueio (`PL<=0`, `PC===0`,
   `%faltantes > 0,20`) exatamente como enumerados, incluindo as mensagens de texto em pt-BR.
5. Implementar a regra de bloqueio por materialidade do backend:
   `plMin = max(AT*0.05, 1); kanitzBloqueado = |PL| < plMin || AT <= 0`.
6. Implementar `modelo_preferencial = (kanitzBloqueado || PL<=0) ? "isg" : "kanitz"` exatamente.
7. Implementar as três granularidades de classificação Kanitz (3 faixas em
   `kanitzCalculator`, 4 faixas A/B/C/D em `kanitzMonthly`, 5 faixas no snapshot unificado, mais
   os 4 rótulos textuais do backend) sem cruzá-las.
8. Implementar ISG com a fórmula `AT / (PC+PNC)` e as faixas `>=1,5 / [1,0;1,5) / <1,0`, com os
   dois conjuntos de rótulos (frontend curto vs. backend "Excelente/Aceitável/Crítico").
9. Portar o schema `kanitz_scores` com todas as colunas, o `UNIQUE(audit_id, mes)`, o
   `CHECK (modelo_preferencial IN ('kanitz','isg'))` e as 4 policies RLS com a assimetria exata
   de papéis (leitura ampliada para `auditor_chefe`, escrita restrita).
10. Replicar o fluxo delete+insert (não upsert por `ON CONFLICT`) na gravação de `kanitz_scores`
    a cada reprocessamento.
11. Preservar a peculiaridade de `isg` somar `rlp` duas vezes em `kanitzCalculator.computeIndicators`
    (`ac + rlp + (input.rlp || 0)`), documentando-a como comportamento legado a menos que corrigida
    deliberadamente.
12. Gerar exemplos de teste (golden data) recalculando os cenários sintéticos da seção 10 com o
    código portado e conferindo convergência numérica com 4 casas decimais.

## 12. Critérios de Homologação

1. **Paridade de coeficientes**: em todas as quatro implementações portadas, os coeficientes
   `0,05 / 1,65 / 3,55 / −1,06 / −0,33` devem aparecer literalmente no código (não como constantes
   renomeadas com valores diferentes por arredondamento).
2. **Regra `NOT_APPLICABLE`**: para `PL = 0` e para `PL = -1` (qualquer valor `<= 0`), o resultado
   de `kanitzCalculator.calcKanitz` deve ter `applicability: "NOT_APPLICABLE"`, `k: NaN`,
   `classificacao: "bloqueado"`, `reason_code: "EQUITY_NON_POSITIVE"`.
3. **Regra de materialidade do backend**: para `AT = 1.000.000` e `PL = 40.000` (4% do AT, abaixo
   do limiar de 5%), `kanitzBloqueado` deve ser `true` e `modelo_preferencial` deve ser `"isg"`,
   mesmo com `PL > 0`.
4. **Consistência de faixas de ISG**: para `ISG = 1,4999`, o rótulo deve ser "Atenção"/"Aceitável"
   (não "Solvente"/"Excelente"); para `ISG = 1,5000` exato, deve mudar para "Solvente"/"Excelente"
   (limiares são `>=`, não `>`).
5. **Consistência de faixas Kanitz (kanitzMonthly)**: `score = 0,0001` → rating `A`; `score = 0`
   exato → rating `B` (pois a condição é `score > 0`, estritamente maior); `score = -3,0001` →
   rating `C`; `score = -7,0001` → rating `D`.
6. **Persistência exata**: inserir um registro sintético via pipeline completo (balancete →
   `computeKanitz` → `kanitz_scores`) e validar que todas as 15 colunas de dados (excluindo
   `id`/`created_at`) batem com os valores calculados manualmente pela fórmula, com 4 casas
   decimais de tolerância para `score`/`x1`..`x5`/`isg`.
7. **RLS**: usuário com papel apenas `auditor_chefe` deve conseguir `SELECT` mas deve receber
   erro de política ao tentar `UPDATE`/`DELETE` em `kanitz_scores` de uma auditoria que não criou.
8. **Idempotência de reprocessamento**: chamar o pipeline duas vezes seguidas para o mesmo
   `audit_id` deve resultar em exatamente uma linha por competência em `kanitz_scores` (sem
   duplicatas), validando o padrão delete+insert.
9. **Fallback IA**: com `parsed.years` vazio e `aiAnalysis.kanitz.fatorInsolvencia = 2.5`, o
   resultado de `buildKanitzSeries` deve conter exatamente 1 item com `kExcel = 2.5` e
   `diffStatus` calculado por `compareWithExcel`.
