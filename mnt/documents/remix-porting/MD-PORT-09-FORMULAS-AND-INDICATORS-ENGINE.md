# MD-PORT-09 — Catálogo Completo de Fórmulas e Indicators Engine

## 1. Objetivo

Este documento especifica, em nível de replicação (implementation-grade), o motor único de
indicadores econômico-financeiros da plataforma BEx (`src/services/indicatorsEngine.ts`),
incluindo todas as fórmulas, os insumos canônicos (canonical roles do `BSDadosRow`/Canonical
Financial Snapshot), as unidades de medida, o contexto temporal de cada indicador (MONTH vs
YTD/acumulado), as regras de anualização, a política de divisão segura (`safe_divide`), a
normalização de sinal do resultado (`accountingNormalizationService`), os gates de N/A por
Patrimônio Líquido (PL) não positivo, e o mapeamento indicador → coluna persistida.

O objetivo é permitir que uma equipe de engenharia, sem acesso ao código-fonte original,
reconstrua byte-a-byte o comportamento numérico do motor de indicadores em um novo stack
(ex.: Remix), preservando 100% da paridade de cálculo com a implementação de referência.

## 2. Escopo

- Módulo `indicatorsEngine.ts` (função `computeIndicatorsForRow`, `buildIndicatorSeries`,
  `buildISGSeries`).
- Módulo `periodContextService.ts` (`resolvePeriodContext`).
- Módulo `accountingNormalizationService.ts` (`normalizeIncomeStatementSign`, `safe_divide`).
- Módulo `variationMoM.ts` (fórmulas de variação mês a mês, usadas em conjunto com a série de
  indicadores nas abas de Gráficos/Auditoria).
- Interface `IndicatorRow` (contrato de saída consumido pelas abas Indicadores, Endividamento,
  Patrimonial, Kanitz e Gráficos).

Fora de escopo deste documento: extração/OCR de balancetes (`bsDadosBuilder.ts`,
`p1SyntheticResolver.ts`), cálculo de EBITDA/LAJIR residual (`residualFactsResolver.ts` —
documentado em MD-BEX-ENGINE-FULL-TECHNICAL-SPECIFICATION), e o modelo Kanitz/ISG/BEX Score
(documentado em MD-PORT-10).

## 3. Pré-requisitos

Para reconstruir este motor, o sistema de destino precisa ter, antes do cálculo de
indicadores, o seguinte pipeline já disponível e homologado:

1. **Canonical Financial Snapshot / `BSDadosRow`**: uma linha por mês (`mesKey` no formato
   `AAAA-MM`), contendo os "canonical facts" do balanço/DRE já extraídos, normalizados e
   com sinal contábil definido (ativo = positivo; passivo/PL = positivo quando saldo credor;
   despesas podem chegar em valor absoluto ou com sinal, dependendo do campo — ver seção 5).
2. **`facts_status`**: mapa por conta indicando `"AVAILABLE" | "NOT_AVAILABLE"`, usado para
   popular `indicators_status` (gate de disponibilidade por indicador).
3. **`residual_facts`**: estrutura com `lajir`, `ebitda`, `interest_coverage`, cada um com
   `status` (`CERTIFIED | NOT_CERTIFIED | NOT_AVAILABLE | AVAILABLE`) — produzida pelo
   `residualFactsResolver.ts` (fora de escopo aqui, mas é insumo obrigatório).
4. **`resultado_acumulado` e `resultado_competencia`** (opcionais): quando presentes,
   permitem escolher entre resultado acumulado (YTD) e resultado de competência (mês
   isolado) para o cálculo de margens e rentabilidade.

## 4. Estrutura de Entrada — `BSDadosRow` (campos consumidos)

O `computeIndicatorsForRow(r: BSDadosRow): IndicatorRow` consome exatamente os seguintes
campos de `r` (nomes literais do código):

| Campo BSDadosRow | Papel canônico | Sinal esperado |
|---|---|---|
| `ativo_circulante` | AC — Ativo Circulante | positivo |
| `ativo_nao_circulante` | ANC — Ativo Não Circulante | positivo |
| `realizavel_longo_prazo` | RLP — Realizável a Longo Prazo (subconjunto do ANC, usado em Liquidez Geral) | positivo |
| `passivo_circulante` | PC — Passivo Circulante | positivo |
| `passivo_nao_circulante` | PNC — Passivo Não Circulante (= Exigível a Longo Prazo) | positivo |
| `patrimonio_liquido` | PL — Patrimônio Líquido | pode ser negativo |
| `estoques` | Estoques (subconjunto do AC) | positivo |
| `disponivel` | Caixa e equivalentes (subconjunto do AC) | positivo |
| `imobilizado` | Imobilizado (subconjunto do ANC) | positivo |
| `contas_receber` | Contas a Receber (subconjunto do AC) | positivo |
| `fornecedores` | Fornecedores (subconjunto do PC) | positivo |
| `receita_liquida` | Receita Líquida (DRE) | positivo |
| `cmv` | Custo da Mercadoria Vendida (DRE) | pode vir negativo — usado via `Math.abs` |
| `despesas_financeiras` | Despesas Financeiras (DRE) | pode vir negativo — usado via `Math.abs` |
| `receitas_financeiras` | Receitas Financeiras (DRE) | positivo — usado via `Math.abs` |
| `depreciacao` | Depreciação (DRE/nota) | pode vir negativo — usado via `Math.abs` |
| `amortizacao` | Amortização (DRE/nota) | pode vir negativo — usado via `Math.abs` |
| `resultado` | Resultado líquido do período (fallback) | com sinal (lucro/prejuízo) |
| `resultado_acumulado` | Resultado acumulado YTD (opcional) | com sinal |
| `resultado_competencia` | Resultado do mês isolado (opcional) | com sinal |
| `divida_tributaria` | Dívida tributária total (drill-down) | usado via `Math.abs` |
| `divida_trabalhista` | Dívida trabalhista total (drill-down) | usado via `Math.abs` |
| `divida_financeira` | Dívida financeira/empréstimos (drill-down) | usado via `Math.abs` |
| `credores_rj` | Credores sujeitos à RJ (drill-down) | usado via `Math.abs` |
| `mesKey`, `mes` | Chave/rótulo do período | string |
| `facts_status` | Mapa de disponibilidade por conta | `Record<string,"AVAILABLE"|"NOT_AVAILABLE">` |
| `residual_facts` | Fatos residuais certificados (LAJIR/EBITDA/Cobertura) | objeto — ver seção 8 |

