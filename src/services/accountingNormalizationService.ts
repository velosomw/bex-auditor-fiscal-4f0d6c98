export interface NormalizedIncome {
  net_income: number;
  financial_expense: number;
  financial_income: number;
  income_tax: number;
}

/**
 * Normalizes DRE signs based on a consistent convention:
 * Revenue = Positive
 * Expenses/Costs/Negative results = Negative
 */
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

export function safe_divide(numerator: number, denominator: number): { value: number | null; status: "valid" | "N/A"; reason?: string } {
  if (denominator === 0 || denominator === null || !Number.isFinite(denominator)) {
    return { value: null, status: "N/A", reason: "invalid_denominator" };
  }
  return { value: numerator / denominator, status: "valid" };
}
