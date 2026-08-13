# MD-PORT-07-RESIDUAL-FACTS-AND-DERIVED-CERTIFICATION

## Título
Fatos Residuais e Certificação de Métricas Derivadas — Taxonomia de Dívida, Tributos LP, Trabalhista, EBITDA com Dupla Reconciliação e Cobertura de Juros

## Objetivo
Especificar em nível de implementação o módulo `src/services/residualFactsResolver.ts`, responsável por resolver os fatos financeiros que **não** fazem parte do núcleo P1 (Ativo, Passivo, PL, Receita, Resultado — protegidos por `CORE_FINANCIAL_SNAPSHOT_LOCK`), mas que dependem diretamente da árvore de contas (`AccountNode[]`) já construída pelo `p1SyntheticResolver.ts`. Cobre: taxonomia de dívida onerosa, tributos de longo prazo com binding estrito, trabalhista, fornecedores CP/LP, EBITDA com Dual Reconciliation Gate, cobertura de juros e a cadeia completa de certificação de fatos derivados.

## Escopo
- `src/services/residualFactsResolver.ts` (função `resolveResidualFacts`, `detectBalanceClosure`, `filterStalePendencias`, `recomputePendencyPercentages`).
- Integração com `p1SyntheticResolver.ts::AccountNode` (entrada) e com `bsDadosBuilder.ts` (consumo — linhas 1263-1320+).
- Não cobre resolução de roles do núcleo P1 (ver MD-PORT-06) nem o snapshot final congelado (ver MD-PORT-08).

## Pré-requisitos
- Compreensão de MD-PORT-06 (motor de árvore de contas, `AccountNode`, `topmost`/`pickNonOverlapping`).
- TypeScript com union types discriminados (`ResidualStatus`, `ebitda.status`).
- Conhecimento de estrutura contábil brasileira: grupo `2.1` (Passivo Circulante), `2.2` (Passivo Não Circulante), `2.2.3` (sub-grupo tributário LP em planos padrão).

---

## 1. Contrato de Não-Interferência (`CORE_FINANCIAL_SNAPSHOT_LOCK`)

```ts
/**
 * CORE_FINANCIAL_SNAPSHOT_LOCK = true — este módulo NÃO altera AT, AC, ANC, RLP,
 * Estoques, PC, PNC, PL, Receita, Resultado, Fornecedores nem os índices LC/LS/LG/ISG/RPL/GE/FI.
 */
```

Este comentário no cabeçalho do arquivo é uma **invariante de arquitetura**: o resolvedor de fatos residuais lê a árvore de contas já construída, mas nunca escreve de volta nos 11 campos-núcleo do P1 nem nos índices de liquidez/insolvência. Em porting, isso deve ser garantido por barreira de tipos (o módulo não deve sequer importar tipos que permitam mutação desses campos) ou por teste de contrato (snapshot antes/depois idêntico nesses campos).

Exceção documentada: `suppliers_noncurrent` (Fornecedores LP) tem tratamento especial de "Parent Authority" no builder (Seção 8 deste doc), mas isso ocorre **fora** de `residualFactsResolver.ts`, no consumidor (`bsDadosBuilder.ts`).

---

## 2. Tipos de Saída

```ts
export type ResidualStatus = "AVAILABLE" | "NOT_AVAILABLE";

export interface AccountRef {
  code: string;
  description: string;
  value: number;
}

export interface ComposedFact {
  value: number;
  status: ResidualStatus;
  included_accounts: AccountRef[];
  excluded_accounts: AccountRef[];
  calculation_scope: string;
}

export interface TaxTaxonomy {
  current_obligations: ComposedFact;
  current_installments: ComposedFact;
  noncurrent_obligations: ComposedFact;
  noncurrent_installments: ComposedFact;
  total_exposure: ComposedFact;
}

export interface LaborTaxonomy {
  payroll_payable: ComposedFact;
  inss_payable: ComposedFact;
  fgts_payable: ComposedFact;
  vacation_payable: ComposedFact;
  termination_payable: ComposedFact;
  other_obligations: ComposedFact;
  total_current: ComposedFact;
}

export interface FinancialExpensesFact {
  accounting_value: number;
  analysis_value: number;
  status: ResidualStatus;
  included_accounts: AccountRef[];
}

export interface ResidualFacts {
  competency: string;
  tax: TaxTaxonomy;
  labor: LaborTaxonomy;
  borrowings: ComposedFact;
  borrowings_current: ComposedFact;
  borrowings_noncurrent: ComposedFact;
  financial_expenses: FinancialExpensesFact;
  financial_revenues: ComposedFact;
  income_taxes: ComposedFact;
  ebitda: { value: number; status: "CERTIFIED" | "NOT_CERTIFIED" | "NOT_AVAILABLE" | "NOT_APPLICABLE"; unit: "BRL"; reason?: string; memory?: any };
  lajir: { value: number; status: ResidualStatus; unit: "BRL"; reason?: string };
  interest_coverage: { value: number; status: ResidualStatus; unit: "MULTIPLE" };
  depreciation: ComposedFact;
  amortization: ComposedFact;
  suppliers_noncurrent: ComposedFact;
  margins: {
    current_month: { value: number; status: ResidualStatus; label: string };
    ytd: { value: number; status: ResidualStatus; label: string };
  };
}
```

---

## 3. Tabela Regex Completa (`RX`)