## 5. Agregados Derivados (primeira etapa do cálculo)

No início de `computeIndicatorsForRow`, os seguintes agregados são derivados **antes** de
qualquer fórmula de indicador:

```ts
const ac = r.ativo_circulante;
const anc = r.ativo_nao_circulante;
const rlp = r.realizavel_longo_prazo;
const at = ac + anc;                       // AT = AC + ANC
const pc = r.passivo_circulante;
const pnc = r.passivo_nao_circulante;
const pt = pc + pnc;                       // PT = PC + PNC  (Passivo Total / Capital de Terceiros)
const pl = r.patrimonio_liquido;
const estoque = r.estoques;
const caixa = r.disponivel;
const imob = r.imobilizado;
const contasReceber = r.contas_receber;
const receita = r.receita_liquida;
const cmvAbs = Math.abs(r.cmv);
const depAbs = Math.abs(r.depreciacao);
const amortAbs = Math.abs(r.amortizacao);
```

Ou seja:
- **Ativo Total (AT)** = Ativo Circulante + Ativo Não Circulante. **Não** inclui nenhum ajuste
  adicional — é uma soma direta dos dois grupos canônicos.
- **Passivo Total / Capital de Terceiros (PT)** = Passivo Circulante + Passivo Não Circulante.
  **PT nunca inclui o PL.**
- CMV, Depreciação e Amortização são sempre tratados em módulo (`Math.abs`) porque podem
  chegar do extrator com sinal negativo (convenção de despesa) ou positivo (convenção de
  saldo). O motor de indicadores nunca depende do sinal bruto dessas três contas.

## 6. Contexto Temporal — `resolvePeriodContext`

```ts
export type PeriodType = "MONTHLY" | "ACCUMULATED" | "ANNUAL" | "UNKNOWN";

export interface PeriodContext {
  period_type: PeriodType;
  period_months: number;
  period_days: number;
  annualization_factor: number;
  confidence: number;
}

export function resolvePeriodContext(
  mesKey: string,
  data_quality: string | null = null
): PeriodContext {
  return {
    period_type: "MONTHLY",
    period_months: 1,
    period_days: 30,
    annualization_factor: 12,
    confidence: 1.0,
  };
}
```

**Estado atual da implementação de referência**: `resolvePeriodContext` é uma função
**determinística e constante** — independentemente do `mesKey` recebido, ela sempre retorna
`period_type = "MONTHLY"`, `period_days = 30` e `annualization_factor = 12`. O comentário no
código ("Logic here could be enhanced with specific metadata per mesKey") documenta que essa é
uma simplificação deliberada: **o motor assume que toda linha do `BSDadosRow` representa um
mês fiscal de 30 dias**, e não há hoje suporte a detecção automática de período acumulado
(YTD) ou anual via esta função. A escolha entre resultado acumulado e resultado de competência
é feita separadamente (seção 7), não pelo `PeriodContext`.

Ao portar este motor, é **obrigatório** replicar esse comportamento constante — não inferir
dinamicamente a duração do período a partir de datas, sob pena de quebrar a paridade numérica
com o sistema de referência (PMR/PMP/PME e anualização de ROA/ROE dependem diretamente destes
valores fixos).

Uso dentro do engine:

```ts
const ctx = resolvePeriodContext(r.mesKey);
// ctx.period_days = 30
// ctx.annualization_factor = 12
```

- `ctx.period_days` (30) é usado nas fórmulas de PMR, PMP e Idade Média de Estoque (dias).
- `ctx.annualization_factor` (12) é usado para anualizar ROA e ROE (transforma taxa mensal em
  taxa anual equivalente por multiplicação simples, não por composição geométrica).

## 7. Escolha do Resultado — Acumulado vs Competência (MONTH vs YTD)

```ts
const resAcumulado = r.resultado_acumulado ?? r.resultado;
const resCompetencia = r.resultado_competencia ?? r.resultado;
const resParaCalculo = (resCompetencia !== undefined && resCompetencia !== 0)
  ? resCompetencia
  : resAcumulado;
```

Regra de precedência:
1. Se `resultado_competencia` existir **e for diferente de zero**, ele é usado como
   `resParaCalculo` (regime de competência do mês isolado — MONTH).
2. Caso contrário, cai para `resAcumulado` (resultado acumulado YTD, ou o campo genérico
   `resultado` como fallback final).

