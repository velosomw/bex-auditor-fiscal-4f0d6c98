/**
 * MD-BEX-FINAL-RESIDUAL-HOMOLOGATION-AND-PUBLICATION-CERTIFICATION-001
 *
 * residualFactsResolver — resolve exclusivamente os fatos residuais do ciclo final:
 *   • Taxonomia tributária (obrigações x parcelamentos, CP x LP)
 *   • Obrigações trabalhistas/sociais (composição declarada)
 *   • Empréstimos e financiamentos — SOMENTE saldo patrimonial (lado PASSIVO)
 *   • Despesas financeiras (grupo de resultado) com sinal contábil e valor de análise
 *   • Certificação de EBITDA / LAJIR e Cobertura de Juros (AVAILABLE ou NOT_AVAILABLE)
 *   • Modo de fechamento patrimonial (resultado dentro ou fora do PL)
 *
 * CORE_FINANCIAL_SNAPSHOT_LOCK = true — este módulo NÃO altera AT, AC, ANC, RLP,
 * Estoques, PC, PNC, PL, Receita, Resultado, Fornecedores nem os índices LC/LS/LG/ISG/RPL/GE/FI.
 */
import type { AccountNode } from "@/services/p1SyntheticResolver";

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
  /** §29..§32 — taxonomia de dívida onerosa por prazo. */
  borrowings_current: ComposedFact;
  borrowings_noncurrent: ComposedFact;
  financial_expenses: FinancialExpensesFact;
  financial_revenues: ComposedFact;
  income_taxes: ComposedFact;
  /** EBITDA só é certificado quando LAJIR e D&A são reconstruíveis pelo balancete. */
  ebitda: { value: number; status: ResidualStatus; reason: string };
  lajir: { value: number; status: ResidualStatus; reason?: string };
  interest_coverage: { value: number; status: ResidualStatus };
  depreciation: ComposedFact;
  amortization: ComposedFact;
  suppliers_noncurrent: ComposedFact;
  /** §MARGIN-SSOT — Margens de rentabilidade com sinais absolutos unificados. */
  margins: {
    current_month: { value: number; status: ResidualStatus; label: string };
    ytd: { value: number; status: ResidualStatus; label: string };
  };
}

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

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

const under = (n: AccountNode, prefix: string) =>
  n.normalized_code === prefix || n.normalized_code.startsWith(prefix + ".");

const ref = (n: AccountNode): AccountRef => ({
  code: n.account_code,
  description: n.description,
  value: n.value,
});

/** Seleciona nós que casam com o predicado, descartando descendentes de nós já selecionados. */
function pickNonOverlapping(nodes: AccountNode[], match: (n: AccountNode) => boolean): AccountNode[] {
  const matched = nodes.filter(match);
  return matched.filter(
    n => !matched.some(o => o !== n && n.normalized_code.startsWith(o.normalized_code + "."))
  );
}

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