```ts
const RX = {
  tax: /TRIBUT|FISCA|IMPOSTO|ICMS|\bISS\b|\bPIS\b|COFINS|IRPJ|CSLL|SIMPLES NACIONAL|\bIRRF\b|\bIRF\b|\bDIFAL\b/,
  installment: /PARCELAMENT|REFIS|\bPERT\b|TRANSACAO TRIBUT|PARCELADO/,
  labor: /TRABALHIST|OBRIGACOES SOCIA|ENCARGOS SOCIA|SALARI|FOLHA DE PAGAMENTO|FERIAS|RESCIS|\bFGTS\b|\bINSS\b|13[º°]? SAL|DECIMO TERCEIRO|PROVISAO DE FERIAS/,
  /** §40 — retenções (de terceiros ou de empregados) nunca compõem dívida trabalhista própria. */
  withholding: /RETEN[CÇ]|RETID|S\/ ?NF|SOBRE ?NOTA|TERCEIRO|DEDUCOES?|\bIRRF\b|\bIRF\b/,
  payroll: /SALARI|FOLHA DE PAGAMENTO|ORDENADO|PRO[ -]?LABORE/,
  inss: /\bINSS\b|PREVIDENCI/,
  fgts: /\bFGTS\b/,
  vacation: /FERIAS/,
  termination: /RESCIS/,
  borrowings: /EMPRESTIM|FINANCIAMENT|DEBENTURE|CEDULA DE CREDITO|CAPITAL DE GIRO|OBRIGACOES FINANCEIR/,
  leases: /LEASING|ARRENDAMENT/,
  finExpenses: /DESPESAS? FINANCEIR/,
  finExpensesFallback: /JUROS|ENCARGOS FINANCEIR|VARIACOES MONETARIAS PASSIV|IOF/,
  finRevenues: /RECEITAS? FINANCEIR/,
  incomeTaxes: /(IRPJ|CSLL|IMPOSTO DE RENDA|CONTRIBUICAO SOCIAL).*(LUCRO|EXERCICIO)?|PROVISAO PARA (IRPJ|CSLL|IMPOSTO DE RENDA)/,
  depreciation: /DEPRECIA/,
  amortization: /AMORTIZA/,
};
```

**Ponto crítico:** `borrowings` **não** inclui `LEASING|ARRENDAMENT` (foram deliberadamente removidos da regex principal e tratados como categoria separada `leases`), diferente de `ROLE_SEMANTICS.divida_financeira_cp/lp` no `p1SyntheticResolver.ts` que ainda inclui `LEASING|ARRENDAMENT`. Esta é uma divergência intencional entre o núcleo P1 (mais permissivo) e a camada residual (mais restritiva) — replicar exatamente, sem unificar as duas regex.

---

## 4. Taxonomia de Dívida Onerosa — Exclusão de Leasing/Arrendamento (§29..§32)

```ts
/* ── Empréstimos e Financiamentos — SOMENTE lado PASSIVO (§29..§32) ── */
// §P02 — Borrowings: retirar arrendamentos/leasing do card financeiro total.
const isBorrowing = (n: AccountNode) =>
  RX.borrowings.test(n.description) &&
  !RX.leases.test(n.description) &&
  !RX.finExpenses.test(n.description) &&
  !RX.finRevenues.test(n.description);

const notBorrowNature = (n: AccountNode) =>
  (RX.tax.test(n.description) || RX.labor.test(n.description) || RX.leases.test(n.description)) && !RX.borrowings.test(n.description);

const borrowCurrentNodes = pickByTaxonomy(liabilities, "2.1", isBorrowing, notBorrowNature);
const borrowNonCurrentNodes = pickByTaxonomy(liabilities, "2.2", isBorrowing, notBorrowNature);
const borrowNodes = [...borrowCurrentNodes, ...borrowNonCurrentNodes];
const borrowRejected = [...results.filter(n => RX.borrowings.test(n.description)), ...liabilities.filter(n => RX.leases.test(n.description))];

const borrowings_current = borrowCurrentNodes.length
  ? compose(borrowCurrentNodes, "Obrigações financeiras de curto prazo (grupo 2.1)")
  : EMPTY("Sem obrigações financeiras de curto prazo no balancete");
const borrowings_noncurrent = borrowNonCurrentNodes.length
  ? compose(borrowNonCurrentNodes, "Obrigações financeiras de longo prazo (grupo 2.2)")
  : EMPTY("Sem obrigações financeiras de longo prazo no balancete");

// §15 — borrowings.total = CP + LP (exclusively certified debt roles)
const borrowings: ComposedFact = {
  value: borrowings_current.value + borrowings_noncurrent.value,
  status: (borrowings_current.status === "AVAILABLE" || borrowings_noncurrent.status === "AVAILABLE") ? "AVAILABLE" : "NOT_AVAILABLE",
  included_accounts: [...borrowings_current.included_accounts, ...borrowings_noncurrent.included_accounts],
  excluded_accounts: borrowRejected.map(ref),
  calculation_scope: "Saldo total das obrigações financeiras onerosas (CP + LP certified)",
};
```

Regra de negócio: leasing e arrendamento **nunca** compõem o card de "Dívida Financeira" (endividamento oneroso clássico) — são explicitamente excluídos e registrados em `excluded_accounts` para auditoria, sob a justificativa contábil de que leasing tem tratamento e risco distintos de empréstimos/financiamentos bancários tradicionais.

Note também: apenas o **lado PASSIVO** é somado (`liabilities = nodes.filter(n => n.normalized_code.startsWith("2"))`) — contas de resultado que mencionem "empréstimo" (ex.: juros sobre empréstimos, uma despesa) são explicitamente coletadas em `borrowRejected` a partir de `results`, nunca somadas ao saldo patrimonial.

---

## 5. Tributário LP com Binding Estrito ao Grupo Sintético 2.2.3 (§TAX-NONCURRENT-BINDING)