`resParaCalculo` é o valor efetivamente usado em:
- `margemLiquida` (numerador)
- `roa` (numerador, antes da anualização)
- `roe` (numerador, antes da anualização)
- `_resultado` / `resultadoLiquido` (campos de drill-down expostos ao front-end)

Este é o único ponto do motor em que a distinção MONTH vs YTD é operacionalizada — via
seleção de qual campo de resultado alimenta as fórmulas, e não via `PeriodContext`.

## 8. Normalização de Sinal — `accountingNormalizationService`

```ts
export interface NormalizedIncome {
  net_income: number;
  financial_expense: number;
  financial_income: number;
  income_tax: number;
}

export function normalizeIncomeStatementSign(
  netIncome: number,
  financialExpense: number,
  financialIncome: number,
  incomeTax: number
): NormalizedIncome {
  return {
    net_income: netIncome,
    financial_expense: -Math.abs(financialExpense),
    financial_income: Math.abs(financialIncome),
    income_tax: -Math.abs(incomeTax),
  };
}
```

Convenção de sinal imposta por esta função (independente do sinal bruto recebido):
- **Receita** = sempre positiva.
- **Despesas/custos/resultados negativos** = sempre negativos.
- `financial_expense` (Despesa Financeira) → forçado para **negativo** (`-Math.abs`).
- `financial_income` (Receita Financeira) → forçado para **positivo** (`Math.abs`).
- `income_tax` (IR/CSLL) → forçado para **negativo** (`-Math.abs`).
- `net_income` (Resultado Líquido) → **não é normalizado**, preserva o sinal original (pode
  ser lucro positivo ou prejuízo negativo).

No `indicatorsEngine.ts`, esta função é chamada assim:

```ts
const normalized = normalizeIncomeStatementSign(
  r.resultado,
  r.despesas_financeiras,
  r.receitas_financeiras,
  0 // income_tax não é rastreado no BSDadosRow — parâmetro fixo em 0
);
```

**Nota de implementação crítica**: no estado atual do código, a variável `normalized` é
calculada mas **não é lida em nenhuma fórmula de `IndicatorRow`** — nenhum campo do retorno
usa `normalized.financial_expense`/`financial_income`/`income_tax`. As despesas/receitas
financeiras usadas no motor (`_despFin`, `_recFin`) vêm diretamente de `Math.abs(r.despesas_financeiras)`
e `Math.abs(r.receitas_financeiras)`, calculados de forma independente logo abaixo no mesmo
arquivo. Ao portar, a chamada a `normalizeIncomeStatementSign` deve ser preservada por
completude/auditoria, mas **não deve ser tratada como fonte de verdade para nenhum indicador
atualmente implementado** — isso é um comportamento existente que deve ser replicado
fielmente (não "corrigido"), para preservar paridade numérica.

## 9. Divisão Segura — `safe_divide` e o wrapper `div`

```ts
export function safe_divide(
  numerator: number,
  denominator: number
): { value: number | null; status: "valid" | "N/A"; reason?: string } {
  if (denominator === 0 || denominator === null || !Number.isFinite(denominator)) {
    return { value: null, status: "N/A", reason: "invalid_denominator" };
  }
  return { value: numerator / denominator, status: "valid" };
}
```

No `indicatorsEngine.ts`, todo indicador que usa divisão "simples" (sem gate específico de
PL) passa pelo wrapper local:

```ts
const div = (n: number, d: number): number => {
  const result = safe_divide(n, d);
  return result.value ?? 0;
};
```

Regras de `safe_divide`:
- Denominador `0`, `null` ou não-finito (`NaN`/`Infinity`) → `status: "N/A"`, `value: null`.
- Caso contrário → `status: "valid"`, `value: numerador / denominador` (divisão comum em
  ponto flutuante, sem qualquer arredondamento).
- O wrapper `div(...)` do `indicatorsEngine.ts` **converte `null` para `0`** — ou seja,
  qualquer indicador calculado via `div()` retorna **zero** (não `NaN`) quando o denominador é
  inválido. Isso é diferente dos indicadores com gate explícito de PL (seção 10), que retornam
  `NaN` propositalmente. Esta distinção **deve ser replicada exatamente**: indicadores
  "simples" (liquidez, endividamento, atividade, margens) usam `0` como valor de fallback;
  indicadores "sensíveis a PL" (ROE, Imobilização do PL, Grau de Endividamento sobre PL) usam
  `NaN`.

## 10. Gate de PL ≤ 0 (Patrimônio Líquido não positivo)

Três indicadores no `IndicatorRow` têm gate explícito de PL, todos com a mesma regra:
**se `pl <= 0`, o indicador não é calculado — retorna `NaN`** (marcado como N/A na UI):

```ts
grauEndividamentoPL: pl > 0 ? pt / pl : NaN,
imobilizacaoPL:      pl > 0 ? div(imob, pl) : NaN,
roe: pl > 0 ? div(resParaCalculo, pl) * ctx.annualization_factor : NaN,
```

Flags booleanas de auditoria, expostas no `IndicatorRow` para a camada de apresentação:

```ts
naROE: pl <= 0,
naImobilizacao: pl <= 0,
naCobertura: !coverageCertificada,
```

Justificativa de negócio: quando o PL é nulo ou negativo, razões como "Dívida/PL" ou
"Imobilizado/PL" perdem significado econômico (podem gerar múltiplos negativos ou
absurdamente grandes que invertem a leitura de risco). Nesses casos, a plataforma direciona
o usuário para o indicador alternativo **ISG** (Índice de Solvência Geral — ver seção 13 e
MD-PORT-10), que não depende do PL.

