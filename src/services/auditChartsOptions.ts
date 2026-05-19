/**
 * Helpers, paleta e insights para o Dashboard Executivo.
 * Refatorado de Apache ECharts → Recharts (vulnerabilidade Critical em
 * echarts-for-react/size-sensor). As séries são construídas em AuditCharts.tsx.
 */
import { computeIndicators, type MonthlyDatum } from "@/services/auditDatasetBuilder";

// ─── PALETA EXCEL ─────────────────────────────────────────────────────────
export const EXCEL_COLORS = {
  azul: "#4F81BD",
  laranja: "#F79646",
  vermelho: "#C00000",
  verde: "#9BBB59",
  roxo: "#8064A2",
  cinza: "#D9D9D9",
  cinzaEscuro: "#7F7F7F",
  ciano: "#4BACC6",
  amarelo: "#F2C200",
};

// ─── FORMATTERS ───────────────────────────────────────────────────────────
export const fmtMilhar = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#N/D";
  const n = Math.round(v as number);
  const s = new Intl.NumberFormat("pt-BR").format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
};
export const fmtPct = (v: number | null | undefined, dec = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#N/D";
  return `${(v as number).toFixed(dec).replace(".", ",")}%`;
};
export const fmtDec = (v: number | null | undefined, dec = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return (v as number).toFixed(dec).replace(".", ",");
};

// ─── INSIGHTS AUTOMÁTICOS ─────────────────────────────────────────────────
export interface ChartInsight { tipo: "critico" | "atencao" | "info"; texto: string }

export function generateInsights(data: MonthlyDatum[]): ChartInsight[] {
  if (!data.length) return [];
  const insights: ChartInsight[] = [];
  const last = data[data.length - 1];
  const ind = computeIndicators(last);

  if (ind.cmvPct !== null && ind.cmvPct > 0.8) {
    insights.push({ tipo: "critico", texto: `CMV elevado (${fmtPct(ind.cmvPct * 100)}) — risco operacional` });
  }
  if (ind.cmvDespPct !== null && ind.cmvDespPct > 1) {
    insights.push({ tipo: "critico", texto: `CMV+Despesa supera receita (${fmtPct(ind.cmvDespPct * 100)}) — operação inviável` });
  }
  if (ind.margemResultado !== null && ind.margemResultado < 0) {
    insights.push({ tipo: "critico", texto: `Resultado negativo (${fmtPct(ind.margemResultado * 100)})` });
  }
  if (ind.liquidez_corrente !== null && ind.liquidez_corrente < 1) {
    insights.push({ tipo: "critico", texto: `Liquidez corrente baixa (${fmtDec(ind.liquidez_corrente)}) — risco financeiro` });
  }
  if (last.ebitda < 0) {
    insights.push({ tipo: "atencao", texto: `EBITDA negativo (${fmtMilhar(last.ebitda)})` });
  }
  if (data.length >= 2) {
    const first = data[0];
    if (first.divida_total > 0 && last.divida_total > first.divida_total * 1.05) {
      const delta = ((last.divida_total - first.divida_total) / first.divida_total) * 100;
      insights.push({ tipo: "atencao", texto: `Endividamento cresceu ${fmtPct(delta, 1)} no período` });
    }
  }
  if (!insights.length) insights.push({ tipo: "info", texto: "Indicadores dentro de faixas operacionais aceitáveis." });
  return insights;
}