```ts
/* ── Tributos (§33..§37) ────────────────────────────────── */
const isTax = (n: AccountNode) => RX.tax.test(n.description) && !RX.labor.test(n.description);
const isTaxInstallment = (n: AccountNode) => RX.installment.test(n.description) && isTax(n);

/** §TAX-NONCURRENT-BINDING — garante que obrigações tributárias LP (2.2.3) sejam capturadas. */
const taxCurrentNodes = pickByTaxonomy(liabilities, "2.1", isTax, (n) => RX.labor.test(n.description) && !RX.tax.test(n.description));

// RP-01 FORENSIC FIX: Garantir que 2.2.3 seja capturado mesmo se o seletor de taxonomia for muito restritivo
const taxNonCurrentNodes = pickByTaxonomy(liabilities, "2.2", isTax, (n) => RX.labor.test(n.description) && !RX.tax.test(n.description));

// Forçamos a inclusão do grupo sintético 2.2.3 se ele existir e tiver valor, para evitar RP-01 FAIL
const syntheticTaxLP = liabilities.find(n => n.normalized_code === "2.2.3");
if (syntheticTaxLP && syntheticTaxLP.value !== 0 && !taxNonCurrentNodes.some(n => n.normalized_code === "2.2.3")) {
  taxNonCurrentNodes.push(syntheticTaxLP);
}
```

Este é um patch forense (`RP-01 FORENSIC FIX`) que resolve o caso em que o algoritmo genérico `pickByTaxonomy` (Seção 6) desce demais na árvore e não captura o nó sintético `2.2.3` diretamente — o código força a inclusão explícita da conta `2.2.3` sempre que ela existir com valor não-nulo, independentemente do resultado do algoritmo genérico. Isso deve ser portado **literalmente**, como uma regra de binding hard-coded ao código `2.2.3` (não generalizável).

### 5.1 Cálculo de Parcelamentos (Installments) e Exposição Total

```ts
const instIn = (prefix: string, parents: AccountNode[]) =>
  pickNonOverlapping(
    liabilities.filter(
      n => n.normalized_code.startsWith(prefix + ".") &&
        parents.some(p => n.normalized_code === p.normalized_code || n.normalized_code.startsWith(p.normalized_code + "."))
    ),
    n => isTaxInstallment(n) && !parents.some(p => p.normalized_code === n.normalized_code)
  );

const instCurrent = instIn("2.1", taxCurrentNodes);
const instNonCurrent = instIn("2.2", taxNonCurrentNodes);

const taxCurrentTotal = taxCurrentNodes.reduce((s, n) => s + n.value, 0);
const taxNonCurrentTotal = taxNonCurrentNodes.reduce((s, n) => s + n.value, 0);
const instCurrentTotal = instCurrent.reduce((s, n) => s + n.value, 0);
const instNonCurrentTotal = instNonCurrent.reduce((s, n) => s + n.value, 0);
```

`TaxTaxonomy` publicado:

```ts
const tax: TaxTaxonomy = {
  current_obligations: taxCurrentNodes.length
    ? {
        value: Math.abs(taxCurrentTotal - instCurrentTotal),
        status: "AVAILABLE",
        included_accounts: taxCurrentNodes.map(ref),
        excluded_accounts: instCurrent.map(ref),
        calculation_scope: "Obrigações tributárias de curto prazo (grupo 2.1), líquidas de parcelamentos tributários",
      }
    : EMPTY("Obrigações tributárias CP não identificadas no balancete"),
  current_installments: instCurrent.length
    ? { ...compose(instCurrent, "Parcelamentos tributários de curto prazo"), value: Math.abs(instCurrentTotal) }
    : EMPTY("Parcelamentos tributários CP não identificados no balancete"),
  noncurrent_obligations: taxNonCurrentNodes.length
    ? {
        value: Math.abs(taxNonCurrentTotal - instNonCurrentTotal),
        status: "AVAILABLE",
        included_accounts: taxNonCurrentNodes.map(ref),
        excluded_accounts: instNonCurrent.map(ref),
        calculation_scope: "Obrigações tributárias de longo prazo (grupo 2.2), líquidas de parcelamentos tributários",
      }
    : (taxNonCurrentTotal !== 0
        ? { value: Math.abs(taxNonCurrentTotal), status: "AVAILABLE", included_accounts: [], excluded_accounts: [], calculation_scope: "Obrigações tributárias LP (saldos sintéticos/fallback)" }
        : EMPTY("Obrigações tributárias LP não identificadas no balancete")),
  noncurrent_installments: instNonCurrent.length
    ? { ...compose(instNonCurrent, "Parcelamentos tributários de longo prazo"), value: Math.abs(instNonCurrentTotal) }
    : EMPTY("Parcelamentos tributários LP não identificados no balancete"),
  // §36 — Double Count Detector: parcelamentos já estão dentro dos grupos sintéticos.
  total_exposure:
    taxCurrentNodes.length || taxNonCurrentNodes.length
      ? {
          value: Math.abs(taxCurrentTotal + taxNonCurrentTotal),
          status: "AVAILABLE",
          included_accounts: [...taxCurrentNodes, ...taxNonCurrentNodes].map(ref),
          excluded_accounts: [...instCurrent, ...instNonCurrent].map(ref),
          calculation_scope:
            "Exposição tributária total = grupos tributários sintéticos CP + LP (parcelamentos contados uma única vez, como composição)",
        }
      : EMPTY("Exposição tributária não identificada no balancete"),
};
```

**Regra §36 (Double Count Detector):** `total_exposure` soma `taxCurrentTotal + taxNonCurrentTotal` (que já incluem, internamente, os parcelamentos como sub-composição) — os parcelamentos **nunca** são somados uma segunda vez separadamente ao total.

---

