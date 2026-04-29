/**
 * Kanitz MENSAL — Score automático por mês a partir de BS & Dados.
 *
 * Implementa o MD "SCORE KANITZ AUTOMÁTICO":
 *   K = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5
 *
 *   X1 = Resultado / Ativo Total
 *   X2 = Patrimônio Líquido / Ativo Total
 *   X3 = Liquidez Geral
 *   X4 = Liquidez Corrente
 *   X5 = Dívida Total / Ativo Total
 *
 * Como o BSDadosRow é derivado de balancete (não DRE+BP completos), usamos
 * proxies determinísticos e transparentes:
 *   ativo_total ≈ ativo_circulante (proxy quando ANC não é capturado)
 *   patrimonio_liquido ≈ ativo_total − divida_total (equação contábil)
 *
 * A UI exibe os valores derivados para auditoria.
 */
import type { BSDadosRow } from "@/services/bsDadosBuilder";

export type KanitzRating = "A" | "B" | "C" | "D";

export interface KanitzMonthlyResult {
  mes: string;        // "Março 2024"
  mesKey: string;     // "2024-03"
  score: number;      // K (4 casas)
  rating: KanitzRating;
  ratingLabel: string; // "A - Saudável" etc.
  color: string;      // tailwind/hex hint
  x1: number; x2: number; x3: number; x4: number; x5: number;
  ativoTotal: number;
  patrimonioLiquido: number;
  liquidezGeral: number;
  liquidezCorrente: number;
  insight: string;
  warnings: string[]; // proxies aplicados, dados faltantes
}

export const KANITZ_RATING_META: Record<KanitzRating, { label: string; icon: string; color: string; tone: "ok" | "warn" | "alert" | "danger" }> = {
  A: { label: "A - Saudável",    icon: "🟢", color: "hsl(150,70%,42%)", tone: "ok" },
  B: { label: "B - Atenção",     icon: "🟡", color: "hsl(48,96%,53%)",  tone: "warn" },
  C: { label: "C - Risco",       icon: "🟠", color: "hsl(28,92%,55%)",  tone: "alert" },
  D: { label: "D - Insolvência", icon: "🔴", color: "hsl(0,75%,55%)",   tone: "danger" },
};

export function classifyKanitz(score: number): KanitzRating {
  if (score > 0) return "A";
  if (score > -3) return "B";
  if (score > -7) return "C";
  return "D";
}

export function calcKanitzScore(input: {
  resultado: number; ativoTotal: number; patrimonioLiquido: number;
  liquidezGeral: number; liquidezCorrente: number; dividaTotal: number;
}): { K: number; X1: number; X2: number; X3: number; X4: number; X5: number } {
  const at = input.ativoTotal || 1;
  const X1 = input.resultado / at;
  const X2 = input.patrimonioLiquido / at;
  const X3 = input.liquidezGeral || 0;
  const X4 = input.liquidezCorrente || 0;
  const X5 = input.dividaTotal / at;
  const K = 0.05 * X1 + 1.65 * X2 + 3.55 * X3 - 1.06 * X4 - 0.33 * X5;
  return { K: Number(K.toFixed(4)), X1, X2, X3, X4, X5 };
}

function genInsight(score: number, prevScore?: number): string {
  if (score < -7) return "Alto risco de insolvência — reestruturação imediata recomendada (Lei 11.101/2005).";
  if (score < -3) return "Zona de risco elevado — fragilidade nos indicadores de liquidez e endividamento.";
  if (score < 0) return "Zona de atenção — monitorar evolução mensal e revisar política de capital.";
  if (prevScore !== undefined && score > prevScore + 0.3) return "Recuperação financeira em curso — score em melhora consistente.";
  return "Empresa financeiramente saudável — manter monitoramento trimestral.";
}

/**
 * Constrói série mensal de Kanitz a partir das linhas BS & Dados.
 * Retorna um item por mês, ordenado cronologicamente.
 */
export function buildKanitzMonthlySeries(rows: BSDadosRow[] | null | undefined): KanitzMonthlyResult[] {
  if (!rows || rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.mesKey.localeCompare(b.mesKey));

  const out: KanitzMonthlyResult[] = [];
  let prevScore: number | undefined;

  for (const r of sorted) {
    const warnings: string[] = [];

    // Proxies determinísticos
    const ativoTotal = r.ativo_circulante > 0 ? r.ativo_circulante : 0;
    if (ativoTotal === 0) warnings.push("Ativo total ausente — score não confiável");
    else warnings.push("Ativo Total = Ativo Circulante (proxy: ANC não capturado no balancete)");

    const patrimonioLiquido = ativoTotal - (r.divida_total || 0);
    warnings.push("PL = Ativo Total − Dívida Total (equação contábil aproximada)");

    // Liquidez
    const liquidezCorrente = r.passivo_circulante > 0 ? r.ativo_circulante / r.passivo_circulante : 0;
    // Liquidez Geral ≈ AC / (PC + LP financeiro) — aproximamos com PC (sem ANC/PNC, é igual à LC)
    const liquidezGeral = liquidezCorrente;

    const { K, X1, X2, X3, X4, X5 } = calcKanitzScore({
      resultado: r.resultado || 0,
      ativoTotal,
      patrimonioLiquido,
      liquidezGeral,
      liquidezCorrente,
      dividaTotal: r.divida_total || 0,
    });

    const rating = classifyKanitz(K);
    const meta = KANITZ_RATING_META[rating];

    out.push({
      mes: r.mes,
      mesKey: r.mesKey,
      score: K,
      rating,
      ratingLabel: meta.label,
      color: meta.color,
      x1: X1, x2: X2, x3: X3, x4: X4, x5: X5,
      ativoTotal,
      patrimonioLiquido,
      liquidezGeral,
      liquidezCorrente,
      insight: genInsight(K, prevScore),
      warnings,
    });
    prevScore = K;
  }

  return out;
}

export interface KanitzMonthlySummary {
  count: number;
  avg: number;
  min: number;
  max: number;
  latest?: KanitzMonthlyResult;
  earliest?: KanitzMonthlyResult;
  trend: "up" | "down" | "stable";
  delta: number;
  globalRating: KanitzRating;
  globalLabel: string;
}

export function summarizeKanitzSeries(series: KanitzMonthlyResult[]): KanitzMonthlySummary | null {
  if (series.length === 0) return null;
  const scores = series.map(s => s.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const latest = series[series.length - 1];
  const earliest = series[0];
  const delta = series.length > 1 ? latest.score - earliest.score : 0;
  const trend: "up" | "down" | "stable" = delta > 0.3 ? "up" : delta < -0.3 ? "down" : "stable";
  const globalRating = classifyKanitz(avg);
  return {
    count: series.length,
    avg: Number(avg.toFixed(4)),
    min, max, latest, earliest,
    trend, delta: Number(delta.toFixed(4)),
    globalRating,
    globalLabel: KANITZ_RATING_META[globalRating].label,
  };
}
