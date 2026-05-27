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
  rl: number; lg: number; ls: number; lc: number; ge: number;
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
  resultado: number; pl: number; ac: number; anc: number; pc: number; pnc: number;
  estoques: number; dividaTotal: number;
  /** Onda 2 — RLP discriminado (Refs P..T). Quando ausente, derivamos do ANC. */
  rlp?: number;
  imobilizado?: number;
  intangivel?: number;
  investimentos?: number;
}): { K: number; RL: number; LG: number; LS: number; LC: number; GE: number } {
  const pl = input.pl;
  const pc = input.pc || 1;
  const at = (input.ac || 0) + (input.anc || 0);
  const pt = (input.pc || 0) + (input.pnc || 0);

  // RL = Rentabilidade do PL = Lucro / PL  (N/A se PL ≤ 0)
  const RL = pl > 0 ? input.resultado / pl : 0;

  // LG = (AC + RLP) / (PC + PNC) — Onda 2.
  // Prioridade: (1) RLP explícito → (2) ANC − Imob − Intang − Invest → (3) ANC total.
  const rlpExplicit = input.rlp ?? 0;
  const rlpResidual = (input.anc || 0)
    - (input.imobilizado ?? 0)
    - (input.intangivel ?? 0)
    - (input.investimentos ?? 0);
  const rlpEff = rlpExplicit > 0
    ? rlpExplicit
    : (rlpResidual > 0 ? rlpResidual : (input.anc || 0));
  const LG = pt > 0 ? (input.ac + rlpEff) / pt : (input.ac / (input.dividaTotal || 1));

  const LS = (input.ac - input.estoques) / pc;
  const LC = input.ac / pc;
  // GE = Grau de Endividamento = (PC + PNC) / PL  (N/A se PL ≤ 0)
  const GE = pl > 0 ? pt / pl : 0;

  const K = (0.05 * RL) + (1.65 * LG) + (3.55 * LS) - (1.06 * LC) - (0.33 * GE);
  return { K: Number(K.toFixed(4)), RL, LG, LS, LC, GE };
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

    // Ativo Total — usa ANC real quando capturado, senão proxy = AC.
    const ancCaptured = (r.ativo_nao_circulante || 0) > 0;
    const ativoTotal = (r.ativo_circulante || 0) + (r.ativo_nao_circulante || 0);
    if (ativoTotal === 0) warnings.push("Ativo total ausente — score não confiável");
    else if (!ancCaptured) warnings.push("Ativo Não Circulante não capturado — Ativo Total = AC (proxy)");

    // PL — usa valor real do SSOT (REF GG1 + HH1); fallback à equação contábil só se ausente.
    const plCaptured = (r.patrimonio_liquido || 0) !== 0;
    const patrimonioLiquido = plCaptured
      ? r.patrimonio_liquido
      : ativoTotal - (r.divida_total || 0);
    if (!plCaptured) warnings.push("PL não capturado — usando Ativo Total − Dívida Total (aproximação)");

    // Liquidez Corrente direta. Liquidez Geral usa RLP discriminado (Onda 2).
    const liquidezCorrente = r.passivo_circulante > 0 ? r.ativo_circulante / r.passivo_circulante : 0;
    const passivoTotal = (r.passivo_circulante || 0) + (r.passivo_nao_circulante || 0);
    const rlpExplicit = (r as any).realizavel_longo_prazo ?? 0;
    const rlpResidual = (r.ativo_nao_circulante || 0)
      - ((r as any).imobilizado ?? 0)
      - ((r as any).intangivel ?? 0)
      - ((r as any).investimentos ?? 0);
    const rlpEff = rlpExplicit > 0 ? rlpExplicit : (rlpResidual > 0 ? rlpResidual : (r.ativo_nao_circulante || 0));
    const liquidezGeral = passivoTotal > 0
      ? ((r.ativo_circulante || 0) + rlpEff) / passivoTotal
      : liquidezCorrente;

    const { K, RL, LG, LS, LC, GE } = calcKanitzScore({
      resultado: r.resultado || 0,
      pl: patrimonioLiquido,
      ac: r.ativo_circulante || 0,
      anc: r.ativo_nao_circulante || 0,
      pc: r.passivo_circulante || 0,
      pnc: r.passivo_nao_circulante || 0,
      estoques: r.estoques || 0,
      dividaTotal: r.divida_total || 0,
      rlp: rlpExplicit,
      imobilizado: (r as any).imobilizado ?? 0,
      intangivel: (r as any).intangivel ?? 0,
      investimentos: (r as any).investimentos ?? 0,
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
      rl: RL, lg: LG, ls: LS, lc: LC, ge: GE,
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