## 6. `pickByTaxonomy` — Algoritmo de Descida Mista

Este é o algoritmo central de desambiguação quando um plano de contas mistura naturezas dentro do mesmo grupo sintético (ex.: `2.1.3` = "Obrigações Sociais e Tributárias" contém tanto trabalhista quanto tributário):

```ts
/**
 * §MIXED-TAXONOMY-DESCENT — planos de contas frequentemente misturam naturezas
 * dentro do mesmo pai sintético (ex.: 2.1.3 com tributos E trabalhistas).
 * Percorre a árvore a partir do prefixo e só aceita um nó sintético quando ele
 * é "puro" (nenhum descendente pertence à natureza concorrente); caso contrário
 * desce para os filhos. Nunca soma pai e filho.
 */
function pickByTaxonomy(
  all: AccountNode[],
  prefix: string,
  isTarget: (n: AccountNode) => boolean,
  isOther: (n: AccountNode) => boolean
): AccountNode[] {
  const inScope = all.filter(n => n.normalized_code.startsWith(prefix + "."));
  const childrenOf = (code: string) =>
    inScope.filter(n => n.parent_code === code);
  const descendantsOf = (n: AccountNode) =>
    inScope.filter(o => o.normalized_code.startsWith(n.normalized_code + "."));

  const out: AccountNode[] = [];
  const visit = (list: AccountNode[]) => {
    for (const n of list) {
      const desc = descendantsOf(n);
      const contaminated = desc.some(isOther) || (isOther(n) && !isTarget(n));
      if (isTarget(n) && !contaminated) { out.push(n); continue; }
      if (desc.length > 0) { visit(childrenOf(n.normalized_code)); continue; }
      if (isTarget(n) && !isOther(n)) out.push(n);
    }
  };
  visit(childrenOf(prefix));
  return out.filter(n => !out.some(o => o !== n && n.normalized_code.startsWith(o.normalized_code + ".")));
}
```

Algoritmo (DFS recursiva top-down):
1. Começa nos filhos diretos do `prefix` (ex.: filhos de `2.1`).
2. Para cada nó, verifica se algum descendente pertence à natureza concorrente (`isOther`) — se sim, o nó está "contaminado" e não pode ser usado como agregado único.
3. Se o nó bate com o alvo (`isTarget`) e **não** está contaminado → aceita o nó inteiro (parada da recursão neste ramo).
4. Se está contaminado mas tem filhos → desce recursivamente para os filhos.
5. Se é folha (sem filhos) e bate com o alvo sem ser `isOther` → aceita a folha.
6. Filtro final (`topmost`-like) remove qualquer nó que seja descendente de outro já aceito.

Este é o mesmo padrão de "nunca somar pai+filho" do MD-PORT-06, generalizado para múltiplas naturezas concorrentes dentro do mesmo ramo.

---

## 7. Trabalhista (§38..§40)

```ts
/* ── Trabalhistas (§38..§40) ────────────────────────────── */
const isLabor = (n: AccountNode) =>
  RX.labor.test(n.description) &&
  !RX.tax.test(n.description) &&
  !RX.withholding.test(n.description) &&
  !RX.installment.test(n.description);

// §MIXED-TAXONOMY — trabalhistas próprios do grupo 2.1, descendo em pais que
// também abrigam tributos (ex.: 2.1.3 "Obrigações Sociais e Tributárias").
const laborCurrentNodes = pickByTaxonomy(liabilities, "2.1", isLabor, (n) => RX.tax.test(n.description) && !RX.labor.test(n.description));
const laborExcluded = liabilities.filter(
  n => under(n, "2.1") && RX.labor.test(n.description) && !isLabor(n) && !n.has_children
);
const laborLeaves = liabilities.filter(n => under(n, "2.1") && isLabor(n) && !n.has_children);
const sub = (rx: RegExp, scope: string) => {
  const sel = laborLeaves.filter(n => rx.test(n.description));
  return sel.length ? compose(sel, scope) : EMPTY(scope + " — não identificado no balancete");
};

const labor: LaborTaxonomy = {
  payroll_payable: sub(RX.payroll, "Salários e ordenados a pagar"),
  inss_payable: sub(RX.inss, "INSS a recolher"),
  fgts_payable: sub(RX.fgts, "FGTS a recolher"),
  vacation_payable: sub(RX.vacation, "Férias e encargos"),
  termination_payable: sub(RX.termination, "Rescisões a pagar"),
  other_obligations: EMPTY("Demais obrigações sociais"),
  total_current: laborCurrentNodes.length
    ? {
        ...compose(laborCurrentNodes, "Obrigações sociais e trabalhistas próprias de curto prazo"),
        value: Math.abs(laborCurrentNodes.reduce((s, n) => s + n.value, 0)),
        excluded_accounts: laborExcluded.map(ref),
      }
    : EMPTY("Obrigações trabalhistas CP não identificadas no balancete"),
};
```

**Regra §40 — Retenções nunca compõem dívida trabalhista própria:** valores retidos de terceiros (ex. IRRF sobre nota fiscal, retenções de INSS de prestadores) são explicitamente excluídos via `RX.withholding` — mesmo que contenham vocabulário sobreposto com `RX.labor`. `payroll_payable`, `inss_payable`, `fgts_payable`, `vacation_payable`, `termination_payable` são calculados apenas a partir de **folhas** (`laborLeaves`, sem filhos), nunca de nós sintéticos, para evitar dupla contagem entre sub-categorias e o total.

`other_obligations` é sempre `EMPTY(...)` — não há resolução automática deste sub-campo, é reservado para expansão futura.

---

## 8. Fornecedores CP/LP

