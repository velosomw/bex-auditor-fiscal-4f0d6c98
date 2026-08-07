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
  financial_expenses: FinancialExpensesFact;
  /** EBITDA só é certificado quando LAJIR e D&A são reconstruíveis pelo balancete. */
  ebitda: { value: number; status: ResidualStatus; reason: string };
  lajir: { value: number; status: ResidualStatus };
  interest_coverage: { value: number; status: ResidualStatus };
  depreciation: ComposedFact;
  amortization: ComposedFact;
}

const RX = {
  tax: /TRIBUT|FISCA|IMPOSTO|ICMS|\bISS\b|\bPIS\b|COFINS|IRPJ|CSLL|SIMPLES NACIONAL/,
  installment: /PARCELAMENT|REFIS|\bPERT\b|TRANSACAO TRIBUT|PARCELADO/,
  labor: /TRABALHIST|OBRIGACOES SOCIA|ENCARGOS SOCIA|SALARI|FOLHA DE PAGAMENTO|FERIAS|RESCIS|\bFGTS\b|\bINSS\b|13[º°]? SAL|DECIMO TERCEIRO|PROVISAO DE FERIAS/,
  payroll: /SALARI|FOLHA DE PAGAMENTO|ORDENADO|PRO[ -]?LABORE/,
  inss: /\bINSS\b|PREVIDENCI/,
  fgts: /\bFGTS\b/,
  vacation: /FERIAS/,
  termination: /RESCIS/,
  borrowings: /EMPRESTIM|FINANCIAMENT|DEBENTURE|LEASING|ARRENDAMENT|CEDULA DE CREDITO|CAPITAL DE GIRO BANC/,
  finExpenses: /DESPESAS? FINANCEIR/,
  finExpensesFallback: /JUROS|ENCARGOS FINANCEIR|VARIACOES MONETARIAS PASSIV|IOF/,
  depreciation: /DEPRECIA/,
  amortization: /AMORTIZA/,
};

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

