/**
 * VARIAÇÃO MENSAL — Política canônica (Onda 9).
 *
 * Fórmula A (oficial em todas as telas de "Variação m/m"):
 *     variacaoMoM = (valor_mes / valor_mes_anterior) - 1
 *
 * Fórmula B (NÃO usar como "Variação m/m"):
 *     variacaoMediaAcumulada = (valor_mes / media_acumulada_meses_anteriores) - 1
 *   Só pode ser exibida com o rótulo explícito "Variação vs Média Acumulada".
 *
 * Esta separação evita a recorrência da dúvida observada no caso Giannini:
 * "Variação Custos dez/25" na planilha (374%) era Fórmula B disfarçada de A;
 * a plataforma exibia o valor correto pela Fórmula A (19%).
 */

export type VarKind = "mom" | "media_acumulada";

export const VAR_LABEL: Record<VarKind, string> = {
  mom: "Variação m/m",
  media_acumulada: "Variação vs Média Acumulada",
};

/** Fórmula A — Variação mês contra mês imediatamente anterior. */
export function variacaoMoM(valorMes: number, valorMesAnterior: number): number | null {
  if (!Number.isFinite(valorMes) || !Number.isFinite(valorMesAnterior)) return null;
  if (valorMesAnterior === 0) return null;
  return valorMes / valorMesAnterior - 1;
}

/** Fórmula B — Variação contra a média dos meses anteriores acumulados. */
export function variacaoVsMediaAcumulada(valorMes: number, mesesAnteriores: number[]): number | null {
  if (!Number.isFinite(valorMes) || !mesesAnteriores.length) return null;
  const validos = mesesAnteriores.filter(Number.isFinite);
  if (!validos.length) return null;
  const media = validos.reduce((a, b) => a + b, 0) / validos.length;
  if (media === 0) return null;
  return valorMes / media - 1;
}

/** Formata variação como string PT-BR com sinal e 1 casa. */
export function formatVar(v: number | null): string {
  if (v == null) return "—";
  const pct = v * 100;
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct.toFixed(1)}%`;
}