### 8.1 Fornecedores LP (`suppliers_noncurrent`) dentro de `residualFactsResolver.ts`

```ts
/* ── Fornecedores LP (§12) ─────────────────────────── */
const suppliersLP = pickNonOverlapping(liabilities.filter(n => under(n, "2.2")), n => !RX.borrowings.test(n.description) && !RX.tax.test(n.description) && /^FORNECEDORES?\b/i.test(n.description));
```

```ts
/* ── Fornecedores LP Fact (§12) ── */
const suppliers_noncurrent = suppliersLP.length
  ? { ...compose(suppliersLP, "Fornecedores de longo prazo (Passivo Não Circulante)"), value: Math.abs(suppliersLP.reduce((s, n) => s + n.value, 0)) }
  : EMPTY("Fornecedores LP não identificados no balancete");
```

### 8.2 Sobreposição/Autoridade — `§PARENT-AUTHORITY` no builder

Em `bsDadosBuilder.ts`, após chamar `resolveResidualFacts`, há um override de autoridade: se o P1 Synthetic Resolver já certificou `fornecedores_lp` via conta sintética própria do grupo `2.2`, este valor tem **prioridade** sobre o resultado do `residualFactsResolver.ts`:

```ts
// §PARENT-AUTHORITY — Fornecedores LP tem autoridade sintética própria (grupo 2.2).
const fLp = facts.fornecedores_lp;
if (fLp?.status === "AVAILABLE") {
  residual.suppliers_noncurrent = {
    value: Math.abs(fLp.value),
    status: "AVAILABLE",
    included_accounts: [{ code: fLp.source_account_code, description: fLp.source_account_description, value: fLp.value }],
    excluded_accounts: [],
    calculation_scope: "Fornecedores de longo prazo — conta sintética certificada (P1)",
  };
}
```

Fornecedores CP (curto prazo) é resolvido inteiramente pelo P1 Synthetic Resolver (`role: "fornecedores"`, código `2.1.2`) — não há lógica própria em `residualFactsResolver.ts` para fornecedores CP.

---

## 9. `pickNonOverlapping` — Utilitário Compartilhado

```ts
/** Seleciona nós que casam com o predicado, descartando descendentes de nós já selecionados. */
function pickNonOverlapping(nodes: AccountNode[], match: (n: AccountNode) => boolean): AccountNode[] {
  const matched = nodes.filter(match);
  return matched.filter(
    n => !matched.some(o => o !== n && n.normalized_code.startsWith(o.normalized_code + "."))
  );
}
```

Usado para: Fornecedores LP, Despesas Financeiras, Receitas Financeiras, Tributos sobre o Lucro, Depreciação, Amortização — sempre que a seleção não requer descida taxonômica mista (`pickByTaxonomy`), apenas filtragem simples por regex com anti-double-counting.

---

## 10. `compose()` — Função de Composição Base

```ts
function compose(selected: AccountNode[], scope: string, excluded: AccountNode[] = []): ComposedFact {
  const value = selected.reduce((s, n) => s + n.value, 0); // Preserva o sinal contábil (redutoras) para consolidação sintética
  return {
    value,
    status: selected.length > 0 ? "AVAILABLE" : "NOT_AVAILABLE",
    included_accounts: selected.map(ref),
    excluded_accounts: excluded.map(ref),
    calculation_scope: scope,
  };
}

const EMPTY = (scope: string): ComposedFact => ({
  value: 0, status: "NOT_AVAILABLE", included_accounts: [], excluded_accounts: [], calculation_scope: scope,
});
```

Importante: `compose()` preserva o **sinal contábil natural** (não aplica `Math.abs`) — cabe ao chamador decidir se publica em módulo (a maioria dos `ComposedFact` residuais finais aplica `Math.abs(...)` explicitamente na hora de montar o objeto final, como visto nas Seções 4-8).

---

## 11. Despesas / Receitas Financeiras e Tributos sobre o Lucro

```ts
/* ── Despesas / Receitas Financeiras e Tributos sobre o Lucro ── */
let finNodes = pickNonOverlapping(results, n => RX.finExpenses.test(n.description));
if (finNodes.length === 0) {
  finNodes = pickNonOverlapping(results, n => RX.finExpensesFallback.test(n.description) && !n.has_children);
}
const finAbs = Math.abs(finNodes.reduce((s, n) => s + n.value, 0));
const financial_expenses: FinancialExpensesFact = {
  accounting_value: finNodes.length ? -finAbs : 0,
  analysis_value: finAbs,
  status: finNodes.length ? "AVAILABLE" : "NOT_AVAILABLE",
  included_accounts: finNodes.map(ref),
};

const finRevNodes = pickNonOverlapping(results, n => RX.finRevenues.test(n.description));
const financial_revenues = finRevNodes.length
  ? compose(finRevNodes, "Receitas financeiras (contas de resultado)")
  : EMPTY("Receitas financeiras não identificadas");

const taxOnProfitNodes = pickNonOverlapping(
  results,
  n => RX.incomeTaxes.test(n.description) && !RX.finExpenses.test(n.description)
);
const income_taxes = taxOnProfitNodes.length
  ? compose(taxOnProfitNodes, "Tributos sobre o lucro (IRPJ/CSLL)")
  : EMPTY("Tributos sobre o lucro não identificados");
```

Nota: `financial_expenses` publica **dois** valores — `accounting_value` (sinal contábil, sempre negativo quando presente) e `analysis_value` (módulo, usado em fórmulas como Cobertura de Juros). Isso resolve a ambiguidade de "despesa financeira" ser negativa na DRE mas positiva quando usada como denominador de um índice.

`results = nodes.filter(n => n.normalized_code.startsWith("3") || n.normalized_code.startsWith("4"))` — escopo de busca restrito a contas de resultado.