`naCobertura` segue uma lógica distinta: é `true` sempre que a Cobertura de Juros não estiver
"certificada" pelo `residualFactsResolver` (`coverageCertificada = r.residual_facts?.interest_coverage?.status === "AVAILABLE"`),
independente do valor do PL.

## 11. Catálogo Completo de Indicadores

Para cada indicador: fórmula exata, numerador/denominador (canonical roles), unidade,
contexto temporal, regra de N/A, e campo de saída em `IndicatorRow`.

### 11.1 Liquidez

| Indicador | Campo | Fórmula | Unidade | Contexto | N/A |
|---|---|---|---|---|---|
| Liquidez Corrente | `liquidezCorrente` | AC / PC | MULTIPLE | ponto no tempo (fim do mês) | `div()` → 0 se PC=0 |
| Liquidez Seca | `liquidezSeca` | (AC − Estoques) / PC | MULTIPLE | ponto no tempo | `div()` → 0 se PC=0 |
| Liquidez Imediata | `liquidezImediata` | Caixa / PC | MULTIPLE | ponto no tempo | `div()` → 0 se PC=0 |
| Liquidez Geral | `liquidezGeral` | (AC + RLP) / (PC + PNC) | MULTIPLE | ponto no tempo | `div()` → 0 se (PC+PNC)=0 |

Código-fonte exato:
```ts
liquidezCorrente: div(ac, pc),
liquidezSeca: div(ac - estoque, pc),
liquidezImediata: div(caixa, pc),
liquidezGeral: div(ac + rlp, pc + pnc),
```

### 11.2 Endividamento

| Indicador | Campo | Fórmula | Unidade | N/A |
|---|---|---|---|---|
| Endividamento Total (sobre AT) | `endividamentoTotal` | (PC + PNC) / AT | % (0–1, exibido ×100 na UI) | `div()` → 0 |
| Endividamento Geral (readout direto) | `endividamentoGeral` | PT / AT, só se AT>0 | % | `NaN` se AT=0 |
| Grau de Endividamento sobre PL | `grauEndividamentoPL` | (PC + PNC) / PL | MULTIPLE | **`NaN` se PL≤0** |
| Composição do Endividamento (CP) | `composicaoEndividamento` | PC / (PC + PNC) | % | `div()` → 0 |
| Composição do Endividamento (LP) | `composicaoEndividamentoLP` | PNC / (PC + PNC) | % | `div()` → 0 |
| Imobilização do PL | `imobilizacaoPL` | Imobilizado / PL | % | **`NaN` se PL≤0** |
| Cobertura de Juros | `coberturaJuros` | LAJIR / Despesa Financeira (certificado no `residualFactsResolver`) | MULTIPLE | `NaN` se não certificado |

Código-fonte exato:
```ts
endividamentoTotal: div(pt, at),
grauEndividamentoPL: pl > 0 ? pt / pl : NaN,
composicaoEndividamento: div(pc, pt),
composicaoEndividamentoLP: div(pnc, pt),
imobilizacaoPL: pl > 0 ? div(imob, pl) : NaN,
coberturaJuros, // derivado de residual_facts.interest_coverage.value quando status === "AVAILABLE"
...
isg: pt > 0 ? at / pt : NaN,
endividamentoGeral: at > 0 ? pt / at : NaN,
```

**Nota**: `isg` calculado dentro do `IndicatorRow` usa PT (PC+PNC) como denominador — não é a
mesma fórmula do `computeIndicators` do Kanitz (que usa `pc+elp` e soma RLP ao numerador em
alguns pontos). Ver comparação detalhada em MD-PORT-10, seção "Duas implementações de ISG".

### 11.3 Atividade / Ciclo Operacional

Todas as fórmulas de prazo médio usam `ctx.period_days` (constante = 30, seção 6):

| Indicador | Campo | Fórmula | Unidade |
|---|---|---|---|
| Giro do Ativo | `giroAtivo` | Receita Líquida / AT | MULTIPLE |
| PMR (Prazo Médio de Recebimento) | `pmr` | (Contas a Receber × 30) / Receita Líquida | dias |
| PMP (Prazo Médio de Pagamento) | `pmp` | (Fornecedores × 30) / ((Receita/12) × 0,7), se Receita≠0; senão 0 | dias |
| PME / Idade Média de Estoque | `idadeMediaEstoque` | (Estoques × 30) / \|CMV\| | dias |
| Ciclo Operacional | `cicloOperacional` | PME + PMR | dias |
| Ciclo de Caixa | `cicloCaixa` | PME + PMR − PMP | dias |

Código-fonte exato:
```ts
const pmr = div(contasReceber * ctx.period_days, receita);

let pmp = 0;
if (receita !== 0) {
  pmp = div(r.fornecedores * ctx.period_days, (receita / 12) * 0.7);
}

const ime = div(estoque * ctx.period_days, cmvAbs);

giroAtivo: div(receita, at),
pmr,
pmp,
idadeMediaEstoque: ime,
cicloOperacional: ime + pmr,
cicloCaixa: ime + pmr - pmp,
```

**Observação importante sobre o PMP**: o denominador não é o CMV/compras reconstituídas —
é uma **proxy de compra mensal estimada** igual a `(Receita Líquida mensal) × 0,7`, assumindo
que 70% da receita mensal equivalha ao volume de compras/insumos do período. O comentário no
código confirma: *"PMP prefers actual purchases reconstruction (CMV + Ef - Ei) or falls back
to proxy"* — porém, no estado atual do arquivo, **apenas a proxy está implementada**; não há
reconstrução real de compras via variação de estoque. Isso deve ser replicado como está.