function compose(selected: AccountNode[], scope: string, excluded: AccountNode[] = []): ComposedFact {
  const value = selected.reduce((s, n) => s + Math.abs(n.value), 0);
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
  ctx: { resultado?: number; ativo_total?: number; pc?: number; pnc?: number; pl?: number } = {}
): ResidualFacts {
  const liabilities = nodes.filter(n => n.normalized_code.startsWith("2"));
  const results = nodes.filter(n => n.normalized_code.startsWith("3") || n.normalized_code.startsWith("4"));

  /* ── Tributos ───────────────────────────────────────────── */
  const taxIn = (prefix: string) =>
    pickNonOverlapping(liabilities.filter(n => under(n, prefix)), n => RX.tax.test(n.description));
  const instIn = (prefix: string) =>
    pickNonOverlapping(
      liabilities.filter(n => under(n, prefix) && RX.tax.test(n.description) === false ? false : under(n, prefix)),
      n => RX.installment.test(n.description) && (RX.tax.test(n.description) || RX.tax.test(n.description) === false)
    ).filter(n => RX.installment.test(n.description));

  const taxCurrentNodes = taxIn("2.1");
  const taxNonCurrentNodes = taxIn("2.2");
  const instCurrent = instIn("2.1");
  const instNonCurrent = instIn("2.2");

  const taxCurrentTotal = taxCurrentNodes.reduce((s, n) => s + Math.abs(n.value), 0);
  const taxNonCurrentTotal = taxNonCurrentNodes.reduce((s, n) => s + Math.abs(n.value), 0);
  const instCurrentTotal = instCurrent.reduce((s, n) => s + Math.abs(n.value), 0);
  const instNonCurrentTotal = instNonCurrent.reduce((s, n) => s + Math.abs(n.value), 0);

  const tax: TaxTaxonomy = {
    current_obligations: taxCurrentNodes.length
      ? {
          value: Math.max(0, taxCurrentTotal - instCurrentTotal),
          status: "AVAILABLE",
          included_accounts: taxCurrentNodes.map(ref),
          excluded_accounts: instCurrent.map(ref),
          calculation_scope: "Obrigações tributárias de curto prazo (grupo 2.1), líquidas de parcelamentos",
        }
      : EMPTY("Obrigações tributárias CP não identificadas no balancete"),
    current_installments: instCurrent.length
      ? compose(instCurrent, "Parcelamentos tributários de curto prazo (grupo 2.1)")
      : EMPTY("Parcelamentos tributários CP não identificados no balancete"),
    noncurrent_obligations: taxNonCurrentNodes.length
      ? {
          value: Math.max(0, taxNonCurrentTotal - instNonCurrentTotal),
          status: "AVAILABLE",
          included_accounts: taxNonCurrentNodes.map(ref),
          excluded_accounts: instNonCurrent.map(ref),
          calculation_scope: "Obrigações tributárias de longo prazo (grupo 2.2), líquidas de parcelamentos",
        }
      : EMPTY("Obrigações tributárias LP não identificadas no balancete"),
    noncurrent_installments: instNonCurrent.length
      ? compose(instNonCurrent, "Parcelamentos tributários de longo prazo (grupo 2.2)")
      : EMPTY("Parcelamentos tributários LP não identificados no balancete"),
    total_exposure:
      taxCurrentNodes.length || taxNonCurrentNodes.length
        ? {
            value: taxCurrentTotal + taxNonCurrentTotal,
            status: "AVAILABLE",
            included_accounts: [...taxCurrentNodes, ...taxNonCurrentNodes].map(ref),
            excluded_accounts: [],
            calculation_scope: "Exposição tributária total = obrigações + parcelamentos (CP + LP)",
          }
        : EMPTY("Exposição tributária não identificada no balancete"),
  };

  /* ── Trabalhistas ───────────────────────────────────────── */
  const laborCurrentNodes = pickNonOverlapping(
    liabilities.filter(n => under(n, "2.1")),
    n => RX.labor.test(n.description) && !RX.tax.test(n.description)
  );
  const laborLeaves = liabilities.filter(
    n => under(n, "2.1") && RX.labor.test(n.description) && !RX.tax.test(n.description) && !n.has_children
  );
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
      ? compose(laborCurrentNodes, "Obrigações sociais e trabalhistas de curto prazo (grupo 2.1)")
      : EMPTY("Obrigações trabalhistas CP não identificadas no balancete"),
  };

  /* ── Empréstimos e Financiamentos — SOMENTE lado PASSIVO ── */
  const borrowNodes = pickNonOverlapping(
    liabilities,
    n => RX.borrowings.test(n.description) && !RX.finExpenses.test(n.description)
  );
  const borrowRejected = results.filter(n => RX.borrowings.test(n.description));
  const borrowings: ComposedFact = borrowNodes.length
    ? {
        ...compose(borrowNodes, "Saldo patrimonial de empréstimos e financiamentos (grupo 2)"),
        excluded_accounts: borrowRejected.map(ref),
      }
    : {
        ...EMPTY("Sem saldo patrimonial de empréstimos/financiamentos certificado no balancete"),
        excluded_accounts: borrowRejected.map(ref),
      };

  /* ── Despesas Financeiras (grupo de resultado) ──────────── */
  let finNodes = pickNonOverlapping(results, n => RX.finExpenses.test(n.description));
  if (finNodes.length === 0) {
    finNodes = pickNonOverlapping(results, n => RX.finExpensesFallback.test(n.description) && !n.has_children);
  }
  const finAbs = finNodes.reduce((s, n) => s + Math.abs(n.value), 0);
  const financial_expenses: FinancialExpensesFact = {
    accounting_value: finNodes.length ? -finAbs : 0,
    analysis_value: finAbs,
    status: finNodes.length ? "AVAILABLE" : "NOT_AVAILABLE",
    included_accounts: finNodes.map(ref),
  };

  /* ── Depreciação / Amortização ──────────────────────────── */
  const depNodes = pickNonOverlapping(results, n => RX.depreciation.test(n.description));
  const amortNodes = pickNonOverlapping(results, n => RX.amortization.test(n.description));
  const depreciation = depNodes.length ? compose(depNodes, "Depreciação (contas de resultado)") : EMPTY("Depreciação não identificada");
  const amortization = amortNodes.length ? compose(amortNodes, "Amortização (contas de resultado)") : EMPTY("Amortização não identificada");

  /* ── LAJIR / EBITDA / Cobertura de Juros ────────────────── */
  const resultado = Number.isFinite(ctx.resultado as number) ? (ctx.resultado as number) : NaN;
  const lajirAvailable = financial_expenses.status === "AVAILABLE" && Number.isFinite(resultado);
  const lajirValue = lajirAvailable ? resultado + financial_expenses.analysis_value : NaN;

  const daAvailable = depreciation.status === "AVAILABLE" || amortization.status === "AVAILABLE";
  const ebitdaAvailable = lajirAvailable && daAvailable;
  const ebitdaValue = ebitdaAvailable ? lajirValue + depreciation.value + amortization.value : NaN;

  const coverageAvailable = lajirAvailable && financial_expenses.analysis_value > 0;

  return {
    competency,
    tax,
    labor,
    borrowings,
    financial_expenses,
    depreciation,
    amortization,
    lajir: { value: lajirValue, status: lajirAvailable ? "AVAILABLE" : "NOT_AVAILABLE" },
    ebitda: {
      value: ebitdaValue,
      status: ebitdaAvailable ? "AVAILABLE" : "NOT_AVAILABLE",
      reason: ebitdaAvailable
        ? "LAJIR + Depreciação + Amortização certificados pelo balancete"
        : !lajirAvailable
          ? "LAJIR não certificável — despesas financeiras ausentes no balancete"
          : "Depreciação/Amortização não identificadas no balancete — EBITDA não disponível com segurança",
    },
    interest_coverage: {
      value: coverageAvailable ? lajirValue / financial_expenses.analysis_value : NaN,
      status: coverageAvailable ? "AVAILABLE" : "NOT_AVAILABLE",
    },
  };
}

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

/**
 * §6/§9/§38 — Pendency Validity Gate.
 * Invalida pendências legadas cujo fato já está certificado e diferente de zero,
 * e reclassifica diagnósticos internos de pipeline (nunca publicados ao cliente).
 */
export function filterStalePendencias<T extends Record<string, any>>(
  pendencias: T[] | null | undefined,
  facts: { receita_liquida?: number; estoques?: number; patrimonio_liquido?: number; resultado_liquido?: number } | null | undefined
): T[] {
  if (!pendencias || pendencias.length === 0) return [];
  const txt = (p: T) =>
    `${p.problema ?? ""} ${p.tipo ?? ""} ${p.impacto ?? ""} ${p.recomendacao ?? ""} ${p.fundamentacao ?? ""}`
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
    return true;
  });
}