---

## 12. EBITDA — Dual Reconciliation Gate

### 12.1 LAJIR (EBIT)

```ts
const resultado = Number.isFinite(ctx.resultado as number) ? (ctx.resultado as number) : NaN;
const resultCertified = ctx.resultado_certified !== false && Number.isFinite(resultado);

// EBIT reconstruction: Result Current + Interest Expense
const finExpAbs = Math.abs(financial_expenses.analysis_value);
const lajirAvailable = resultCertified && Number.isFinite(finExpAbs);
const lajirValue = lajirAvailable ? resultado + finExpAbs : NaN;
```

**Fórmula: LAJIR = Resultado do Período + |Despesas Financeiras|.** Se `resultado` não estiver certificado (flag `ctx.resultado_certified`) ou `finExpAbs` não for finito, `lajirValue = NaN` e `status = "NOT_AVAILABLE"`.

### 12.2 Método A vs. Método B

```ts
// EBITDA reconstruction: EBIT + D&A
const depValue = depreciation.status === "AVAILABLE" ? Math.abs(depreciation.value) : 0;
const amortValue = amortization.status === "AVAILABLE" ? Math.abs(amortization.value) : 0;
const daTotal = depValue + amortValue;

const incomeTaxValue = income_taxes.status === "AVAILABLE" ? Math.abs(income_taxes.value) : 0;
const finRevValue = financial_revenues.status === "AVAILABLE" ? Math.abs(financial_revenues.value) : 0;
const netFinResult = finRevValue - finExpAbs;

const ebitdaMethodA = lajirValue + daTotal;
const ebitdaMethodB = resultado + incomeTaxValue - netFinResult + daTotal;

const reconciliationDiff = Math.abs(ebitdaMethodA - ebitdaMethodB);
```

- **Método A** (top-down a partir do LAJIR): `EBITDA = LAJIR + D&A = (Resultado + |Despesas Financeiras|) + (Depreciação + Amortização)`.
- **Método B** (bottom-up a partir do Resultado Líquido): `EBITDA = Resultado + Tributos sobre o Lucro − (Receitas Financeiras − Despesas Financeiras) + D&A`.

Ambos devem convergir matematicamente (são a mesma identidade contábil reescrita); a divergência entre eles serve como **gate de sanidade**, detectando erro de classificação de contas (ex.: uma despesa financeira classificada erroneamente como despesa operacional quebraria a igualdade).

### 12.3 Tolerância e Certificação

```ts
// RP-03: EBITDA Certification Gate — Tolerância expandida para R$ 1,01 para cobrir erros de ponto flutuante
const reconciled = lajirAvailable && reconciliationDiff <= 1.01;

let ebitdaStatus: "CERTIFIED" | "NOT_CERTIFIED" | "NOT_AVAILABLE" | "NOT_APPLICABLE" = "NOT_AVAILABLE";
if (!lajirAvailable) ebitdaStatus = "NOT_AVAILABLE";
else if (ctx.pl !== undefined && ctx.pl <= 0) ebitdaStatus = "NOT_APPLICABLE";
else if (!reconciled) ebitdaStatus = "NOT_CERTIFIED";
else ebitdaStatus = "CERTIFIED";
```

**Tolerância de reconciliação: R$ 1,01** (absoluta, não percentual — cobre erros de ponto flutuante em somas encadeadas).

**Sign Sanity Gate** — o EBITDA é marcado `NOT_APPLICABLE` (não apenas `NOT_CERTIFIED`) quando o Patrimônio Líquido é não-positivo (`ctx.pl <= 0`), refletindo a mesma regra de aplicabilidade do modelo Kanitz (ver `canonicalFinancialSnapshotService.ts::buildCanonicalKanitz`).

Tabela de estados finais de `ebitda.status`:

| Status | Condição |
|---|---|
| `NOT_AVAILABLE` | `lajirAvailable === false` (Resultado ou Despesas Financeiras não certificados) |
| `NOT_APPLICABLE` | PL informado e `≤ 0` |
| `NOT_CERTIFIED` | `reconciliationDiff > 1.01` |
| `CERTIFIED` | `lajirAvailable && PL > 0 && reconciliationDiff ≤ 1.01` |

Publicação final:

```ts
ebitda: {
  value: ebitdaStatus === "CERTIFIED" ? ebitdaMethodA : NaN,
  status: ebitdaStatus,
  unit: "BRL",
  reason: ebitdaStatus === "CERTIFIED" ? "EBITDA certificado via dupla reconciliação (§MD-BEX-001)" : (ebitdaStatus === "NOT_APPLICABLE" ? "Não aplicável — Patrimônio Líquido negativo" : `Falha na reconciliação: dif R$ ${reconciliationDiff.toFixed(2)}`),
  memory: {
    methodA: ebitdaMethodA,
    methodB: ebitdaMethodB,
    diff: reconciliationDiff
  }
}
```

`value` só é publicado (não-`NaN`) quando `CERTIFIED`. O objeto `memory` sempre carrega os dois métodos e a diferença, mesmo quando não certificado — essencial para debugging e trilha de auditoria.

---

## 13. Cobertura de Juros — Formato `MULTIPLE`

```ts
// Interest Coverage calculation (§S01)
// RP-02 FORENSIC FIX: Math validation and absolute denominator parity
const coverageValue = (lajirAvailable && finExpAbs > 0.01)
  ? lajirValue / finExpAbs
  : NaN;
```

```ts
interest_coverage: {
  value: coverageValue,
  status: (Number.isFinite(coverageValue) && ctx.resultado_certified && (!ctx.pl || ctx.pl > 0)) ? "AVAILABLE" : "NOT_AVAILABLE",
  unit: "MULTIPLE"
}
```