### 11.4 Rentabilidade

| Indicador | Campo | Fórmula | Unidade | Contexto | N/A |
|---|---|---|---|---|---|
| Margem Líquida | `margemLiquida` | resParaCalculo / Receita Líquida | % | MONTH ou YTD (conforme seção 7) | `div()` → 0 |
| Margem Operacional | `margemOperacional` | LAJIR / Receita Líquida | % | depende do LAJIR certificado | `div()` → 0 (LAJIR NaN se não disponível) |
| ROA (Retorno sobre Ativo) | `roa` | (resParaCalculo / AT) × 12 | % ao ano | mensal anualizado (× fator 12) | `div()` → 0 |
| ROE (Retorno sobre PL) | `roe` | (resParaCalculo / PL) × 12 | % ao ano | mensal anualizado | **`NaN` se PL≤0** |

Código-fonte exato:
```ts
margemLiquida: div(resParaCalculo, receita),
margemOperacional: div(lajir, receita),
roa: div(resParaCalculo, at) * ctx.annualization_factor,
roe: pl > 0 ? div(resParaCalculo, pl) * ctx.annualization_factor : NaN,
```

**Regra de anualização**: a anualização é **linear/simples** — multiplica-se a taxa mensal
diretamente pelo `annualization_factor` (constante = 12). **Não** há composição geométrica
(`(1+r)^12 - 1`). Isso deve ser replicado literalmente: `roa_anual = roa_mensal * 12`, não
`(1+roa_mensal)^12 - 1`.

**Margem Operacional** depende do LAJIR certificado pelo `residualFactsResolver`:
```ts
const lajir = r.residual_facts?.lajir?.status === "AVAILABLE" ? r.residual_facts.lajir.value : NaN;
```
Se o LAJIR não estiver `AVAILABLE`, `lajir = NaN`, e `div(NaN, receita)` propaga `NaN` através
de `safe_divide` (pois `Number.isFinite(NaN)` no numerador não é checado por `safe_divide` —
apenas o denominador é validado; um numerador `NaN` sempre resulta em `NaN / receita = NaN`
mesmo com `status: "valid"`). Isso é um comportamento existente e deve ser preservado: a
Margem Operacional aparece como `NaN` (N/A na UI) sempre que o LAJIR subjacente não estiver
certificado, mesmo passando pelo wrapper `div()`.

### 11.5 EBITDA e Cobertura de Juros (readouts do `residualFactsResolver`)

```ts
const ebitdaStatus = r.residual_facts?.ebitda?.status || "NOT_AVAILABLE";
const ebitdaValue = ebitdaStatus === "CERTIFIED" ? r.residual_facts?.ebitda.value : NaN;
const coverageCertificada = r.residual_facts?.interest_coverage?.status === "AVAILABLE";
const coberturaJuros = coverageCertificada ? r.residual_facts?.interest_coverage.value : NaN;
```

| Campo | Unidade | Regra |
|---|---|---|
| `ebitda` | R$ (BRL) | Só populado (não-`NaN`) quando `ebitdaStatus === "CERTIFIED"` |
| `ebitdaStatus` | enum | `"CERTIFIED" \| "NOT_CERTIFIED" \| "NOT_AVAILABLE" \| "NOT_APPLICABLE"` — propagado literalmente do `residual_facts.ebitda.status` |
| `coberturaJuros` | MULTIPLE | Só populado quando `interest_coverage.status === "AVAILABLE"` |
| `coberturaJurosStatus` | enum | `"AVAILABLE" \| "NOT_AVAILABLE"` |

### 11.6 Capital de Giro e NCG

O `indicatorsEngine.ts`, no estado atual, **não calcula Capital de Giro (CDG) nem Necessidade
de Capital de Giro (NCG) como campos dedicados do `IndicatorRow`**. Esses valores devem ser
derivados na camada de apresentação (ou em serviço adicional) a partir dos campos de
drill-down já expostos, usando as fórmulas canônicas de mercado:

- **Capital de Giro (CDG)** = AC − PC (unidade: R$). Insumos: `_ac`, `_pc` (ambos expostos no
  `IndicatorRow`).
- **Capital Circulante Líquido (CCL)** = (AC + RLP) − (PC + PNC), variante de longo prazo.
- **NCG (Necessidade de Capital de Giro)** = (Ativo Circulante Operacional) − (Passivo
  Circulante Operacional), onde os subconjuntos operacionais tipicamente usados nesta
  plataforma são: `_contasReceber + _estoque` (ativo operacional) menos `_fornecedores`
  (passivo operacional). Ou seja: `NCG = (_contasReceber + _estoque) - _fornecedores`.

Ao portar, implemente estas fórmulas como funções auxiliares que recebem o `IndicatorRow` já
calculado (para reaproveitar `_ac`, `_pc`, `_contasReceber`, `_estoque`, `_fornecedores`) —
não introduza novos campos de leitura direta do `BSDadosRow`, para preservar a mesma base de
dados de drill-down.

## 12. Campos de Drill-Down (`_ac`, `_anc`, etc.)

Todos os campos prefixados com `_` no `IndicatorRow` são bases brutas expostas para permitir
auditoria/drill-down na UI (mostrar "de onde veio o número"), e devem ser copiadas
literalmente:

