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
  // Logic here could be enhanced with specific metadata per mesKey.
  // Defaulting to monthly context if not otherwise specified.
  return {
    period_type: "MONTHLY",
    period_months: 1,
    period_days: 30,
    annualization_factor: 12,
    confidence: 1.0,
  };
}