**Fórmula: Cobertura de Juros = LAJIR / |Despesas Financeiras|**, publicada com `unit: "MULTIPLE"` (múltiplo, ex. "3,5x"), nunca como percentual. Denominador com guarda `> 0.01` evita divisão por valores residuais de ponto flutuante que produziriam múltiplos artificialmente altos.

---

## 14. Gates NOT_APPLICABLE / NaN — Regras de Sanidade

Padrão consistente em todo o módulo: **nunca publicar zero como substituto de indisponibilidade.** Toda métrica ausente/indeterminada usa `NaN` internamente e `status: "NOT_AVAILABLE"` (ou `"NOT_APPLICABLE"` quando semanticamente não faz sentido, não apenas "não calculado"). Isso é reforçado em `margins`:

```ts
margins: {
  current_month: {
    // §PATCH-03: Hard sign and period context parity
    value: (ctx.receita_certified && ctx.resultado_competencia_available && ctx.resultado_certified && ctx.receita_liquida !== 0)
      ? (Number(ctx.resultado) / Number(ctx.receita_liquida))
      : NaN,
    status: (ctx.receita_certified && ctx.resultado_competencia_available && ctx.resultado_certified && ctx.receita_liquida !== 0) ? "AVAILABLE" : "NOT_AVAILABLE",
    label: "Margem da Competência"
  },
  ytd: {
    value: (ctx.receita_certified && resultCertified) ? (num(resultado) / (ctx.receita_liquida || 1)) : NaN,
    status: (ctx.receita_certified && resultCertified) ? "AVAILABLE" : "NOT_AVAILABLE",
    label: "Margem Acumulada"
  }
}
```

`num()` helper: `const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);` — usado consistentemente para coagir valores potencialmente indefinidos para `NaN` explícito (nunca `0` implícito via `Number(undefined) → NaN` vs. `|| 0` que mascararia ausência de dado).

---

## 15. Cadeia de Certificação de Fatos Derivados

Não existe um arquivo `certificationResult.ts` no repositório — a "cadeia de certificação" está distribuída em três camadas, cada uma consumindo o `status`/`authority` da anterior:

1. **Camada 1 — P1 Synthetic Resolver** (`p1SyntheticResolver.ts`): certifica os 17 `CanonicalRole`s core com `status: AVAILABLE|NOT_AVAILABLE` e `authority`.
2. **Camada 2 — Residual Facts Resolver** (`residualFactsResolver.ts`, este documento): consome `ctx.resultado_certified`, `ctx.receita_certified` (booleans derivados da Camada 1) como **pré-condição** para certificar EBITDA, LAJIR, margens e cobertura de juros. Se a pré-condição falhar, toda a cadeia derivada cai em `NOT_AVAILABLE`/`NOT_APPLICABLE`, nunca calcula com dados parciais silenciosamente.
3. **Camada 3 — Canonical Financial Snapshot** (`canonicalFinancialSnapshotService.ts`, ver MD-PORT-08): agrega `residual_facts` e determina `report_certification_status: "CERTIFIED" | "FAILED"` no nível do snapshot inteiro, com base em campos críticos (`ativo_circulante`, `passivo_circulante`, `patrimonio_liquido`) e `integrity_gates` reprovados.

O padrão de propagação de certificação é: **uma métrica derivada nunca pode ter status melhor que sua dependência mais fraca.** Exemplo: EBITDA não pode ser `CERTIFIED` se `resultado_certified === false`, mesmo que a soma matemática "funcione" com valores parciais.

### 15.1 `detectBalanceClosure` — Certificação do Fechamento Patrimonial

```ts
export type BalanceClosureMode = "RESULT_INCLUDED_IN_EQUITY" | "RESULT_OUTSIDE_EQUITY" | "UNKNOWN";

export interface BalanceClosure {
  mode: BalanceClosureMode;
  ativo_total: number;
  soma: number;
  diferenca: number;
  reconciled: boolean;
  message: string;
}

/** §34..§37 — detecta se o Resultado já está incorporado ao PL. */
export function detectBalanceClosure(f: {
  ativo_total: number; passivo_circulante: number; passivo_nao_circulante: number;
  patrimonio_liquido: number; resultado_liquido: number;
}): BalanceClosure {
  const at = f.ativo_total;
  const base = f.passivo_circulante + f.passivo_nao_circulante + f.patrimonio_liquido;
  const withResult = base + f.resultado_liquido;
  const tol = Math.max(Math.abs(at) * 0.001, 100);

  if (Number.isFinite(at) && Math.abs(at - base) <= tol) {
    return {
      mode: "RESULT_INCLUDED_IN_EQUITY", ativo_total: at, soma: base, diferenca: at - base, reconciled: true,
      message: "Equilíbrio Patrimonial mantido: Ativo = Passivo + Patrimônio Líquido.",
    };
  }
  if (Number.isFinite(at) && Math.abs(at - withResult) <= tol) {
    return {
      mode: "RESULT_OUTSIDE_EQUITY", ativo_total: at, soma: withResult, diferenca: at - withResult, reconciled: true,
      message: "Equilíbrio Patrimonial conciliado considerando o Resultado do Período ainda não incorporado ao Patrimônio Líquido.",
    };
  }
  return {
    mode: "UNKNOWN", ativo_total: at, soma: base, diferenca: at - base, reconciled: false,
    message: "Fechamento patrimonial não conciliado com os saldos sintéticos disponíveis no balancete.",
  };
}
```

Tolerância: `max(|Ativo Total| × 0.1%, R$ 100,00)` — combina tolerância relativa e piso absoluto, evitando falso-positivo em empresas de pequeno porte.

