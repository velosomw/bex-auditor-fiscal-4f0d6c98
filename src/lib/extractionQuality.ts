/**
 * Métrica de qualidade da EXTRAÇÃO de dados pela IA.
 * Foca exclusivamente no quanto a IA conseguiu extrair do arquivo enviado
 * (não avalia consistência interna do balancete).
 *
 * Regras de classificação (percentual):
 *   100      → "completo"     (Lido na totalidade)
 *   70-99    → "parcial"      (Lido parcialmente)
 *   40-69    → "incompleto"   (Lido incompleto)
 *   1-39     → "falha"        (Não lido)
 *    0/null  → "sem_extracao" (Sem extração)
 */
export type ExtractionTier =
  | "completo"
  | "parcial"
  | "incompleto"
  | "falha"
  | "sem_extracao";

export interface ExtractionMetric {
  tier: ExtractionTier;
  percent: number;
  label: string;
  shortLabel: string;
  className: string; // Tailwind para Badge
  dotColor: string;  // cor hsl para indicadores/charts
}

const MAP: Record<ExtractionTier, Omit<ExtractionMetric, "percent">> = {
  completo: {
    tier: "completo",
    label: "Lido na totalidade",
    shortLabel: "Completo",
    className: "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30",
    dotColor: "hsl(142,76%,36%)",
  },
  parcial: {
    tier: "parcial",
    label: "Lido parcialmente",
    shortLabel: "Parcial",
    className: "bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)]/30",
    dotColor: "hsl(217,91%,50%)",
  },
  incompleto: {
    tier: "incompleto",
    label: "Lido incompleto",
    shortLabel: "Incompleto",
    className: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30",
    dotColor: "hsl(38,92%,50%)",
  },
  falha: {
    tier: "falha",
    label: "Não lido",
    shortLabel: "Falha",
    className: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-[hsl(0,84%,60%)]/30",
    dotColor: "hsl(0,84%,60%)",
  },
  sem_extracao: {
    tier: "sem_extracao",
    label: "Sem extração",
    shortLabel: "Sem extração",
    className: "bg-muted text-muted-foreground border-border",
    dotColor: "hsl(var(--muted-foreground))",
  },
};

/**
 * Estima o percentual de extração a partir do payload de um relatório/documento.
 * Usa `parsedData` como prova de que a IA leu o arquivo; cai em `conformidade` quando indisponível.
 */
export function estimateExtractionPercent(input: {
  parsedData?: any;
  conformidade?: number | null;
}): number {
  const pd = input.parsedData;
  const conf = typeof input.conformidade === "number" ? input.conformidade : null;

  // Sem qualquer evidência → 0
  if (!pd && (conf === null || conf <= 0)) return 0;

  // Se temos parsedData, derivamos um índice estrutural
  if (pd) {
    const years: string[] = Array.isArray(pd.years) ? pd.years : [];
    const rows: any[] = Array.isArray(pd.rows) ? pd.rows : Array.isArray(pd.balancete) ? pd.balancete : [];
    const hasYears = years.length > 0 ? 1 : 0;
    const hasRows = rows.length > 0 ? 1 : 0;
    const hasManyRows = rows.length >= 20 ? 1 : 0;
    const hasMultiPeriod = years.length >= 2 ? 1 : 0;
    const structural = (hasYears + hasRows + hasManyRows + hasMultiPeriod) / 4; // 0..1
    // Combina com conformidade (peso 0.5 cada) — conformidade ausente vira 50%
    const confNorm = conf !== null ? Math.min(100, Math.max(0, conf)) / 100 : 0.5;
    return Math.round((structural * 0.6 + confNorm * 0.4) * 100);
  }

  return Math.round(Math.min(100, Math.max(0, conf ?? 0)));
}

export function classifyExtraction(percent: number): ExtractionTier {
  if (percent >= 100) return "completo";
  if (percent >= 70) return "parcial";
  if (percent >= 40) return "incompleto";
  if (percent >= 1) return "falha";
  return "sem_extracao";
}

export function getExtractionMetric(input: {
  parsedData?: any;
  conformidade?: number | null;
}): ExtractionMetric {
  const percent = estimateExtractionPercent(input);
  const tier = classifyExtraction(percent);
  return { ...MAP[tier], percent };
}

export const EXTRACTION_TIERS: ExtractionTier[] = [
  "completo",
  "parcial",
  "incompleto",
  "falha",
  "sem_extracao",
];

export function getTierMeta(tier: ExtractionTier): Omit<ExtractionMetric, "percent"> {
  return MAP[tier];
}