```ts
_ac: ac, _anc: anc, _at: at, _pc: pc, _pnc: pnc, _pt: pt, _pl: pl, _rlp: rlp,
_caixa: caixa, _estoque: estoque, _imob: imob, _contasReceber: contasReceber,
_fornecedores: r.fornecedores, _receita: receita, _cmv: cmvAbs,
_despFin: Math.abs(r.despesas_financeiras), _recFin: Math.abs(r.receitas_financeiras),
_depreciacao: depAbs, _amortizacao: amortAbs,
_resultado: resParaCalculo,
resultadoLiquido: resParaCalculo,
_dividaTributaria: Math.abs(r.divida_tributaria),
_dividaTrabalhista: Math.abs(r.divida_trabalhista),
_dividaFinanceira: Math.abs(r.divida_financeira),
_credoresRJ: Math.abs(r.credores_rj),
```

Todos os campos de dívida detalhada (`_dividaTributaria`, `_dividaTrabalhista`,
`_dividaFinanceira`, `_credoresRJ`) usam `Math.abs` — a plataforma sempre apresenta dívidas em
valor absoluto positivo no drill-down, independentemente do sinal contábil bruto.

## 13. `indicators_status` — Gate de Disponibilidade por Indicador

```ts
const s = r.facts_status;
if (s) {
  res.indicators_status.liquidezCorrente =
    (s.ativo_circulante === "AVAILABLE" && s.passivo_circulante === "AVAILABLE")
      ? "AVAILABLE" : "NOT_AVAILABLE";
  res.indicators_status.liquidezSeca =
    (s.ativo_circulante === "AVAILABLE" && s.estoques === "AVAILABLE" && s.passivo_circulante === "AVAILABLE")
      ? "AVAILABLE" : "NOT_AVAILABLE";
  res.indicators_status.endividamentoTotal =
    (s.passivo_circulante === "AVAILABLE" && s.ativo_circulante === "AVAILABLE")
      ? "AVAILABLE" : "NOT_AVAILABLE";
  res.indicators_status.margemLiquida =
    (s.resultado === "AVAILABLE" && s.receita_liquida === "AVAILABLE")
      ? "AVAILABLE" : "NOT_AVAILABLE";
  res.indicators_status.ebitda =
    (s.resultado === "AVAILABLE" && s.despesas_financeiras === "AVAILABLE")
      ? "AVAILABLE" : "NOT_AVAILABLE";
}
```

Somente **cinco** indicadores possuem gate explícito de disponibilidade em `indicators_status`
no estado atual do código: `liquidezCorrente`, `liquidezSeca`, `endividamentoTotal`,
`margemLiquida` e `ebitda`. Os demais indicadores **não** populam `indicators_status` — a
UI deve tratar sua disponibilidade apenas pelo valor numérico (`NaN` = N/A) e pelos campos de
status específicos (`ebitdaStatus`, `coberturaJurosStatus`, `naROE`, `naImobilizacao`,
`naCobertura`). Isso é intencional e deve ser preservado: não adicionar gates para indicadores
que hoje não os têm.

## 14. `ISGResult` — Série Dedicada de ISG (função separada)

Além do campo `isg` embutido no `IndicatorRow`, existe uma função dedicada
`buildISGSeries(rows)` que produz uma série independente com classificação textual e cor:

```ts
export function buildISGSeries(rows: BSDadosRow[] | null | undefined): ISGResult[] {
  if (!rows || rows.length === 0) return [];
  return rows.map(r => {
    const at = r.ativo_circulante + r.ativo_nao_circulante;
    const pt = r.passivo_circulante + r.passivo_nao_circulante;
    const isg = pt > 0 ? at / pt : 0;

    let label = "Insolvente";
    let icon = "🔴";
    let color = "hsl(0,75%,55%)";

    if (isg >= 1.5) {
      label = "Solvente";
      icon = "🟢";
      color = "hsl(150,70%,42%)";
    } else if (isg >= 1.0) {
      label = "Atenção";
      icon = "🟡";
      color = "hsl(34,95%,55%)";
    }

    return {
      mesKey: r.mesKey, mes: r.mes, isg, ativoTotal: at, capitalTerceiros: pt,
      label, icon, color,
      status: (r.facts_status.ativo_circulante === "AVAILABLE" && r.facts_status.passivo_circulante === "AVAILABLE")
        ? "AVAILABLE" : "NOT_AVAILABLE",
      reason: (r.patrimonio_liquido <= 0)
        ? "Patrimônio Líquido negativo — ISG é o principal indicador de solvência."
        : undefined
    };
  });
}
```

**Diferença crítica com o `isg` do `IndicatorRow`**: aqui, quando `pt <= 0`, o fallback é `0`
(não `NaN` como no `IndicatorRow.isg`, que retorna `NaN` quando `pt <= 0`). Ao portar, replicar
as **duas** implementações separadamente — não unificar, pois consumidores diferentes na UI
esperam comportamentos de fallback distintos.

Faixas de classificação de ISG (idênticas às usadas na função):

| Faixa de ISG | Rótulo | Ícone | Cor (HSL) |
|---|---|---|---|
| ISG ≥ 1,5 | Solvente | 🟢 | `hsl(150,70%,42%)` |
| 1,0 ≤ ISG < 1,5 | Atenção | 🟡 | `hsl(34,95%,55%)` |
| ISG < 1,0 | Insolvente | 🔴 | `hsl(0,75%,55%)` |