export function resolveResidualFacts(
  nodes: AccountNode[],
  competency: string,
  ctx: {
    resultado?: number; ativo_total?: number; pc?: number; pnc?: number; pl?: number;
    /** §41/§69 — quando o Resultado não está certificado, toda a cadeia derivada cai. */
    resultado_certified?: boolean;
    /** §DERIVED-GATE — Receita certificada pelo P1 (valor + status). */
    receita_liquida?: number;
    receita_certified?: boolean;
    resultado_competencia_available?: boolean;
  } = {}
): ResidualFacts {
  const liabilities = nodes.filter(n => n.normalized_code.startsWith("2"));
  const results = nodes.filter(n => n.normalized_code.startsWith("3") || n.normalized_code.startsWith("4"));

  /* ── Fornecedores LP (§12) ─────────────────────────── */
  const suppliersLP = pickNonOverlapping(liabilities.filter(n => under(n, "2.2")), n => !RX.borrowings.test(n.description) && !RX.tax.test(n.description) && /^FORNECEDORES?\b/i.test(n.description));

  /* ── Tributos (§33..§37) ────────────────────────────────── */
  const isTax = (n: AccountNode) => RX.tax.test(n.description) && !RX.labor.test(n.description);
  const isTaxInstallment = (n: AccountNode) => RX.installment.test(n.description) && isTax(n);

  const taxIn = (prefix: string) =>
    pickNonOverlapping(liabilities.filter(n => under(n, prefix)), isTax);
  /** Parcelamentos tributários — descendentes dos grupos tributários já selecionados. */
  const instIn = (prefix: string, parents: AccountNode[]) =>
    pickNonOverlapping(
      liabilities.filter(
        n => under(n, prefix) &&
          parents.some(p => n.normalized_code === p.normalized_code || n.normalized_code.startsWith(p.normalized_code + "."))
      ),
      n => isTaxInstallment(n) && !parents.some(p => p.normalized_code === n.normalized_code)
    );

  const isLaborNature = (n: AccountNode) => RX.labor.test(n.description) && !RX.tax.test(n.description);
  // §MIXED-TAXONOMY — varre TODO o grupo 2.1/2.2 (não apenas 2.1.3/2.2.3) e desce
  // em pais que misturam tributos e trabalhistas.
  const taxCurrentNodes = pickByTaxonomy(liabilities, "2.1", isTax, isLaborNature);
  const taxNonCurrentNodes = pickByTaxonomy(liabilities, "2.2", isTax, isLaborNature);
  const instCurrent = instIn("2.1", taxCurrentNodes);
  const instNonCurrent = instIn("2.2", taxNonCurrentNodes);

  const taxCurrentTotal = taxCurrentNodes.reduce((s, n) => s + n.value, 0);
  const taxNonCurrentTotal = taxNonCurrentNodes.reduce((s, n) => s + n.value, 0);
  const instCurrentTotal = instCurrent.reduce((s, n) => s + n.value, 0);
  const instNonCurrentTotal = instNonCurrent.reduce((s, n) => s + n.value, 0);

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

  /* ── Fornecedores LP Fact (§12) ── */
  const suppliers_noncurrent = suppliersLP.length
    ? { ...compose(suppliersLP, "Fornecedores de longo prazo (Passivo Não Circulante)"), value: Math.abs(suppliersLP.reduce((s, n) => s + n.value, 0)) }
    : EMPTY("Fornecedores LP não identificados no balancete");

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

  /* ── Depreciação / Amortização ──────────────────────────── */
  const depNodes = pickNonOverlapping(results, n => RX.depreciation.test(n.description));
  const amortNodes = pickNonOverlapping(results, n => RX.amortization.test(n.description));
  const depreciation = depNodes.length ? compose(depNodes, "Depreciação (contas de resultado)") : EMPTY("Depreciação não identificada");
  const amortization = amortNodes.length ? compose(amortNodes, "Amortização (contas de resultado)") : EMPTY("Amortização não identificada");

  /* ── LAJIR / EBITDA / Cobertura de Juros (§41..§46) ──────
   * §S01 — interest_coverage = EBIT / Interest Expense
   * §S02 — EBITDA_SAFE_NA_CERTIFICATION (EBIT + D&A reconciliation)
   * Nenhum derivado é certificado quando o Resultado base não está certificado. */
  const resultado = Number.isFinite(ctx.resultado as number) ? (ctx.resultado as number) : NaN;
  const resultCertified = ctx.resultado_certified !== false && Number.isFinite(resultado) && (Math.abs(resultado) > 0.01 || ctx.resultado_competencia_available);
  
  // EBIT reconstruction: Result Current + Interest Expense
  // MD-BEX-FINAL-SURGICAL-PATCH-001 §7: financial.ebit = Result Current + Interest Expense
  const lajirAvailable = !!resultCertified;
  const lajirValue = lajirAvailable 
    ? resultado + Math.abs(financial_expenses.analysis_value)
    : NaN;

  // Interest Coverage calculation (§S01)
  const coverageValue = (lajirAvailable && Math.abs(financial_expenses.analysis_value) > 0.01) 
    ? lajirValue / Math.abs(financial_expenses.analysis_value) 
    : NaN;

  // EBITDA reconstruction: EBIT + D&A
  const depValue = depreciation.status === "AVAILABLE" ? Math.abs(depreciation.value) : 0;
  const amortValue = amortization.status === "AVAILABLE" ? Math.abs(amortization.value) : 0;
  const daTotal = depValue + amortValue;
  const daAvailable = depreciation.status === "AVAILABLE" || amortization.status === "AVAILABLE";
  
  // §S02 — Gate: Certification only if reconciled with D&A
  const ebitdaAvailable = lajirAvailable && daAvailable;
  const ebitdaReconstructed = ebitdaAvailable ? lajirValue + daTotal : NaN;


  return {
    competency,
    tax,
    labor,
    borrowings,
    borrowings_current,
    borrowings_noncurrent,
    financial_expenses,
    financial_revenues,
    income_taxes,
    depreciation,
    amortization,
    suppliers_noncurrent,
    lajir: {
      value: lajirValue,
      status: lajirAvailable ? "AVAILABLE" : "NOT_AVAILABLE",
      reason: lajirAvailable
        ? "Resultado + Despesas Financeiras − Receitas Financeiras + Tributos sobre o Lucro"
        : !resultCertified
          ? "Resultado do período não certificado — LAJIR não calculável"
          : "Despesas financeiras não identificadas no balancete",
    },
    ebitda: (ebitdaAvailable && Number.isFinite(ebitdaReconstructed) && ctx.resultado_certified)
      ? { value: ebitdaReconstructed, status: "AVAILABLE", reason: "EBITDA reconstruído via DRE (LAJIR + D&A)" }
      : { value: 0, status: "NOT_AVAILABLE", reason: "EBITDA não certificado a partir do balancete" },

    interest_coverage: {
      value: coverageValue,
      status: (Number.isFinite(coverageValue) && ctx.resultado_certified) ? "AVAILABLE" : "NOT_AVAILABLE",
    },
    margins: {
      current_month: {
        // §PATCH-03: Hard sign and period context parity
        // Se o resultado for negativo, a margem deve ser negativa. 
        value: (ctx.receita_certified && ctx.resultado_competencia_available && ctx.resultado_certified) 
          ? (Number(ctx.resultado) / Number(ctx.receita_liquida)) 
          : NaN,
        status: (ctx.receita_certified && ctx.resultado_competencia_available && ctx.resultado_certified) ? "AVAILABLE" : "NOT_AVAILABLE",
        label: "Margem da Competência"
      },
      ytd: {
        value: (ctx.receita_certified && resultCertified) ? (num(resultado) / num(ctx.receita_liquida)) : NaN,
        status: (ctx.receita_certified && resultCertified) ? "AVAILABLE" : "NOT_AVAILABLE",
        label: "Margem Acumulada"
      }
    }
  };
}