### 15.2 Invalidação de Pendências Obsoletas (`filterStalePendencias`)

```ts
/**
 * §45/§46 — Pendency Validity Gate.
 * Invalida pendências legadas cujo fato já está certificado e diferente de zero,
 * e reclassifica diagnósticos internos de pipeline (nunca publicados ao cliente).
 */
export function filterStalePendencias<T extends Record<string, any>>(
  pendencias: T[] | null | undefined,
  snapshot: any
): T[]
```

Regra chave: qualquer pendência textual que mencione "FATOS DETERMINISTICOS|PIPELINE|EXTRACAO FALHOU|PARSER|PLATFORM|INTERNAL" é sempre removida (diagnóstico interno nunca deve vazar para o relatório do cliente). Pendências sobre Receita/Estoque/PL/Resultado "zerado/ausente" são removidas se o fato correspondente já está certificado e diferente de zero no snapshot atual.

### 15.3 Recomputação de Percentuais (`recomputePendencyPercentages`)

Reescreve percentuais embutidos em texto livre de pendências (ex.: "representa 12,3% do Ativo Total") sempre que o Ativo Total do snapshot mudar, usando parsing de moeda BRL (`Number(raw.replace(/\./g, "").replace(",", "."))`).

---

## Checklist de Implementação

1. [ ] Portar a tabela `RX` completa, preservando a divergência intencional entre `borrowings` (residual, exclui leasing) e `ROLE_SEMANTICS.divida_financeira_*` (núcleo P1, inclui leasing).
2. [ ] Implementar `pickByTaxonomy` com a lógica exata de contaminação/descida recursiva.
3. [ ] Implementar o binding forçado da conta `2.2.3` para tributos LP (regra `RP-01 FORENSIC FIX`), como exceção hard-coded documentada.
4. [ ] Implementar `TaxTaxonomy` completa com `current_obligations`, `current_installments`, `noncurrent_obligations`, `noncurrent_installments`, `total_exposure`, incluindo o Double Count Detector (§36).
5. [ ] Implementar `LaborTaxonomy` com exclusão de retenções (`RX.withholding`) mesmo quando sobrepostas a vocabulário trabalhista.
6. [ ] Implementar exclusão de leasing/arrendamento do card de dívida financeira, mantendo trilha em `excluded_accounts`.
7. [ ] Implementar `FinancialExpensesFact` com os dois valores (`accounting_value` negativo, `analysis_value` em módulo).
8. [ ] Implementar LAJIR = Resultado + |Despesas Financeiras|, condicionado a `resultado_certified`.
9. [ ] Implementar EBITDA com Dual Reconciliation Gate (Método A e Método B) e tolerância de R$ 1,01.
10. [ ] Implementar a máquina de estados `ebitda.status` com as 4 condições exatas (`NOT_AVAILABLE`, `NOT_APPLICABLE` quando PL≤0, `NOT_CERTIFIED`, `CERTIFIED`).
11. [ ] Implementar Cobertura de Juros = LAJIR / |Despesas Financeiras| em `unit: "MULTIPLE"`, com guarda de denominador `> 0.01`.
12. [ ] Implementar `detectBalanceClosure` com tolerância `max(|AT|×0.1%, R$100)` e os 3 modos (`RESULT_INCLUDED_IN_EQUITY`, `RESULT_OUTSIDE_EQUITY`, `UNKNOWN`).
13. [ ] Garantir que nenhuma métrica derivada nunca "herde" certificação melhor que sua dependência mais fraca (propagação estrita de `NOT_AVAILABLE`).
14. [ ] Implementar `filterStalePendencias` e `recomputePendencyPercentages` para higienização de pendências textuais legadas.
15. [ ] Nunca publicar `0` como substituto silencioso de indisponibilidade — usar sempre `NaN` + `status` explícito.

## Critérios de Homologação

1. Uma conta "Leasing de Equipamentos" no grupo `2.2` (LP) nunca deve aparecer em `borrowings`/`borrowings_noncurrent`; deve aparecer em `excluded_accounts` de `borrowings`.
2. Um grupo sintético `2.2.3` com valor não-nulo deve sempre aparecer em `tax.noncurrent_obligations.included_accounts`, independentemente de descendentes contaminados por vocabulário trabalhista.
3. Para uma empresa com PL positivo, Resultado certificado, Despesas Financeiras certificadas, D&A disponível e IRPJ/CSLL certificados, `ebitdaMethodA` e `ebitdaMethodB` devem convergir com `diff ≤ R$ 1,01`, resultando em `status: "CERTIFIED"`.
4. Para uma empresa com PL negativo, mesmo com todos os insumos de EBITDA disponíveis, o status deve ser `"NOT_APPLICABLE"`, nunca `"CERTIFIED"` nem `"NOT_CERTIFIED"`.
5. Cobertura de juros deve ser publicada com `unit: "MULTIPLE"` e nunca como percentual; se despesas financeiras forem ≤ R$ 0,01, status deve ser `"NOT_AVAILABLE"`.
6. Se `ctx.resultado_certified === false`, LAJIR, EBITDA, Cobertura de Juros e ambas as margens devem estar todas em `NOT_AVAILABLE`/`NaN` simultaneamente (propagação em cascata).
7. `detectBalanceClosure` deve classificar corretamente os três cenários: fechamento com resultado já incorporado ao PL, fechamento com resultado fora do PL, e fechamento não reconciliável (gap além da tolerância).
8. Retenções de terceiros (ex.: "IRRF Retido sobre NF de Terceiros") nunca devem ser somadas em `labor.total_current`, mesmo contendo termos do vocabulário trabalhista.