## 15. Variação Mês a Mês (`variationMoM.ts`)

Usada nas abas de Gráficos/Auditoria em conjunto com a série de `IndicatorRow`, para exibir
"Variação m/m" ao lado de cada indicador/conta.

**Fórmula A (oficial, rótulo "Variação m/m")**:
```ts
export function variacaoMoM(valorMes: number, valorMesAnterior: number): number | null {
  if (!Number.isFinite(valorMes) || !Number.isFinite(valorMesAnterior)) return null;
  if (valorMesAnterior === 0) return null;
  return valorMes / valorMesAnterior - 1;
}
```
`variacaoMoM = (valor_mes / valor_mes_anterior) − 1`. Retorna `null` (N/A) se qualquer valor
não for finito ou se o mês anterior for zero (divisão por zero).

**Fórmula B (rótulo obrigatório "Variação vs Média Acumulada" — NUNCA usar como "Variação m/m")**:
```ts
export function variacaoVsMediaAcumulada(valorMes: number, mesesAnteriores: number[]): number | null {
  if (!Number.isFinite(valorMes) || !mesesAnteriores.length) return null;
  const validos = mesesAnteriores.filter(Number.isFinite);
  if (!validos.length) return null;
  const media = validos.reduce((a, b) => a + b, 0) / validos.length;
  if (media === 0) return null;
  return valorMes / media - 1;
}
```
`variacaoVsMediaAcumulada = (valor_mes / média(meses_anteriores)) − 1`.