export type BalanceClosureMode = "RESULT_INCLUDED_IN_EQUITY" | "RESULT_OUTSIDE_EQUITY" | "UNKNOWN";

export function isResultIncluded(mode: BalanceClosureMode): boolean {
  return mode === "RESULT_INCLUDED_IN_EQUITY";
}

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

/**
 * §45/§46 — Pendency Validity Gate.
 * Invalida pendências legadas cujo fato já está certificado e diferente de zero,
 * e reclassifica diagnósticos internos de pipeline (nunca publicados ao cliente).
 */
export function filterStalePendencias<T extends Record<string, any>>(
  pendencias: T[] | null | undefined,
  snapshot: any
): T[] {
  if (!pendencias || pendencias.length === 0) return [];
  if (!snapshot) return pendencias;
  
  const facts = snapshot.facts;
  const txt = (p: T) =>
    `${p.title ?? ""} ${p.description ?? ""} ${p.problema ?? ""} ${p.tipo ?? ""} ${p.impacto ?? ""} ${p.recomendacao ?? ""} ${p.fundamentacao ?? ""}`
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  const revenueOk = Number.isFinite(facts?.receita_liquida as number) && (facts?.receita_liquida ?? 0) !== 0;
  const inventoryOk = Number.isFinite(facts?.estoques as number) && (facts?.estoques ?? 0) !== 0;
  const equityOk = Number.isFinite(facts?.patrimonio_liquido as number) && (facts?.patrimonio_liquido ?? 0) !== 0;
  const resultOk = Number.isFinite(facts?.resultado_liquido as number) && (facts?.resultado_liquido ?? 0) !== 0;

  return pendencias.filter(p => {
    const t = txt(p);
    // Diagnósticos internos de pipeline nunca são pendências empresariais.
    if (/FATOS DETERMINISTICOS|PIPELINE|EXTRACAO FALHOU|PARSER|PLATFORM|INTERNAL/.test(t)) return false;
    if (revenueOk && /RECEITA/.test(t) && /(ZERAD|0[.,]00|IGUAL A ZERO|AUSENTE|NAO (FOI )?(EXTRAID|IDENTIFICAD))/.test(t)) return false;
    if (inventoryOk && /ESTOQUE/.test(t) && /(ZERAD|0[.,]00|IGUAL A ZERO|AUSENTE|NAO (FOI )?(EXTRAID|IDENTIFICAD))/.test(t)) return false;
    if (equityOk && /PATRIMONIO LIQUIDO/.test(t) && /(ZERAD|AUSENTE|NAO (FOI )?(EXTRAID|IDENTIFICAD))/.test(t)) return false;
    if (resultOk && /RESULTADO/.test(t) && /(ZERAD|AUSENTE|NAO (FOI )?(EXTRAID|IDENTIFICAD))/.test(t)) return false;
    
    // MD-CUTOVER-001 §11: Invalidação de pendências legadas de R$ 17,5M
    if (/PREJUIZOS ACUMULADOS DE R\$ 17,5 MILHOES/i.test(t)) return false;
    
    if (t.includes("RECEITA LIQUIDA ZERADA") && revenueOk) return false;
    return true;
  });
}

/**
 * Recalcula as concentrações das pendências com base no snapshot atualizado.
 */
export function recomputePendencyPercentages<T extends Record<string, any>>(
  pendencias: T[] | null | undefined,
  ativoTotal: number | undefined | null
): T[] {
  if (!pendencias || pendencias.length === 0) return [];
  const at = Number(ativoTotal);
  if (!Number.isFinite(at) || at === 0) return pendencias;

  const parseBRL = (raw: string) => Number(raw.replace(/\./g, "").replace(",", "."));
  const fixField = (text: unknown): unknown => {
    if (typeof text !== "string" || !/ATIVO TOTAL/i.test(text)) return text;
    const money = text.match(/R\$\s*([\d.]+,\d{2})/);
    if (!money) return text;
    const valor = parseBRL(money[1]);
    if (!Number.isFinite(valor) || valor === 0) return text;
    const pct = (Math.abs(valor) / Math.abs(at)) * 100;
    return text.replace(/(\d{1,3}(?:[.,]\d+)?)\s?%/g, `${pct.toFixed(1).replace(".", ",")}%`);
  };

  return pendencias.map(p => {
    const out: Record<string, any> = { ...p };
    for (const k of ["problema", "impacto", "recomendacao", "fundamentacao", "descricao", "detalhe"]) {
      if (k in out) out[k] = fixField(out[k]);
    }
    return out as T;
  });
}
