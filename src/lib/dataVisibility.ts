/**
 * Métrica de VISIBILIDADE de DADOS pela IA.
 * Avalia se a IA conseguiu enxergar os meses e os dados do(s) balancete(s),
 * independentemente da consistência contábil interna.
 *
 * Classificação:
 *   100      → leu tudo (todos os meses com dados)
 *   40-99    → leu parcialmente (alguns meses em branco ou com poucos dados)
 *   1-39     → enxergou estrutura mas sem dados (meses presentes, valores ausentes)
 *   0        → não enxergou nada
 */
export type VisibilityTier = "total" | "parcial" | "estrutura" | "nenhuma";

export interface VisibilityMetric {
  percent: number;
  tier: VisibilityTier;
  label: string;
  shortLabel: string;
  dotColor: string;
  monthsExpected: number;
  monthsWithData: number;
  monthsBlank: number;
}

const META: Record<VisibilityTier, { label: string; shortLabel: string; dotColor: string }> = {
  total:     { label: "Leu todos os meses e dados",        shortLabel: "Total",     dotColor: "hsl(142,76%,36%)" },
  parcial:   { label: "Leu parcialmente (meses em branco)", shortLabel: "Parcial",   dotColor: "hsl(217,91%,50%)" },
  estrutura: { label: "Enxergou meses, sem dados",          shortLabel: "Estrutura", dotColor: "hsl(38,92%,50%)"  },
  nenhuma:   { label: "Não enxergou nada",                  shortLabel: "Nenhuma",   dotColor: "hsl(0,84%,60%)"   },
};

function classify(percent: number): VisibilityTier {
  if (percent >= 100) return "total";
  if (percent >= 40) return "parcial";
  if (percent >= 1) return "estrutura";
  return "nenhuma";
}

export function getVisibilityMetric(input: { parsedData?: any }): VisibilityMetric {
  const pd = input.parsedData;
  if (!pd) {
    const m = META.nenhuma;
    return { percent: 0, tier: "nenhuma", ...m, monthsExpected: 0, monthsWithData: 0, monthsBlank: 0 };
  }
  const years: string[] = Array.isArray(pd.years) ? pd.years : [];
  const rows: any[] = Array.isArray(pd.rows) ? pd.rows : Array.isArray(pd.balancete) ? pd.balancete : [];
  const monthsExpected = years.length || (rows.length > 0 ? 1 : 0);

  // Conta colunas/períodos com pelo menos um valor preenchido
  let monthsWithData = 0;
  if (years.length > 0 && rows.length > 0) {
    monthsWithData = years.filter(y =>
      rows.some(r => {
        const v = r?.[y] ?? r?.values?.[y] ?? r?.periods?.[y];
        return typeof v === "number" ? v !== 0 : v != null && v !== "";
      })
    ).length;
  } else if (rows.length > 0) {
    monthsWithData = 1;
  }

  const monthsBlank = Math.max(0, monthsExpected - monthsWithData);
  const percent = monthsExpected > 0
    ? Math.round((monthsWithData / monthsExpected) * 100)
    : (rows.length > 0 ? 30 : 0);

  const tier = classify(percent);
  return { percent, tier, ...META[tier], monthsExpected, monthsWithData, monthsBlank };
}

export const VISIBILITY_TIERS: VisibilityTier[] = ["total", "parcial", "estrutura", "nenhuma"];
export function getVisibilityTierMeta(tier: VisibilityTier) { return META[tier]; }