**Formatação**:
```ts
export function formatVar(v: number | null): string {
  if (v == null) return "—";
  const pct = v * 100;
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct.toFixed(1)}%`;
}
```
Formato: sinal explícito `+` para valores positivos (negativos já trazem `-` nativo), 1 casa
decimal, sufixo `%`. Valor `null` renderiza como travessão `—`.

**Regra de negócio crítica** (documentada no cabeçalho do arquivo): a Fórmula B nunca deve
substituir silenciosamente a Fórmula A em telas rotuladas "Variação m/m" — isso já causou
divergência real (caso "Giannini": 374% via Fórmula B vs 19% correto via Fórmula A). Ao
portar, a camada de apresentação **deve** amarrar explicitamente cada rótulo à função
correta, nunca reutilizar o mesmo resultado sob rótulos diferentes.

## 16. Mapeamento Indicador → Coluna de Persistência

A tabela de indicadores computados **não é persistida diretamente como está em
`IndicatorRow`** — o `IndicatorRow` é um objeto calculado em runtime (client-side) a partir do
`BSDadosRow`, consumido pelas abas do Diagnóstico. A persistência de indicadores ocorre em
duas tabelas Supabase distintas, dependendo do contexto:

| Contexto | Tabela | Observação |
|---|---|---|
| Score Kanitz mensal (x1..x5, isg, rating) | `kanitz_scores` | ver MD-PORT-10 |
| Indicadores agregados de auditoria (OCR/pipeline) | `pipeline_analysis_results.indicadores` (jsonb) | usado por `gestorIaIndicatorsService.ts` para métricas de acurácia/pipeline, não para exibição direta de indicadores financeiros |

Ao portar para Remix, a recomendação é manter o `IndicatorRow` como um **DTO calculado em
runtime** (loader/action), sem tabela dedicada — replicando a arquitetura de referência, na
qual apenas o Kanitz é persistido de forma estruturada (por ser o score final consumido em
relatórios/exportações), enquanto os demais indicadores são recalculados sob demanda a partir
do `BSDadosRow` (que por sua vez é o produto persistido do pipeline de extração).

Tabela de mapeamento de campo (`IndicatorRow` → uso na UI):

| Campo `IndicatorRow` | Aba consumidora | Rótulo em PT-BR |
|---|---|---|
| `liquidezCorrente` | Indicadores | Liquidez Corrente |
| `liquidezSeca` | Indicadores | Liquidez Seca |
| `liquidezImediata` | Indicadores | Liquidez Imediata |
| `liquidezGeral` | Indicadores, Kanitz | Liquidez Geral |
| `endividamentoTotal` | Endividamento | Endividamento Total |
| `endividamentoGeral` | Endividamento, Kanitz (ISG alternativo) | Endividamento Geral |
| `grauEndividamentoPL` | Endividamento | Grau de Endividamento (s/PL) |
| `composicaoEndividamento` | Endividamento | Composição do Endividamento (CP) |
| `composicaoEndividamentoLP` | Endividamento | Composição do Endividamento (LP) |
| `imobilizacaoPL` | Patrimonial | Imobilização do Patrimônio Líquido |
| `coberturaJuros` | Endividamento | Cobertura de Juros |
| `giroAtivo` | Indicadores | Giro do Ativo |
| `pmr` | Indicadores | Prazo Médio de Recebimento |
| `pmp` | Indicadores | Prazo Médio de Pagamento |
| `idadeMediaEstoque` | Indicadores | Idade Média de Estoque (PME) |
| `cicloOperacional` | Indicadores | Ciclo Operacional |
| `cicloCaixa` | Indicadores | Ciclo de Caixa |
| `margemLiquida` | Indicadores, Gráficos | Margem Líquida |
| `margemOperacional` | Indicadores | Margem Operacional |
| `roa` | Indicadores | ROA (anualizado) |
| `roe` | Indicadores | ROE (anualizado) |
| `ebitda` / `ebitdaStatus` | Indicadores, Gráficos | EBITDA |
| `isg` | Patrimonial, Kanitz | Índice de Solvência Geral |

## 17. Checklist de Implementação

- [ ] Implementar `BSDadosRow` (ou equivalente) com todos os campos listados na seção 4,
      preservando nomes e convenção de sinal (`Math.abs` aplicado apenas em CMV, depreciação,
      amortização, despesas/receitas financeiras e nas quatro dívidas detalhadas).
- [ ] Implementar `resolvePeriodContext(mesKey)` como função **constante** retornando
      `MONTHLY`, `period_days=30`, `annualization_factor=12`, `confidence=1.0` — não inferir
      dinamicamente.
- [ ] Implementar `safe_divide(numerator, denominator)` com gate de denominador
      `0 | null | !isFinite` → `{ value: null, status: "N/A" }`.
- [ ] Implementar o wrapper local `div(n, d) = safe_divide(n, d).value ?? 0` (fallback 0, não
      NaN) para uso em todos os indicadores "simples".
- [ ] Implementar `normalizeIncomeStatementSign` exatamente como especificado (mesmo que seu
      resultado não seja hoje consumido pelas fórmulas — preservar por auditoria/paridade).
- [ ] Calcular AT = AC + ANC e PT = PC + PNC como primeira etapa, antes de qualquer fórmula.
- [ ] Implementar os 3 gates de PL≤0 → `NaN` para `grauEndividamentoPL`, `imobilizacaoPL`,
      `roe` (e não usar `div()`/fallback 0 nesses três campos).
- [ ] Implementar a seleção de resultado (`resAcumulado` vs `resCompetencia`) exatamente
      conforme a regra de precedência da seção 7.
- [ ] Implementar `giroAtivo`, PMR, PMP (com a proxy de 70% da receita mensal), PME, Ciclo
      Operacional e Ciclo de Caixa com as fórmulas literais da seção 11.3.
- [ ] Implementar anualização **linear** (× 12) para ROA/ROE — não composta.
- [ ] Implementar `ebitdaValue`/`ebitdaStatus`/`coberturaJuros`/`coberturaJurosStatus` lendo
      exclusivamente de `residual_facts` com os gates de status especificados.
- [ ] Implementar `indicators_status` apenas para os 5 campos especificados na seção 13 — não
      expandir a cobertura sem avaliação explícita de impacto.
- [ ] Implementar `buildISGSeries` como função separada de `computeIndicatorsForRow`, com
      fallback `0` (não `NaN`) quando `pt<=0`, e faixas de classificação da seção 14.
- [ ] Implementar `variacaoMoM`, `variacaoVsMediaAcumulada` e `formatVar` com os gates de
      `Number.isFinite` e denominador zero especificados; nunca reutilizar B sob rótulo de A.
- [ ] Expor todos os campos `_xxx` de drill-down listados na seção 12, para paridade de UI.
- [ ] Persistir apenas o Kanitz de forma estruturada (tabela dedicada); manter os demais
      indicadores como cálculo em runtime a partir do snapshot canônico.

## 18. Critérios de Homologação

1. **Paridade numérica exata**: para um conjunto de `BSDadosRow` de referência (golden
   dataset), todos os campos de `IndicatorRow` devem bater byte-a-byte (mesma precisão de
   ponto flutuante, sem arredondamento intermediário) com a implementação de origem.
2. **Gates de N/A corretos**: linhas com `PL <= 0` devem produzir `NaN` exatamente em
   `grauEndividamentoPL`, `imobilizacaoPL` e `roe`, com `naROE=true` e `naImobilizacao=true`;
   todos os demais indicadores calculados via `div()` devem produzir `0` (não `NaN`) quando o
   denominador correspondente for zero.
3. **Anualização linear**: para uma linha com resultado mensal R e PL positivo P, `roe` deve
   ser exatamente `(R/P) * 12`, verificável analiticamente.
4. **PMR/PMP/PME**: usar sempre `period_days = 30` fixo — testar que uma alteração no mês do
   calendário (fevereiro vs janeiro) não altera o resultado, confirmando a constância do
   `PeriodContext`.
5. **ISG duplo comportamento**: verificar que `IndicatorRow.isg` retorna `NaN` quando `pt<=0`,
   enquanto `ISGResult.isg` (de `buildISGSeries`) retorna `0` no mesmo cenário — ambos devem
   coexistir sem unificação.
6. **Variação MoM**: para série com mês anterior igual a zero, `variacaoMoM` deve retornar
   `null`, nunca `Infinity` ou `NaN` numérico exposto à UI.
7. **`indicators_status`**: presente e correto apenas para os 5 indicadores especificados;
   ausência de expansão não documentada.
8. **Regressão de sinal**: CMV, depreciação, amortização, despesas/receitas financeiras e as
   4 dívidas detalhadas devem sempre aparecer em valor absoluto positivo nos campos `_xxx`,
   independentemente do sinal de entrada no `BSDadosRow`.
9. **Cobertura de Juros/EBITDA**: só exibir valor numérico quando `status` for
   `"AVAILABLE"`/`"CERTIFIED"` respectivamente; caso contrário, `NaN` e status textual
   correspondente devem ser propagados sem fallback numérico substituto.
10. **Snapshot lock**: nenhuma alteração de fórmula deve tocar nos campos "core" travados
    (AT, AC, ANC, RLP, Estoques, PC, PNC, PL, Receita, Resultado, Fornecedores) conforme
    política `CORE_FINANCIAL_SNAPSHOT_LOCK` documentada no `residualFactsResolver.ts`.
