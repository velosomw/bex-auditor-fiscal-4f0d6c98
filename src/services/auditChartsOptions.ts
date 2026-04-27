/**
 * ECharts options para os 6 gráficos do Dashboard Executivo (BEX + Kanitz).
 * Tema fiel ao Excel — cores, fontes, escalas e labels idênticos.
 *
 * Entrada: MonthlyDatum[] do auditDatasetBuilder.
 * Saída: option pronto para <ReactECharts option={...} />.
 */
import type { EChartsOption } from "echarts";
import { computeIndicators, type MonthlyDatum } from "@/services/auditDatasetBuilder";

// ─── TEMA EXCEL ────────────────────────────────────────────────────────────
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

const TEXT_STYLE = { fontFamily: "Segoe UI, Arial, sans-serif", fontSize: 11, color: "#333" } as const;
const AXIS_LINE = { lineStyle: { color: "#BFBFBF" } } as const;
const SPLIT_LINE = { lineStyle: { color: "#E7E7E7", type: "dashed" as const } };

// ─── HELPERS ───────────────────────────────────────────────────────────────
const fmtMilhar = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#N/D";
  const n = Math.round(v as number);
  const s = new Intl.NumberFormat("pt-BR").format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
};
const fmtPct = (v: number | null | undefined, dec = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#N/D";
  return `${(v as number).toFixed(dec).replace(".", ",")}%`;
};
const fmtDec = (v: number | null | undefined, dec = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return (v as number).toFixed(dec).replace(".", ",");
};

// Constrói labels para topo/base de barra Excel-style (caixa branca com borda)
const labelBox = (formatter: (p: any) => string, position: "top" | "bottom" = "top") => ({
  show: true,
  position,
  formatter,
  fontSize: 10,
  fontFamily: TEXT_STYLE.fontFamily,
  color: "#333",
  backgroundColor: "#fff",
  borderColor: "#BFBFBF",
  borderWidth: 0.5,
  borderRadius: 2,
  padding: [2, 4] as [number, number],
});

const baseGrid = { left: 60, right: 70, top: 50, bottom: 60, containLabel: true };

const baseTooltip = {
  trigger: "axis" as const,
  axisPointer: { type: "shadow" as const },
  textStyle: TEXT_STYLE,
  backgroundColor: "rgba(255,255,255,0.96)",
  borderColor: "#BFBFBF",
  borderWidth: 1,
};

const baseLegend = {
  bottom: 0,
  textStyle: TEXT_STYLE,
  itemWidth: 14,
  itemHeight: 10,
  itemGap: 16,
};

const baseTitle = (text: string, sub?: string) => ({
  text,
  subtext: sub,
  left: "center",
  top: 4,
  textStyle: { fontFamily: TEXT_STYLE.fontFamily, fontSize: 13, fontWeight: "bold" as const, color: "#1F1F1F" },
  subtextStyle: { fontFamily: TEXT_STYLE.fontFamily, fontSize: 11, color: "#1F1F1F" },
});

// ════════════════════════════════════════════════════════════════════════════
// 1. CMV / RECEITA LÍQUIDA
// ════════════════════════════════════════════════════════════════════════════
export const buildCMVOption = (data: MonthlyDatum[]): EChartsOption => {
  const meses = data.map(d => d.mes);
  const receita = data.map(d => d.hasReceita ? Math.round(d.receita_liquida / 1000) : null);
  const cmv = data.map(d => d.hasReceita ? Math.round(d.cmv / 1000) : null); // negativo
  const pct = data.map(d => {
    const ind = computeIndicators(d);
    return d.hasReceita && ind.cmvPct !== null ? +(ind.cmvPct * 100).toFixed(2) : null;
  });

  return {
    title: baseTitle("CMV / RECEITA LÍQUIDA", "(R$ x 1000)"),
    tooltip: { ...baseTooltip,
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params];
        return `<b>${arr[0].axisValue}</b><br/>` + arr.map((p: any) =>
          `${p.marker}${p.seriesName}: <b>${p.seriesName.includes("%") ? fmtPct(p.value) : fmtMilhar(p.value)}</b>`
        ).join("<br/>");
      },
    },
    legend: baseLegend,
    grid: baseGrid,
    xAxis: { type: "category", data: meses, axisLine: AXIS_LINE, axisTick: { show: false }, axisLabel: TEXT_STYLE },
    yAxis: [
      { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: SPLIT_LINE, axisLabel: { ...TEXT_STYLE, formatter: (v: number) => fmtMilhar(v) } },
      { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { ...TEXT_STYLE, formatter: "{value}%" }, min: -100, max: 100 },
    ],
    series: [
      { name: "Receita Líquida", type: "bar", data: receita, itemStyle: { color: EXCEL_COLORS.azul, borderRadius: [2,2,0,0] }, barGap: 0,
        label: labelBox((p: any) => fmtMilhar(p.value), "top"), emphasis: { focus: "series" } },
      { name: "CMV", type: "bar", data: cmv, itemStyle: { color: EXCEL_COLORS.laranja, borderRadius: [0,0,2,2] },
        label: labelBox((p: any) => fmtMilhar(p.value), "bottom"), emphasis: { focus: "series" } },
      { name: "CMV / X RECEITA LIQUIDA (%)", type: "line", yAxisIndex: 1, data: pct,
        lineStyle: { color: EXCEL_COLORS.vermelho, width: 2 }, itemStyle: { color: EXCEL_COLORS.vermelho },
        symbol: "circle", symbolSize: 6, smooth: false,
        label: { ...labelBox((p: any) => fmtPct(p.value), "top"), color: EXCEL_COLORS.vermelho } },
    ],
  };
};

// ════════════════════════════════════════════════════════════════════════════
// 2. CMV + DESPESA × RECEITA
// ════════════════════════════════════════════════════════════════════════════
export const buildCMVDespesaOption = (data: MonthlyDatum[]): EChartsOption => {
  const meses = data.map(d => d.mes);
  const receita = data.map(d => d.hasReceita ? Math.round(d.receita_liquida / 1000) : null);
  const custos = data.map(d => d.hasReceita ? Math.round((Math.abs(d.cmv) + Math.abs(d.despesas)) / 1000) : null);
  const pct = data.map(d => {
    const ind = computeIndicators(d);
    return d.hasReceita && ind.cmvDespPct !== null ? +(ind.cmvDespPct * 100).toFixed(2) : null;
  });

  return {
    title: baseTitle("CMV + DESPESA × RECEITA LÍQUIDA", "(R$ x 1000)"),
    tooltip: { ...baseTooltip,
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params];
        return `<b>${arr[0].axisValue}</b><br/>` + arr.map((p: any) =>
          `${p.marker}${p.seriesName}: <b>${p.seriesName.includes("%") ? fmtPct(p.value) : fmtMilhar(p.value)}</b>`
        ).join("<br/>");
      },
    },
    legend: baseLegend,
    grid: baseGrid,
    xAxis: { type: "category", data: meses, axisLine: AXIS_LINE, axisTick: { show: false }, axisLabel: TEXT_STYLE },
    yAxis: [
      { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: SPLIT_LINE, axisLabel: { ...TEXT_STYLE, formatter: (v: number) => fmtMilhar(v) } },
      { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { ...TEXT_STYLE, formatter: "{value}%" } },
    ],
    series: [
      { name: "Receita Líquida", type: "bar", data: receita, itemStyle: { color: EXCEL_COLORS.azul, borderRadius: [2,2,0,0] },
        label: labelBox((p: any) => fmtMilhar(p.value), "top"), emphasis: { focus: "series" } },
      { name: "CMV + DESPESA / RECEITA LIQUIDA", type: "bar", data: custos, itemStyle: { color: EXCEL_COLORS.vermelho, borderRadius: [2,2,0,0] },
        label: labelBox((p: any) => fmtMilhar(p.value), "top"), emphasis: { focus: "series" } },
      { name: "CMV + DESPESA / RECEITA LIQUIDA (%)", type: "line", yAxisIndex: 1, data: pct,
        lineStyle: { color: EXCEL_COLORS.vermelho, width: 2 }, itemStyle: { color: EXCEL_COLORS.vermelho },
        symbol: "circle", symbolSize: 6,
        label: { ...labelBox((p: any) => fmtPct(p.value), "top"), color: EXCEL_COLORS.vermelho },
        markLine: { silent: true, symbol: "none", lineStyle: { color: EXCEL_COLORS.vermelho, type: "dashed" }, data: [{ yAxis: 100, label: { formatter: "100% (limite)", fontSize: 10 } }] } },
    ],
  };
};

// ════════════════════════════════════════════════════════════════════════════
// 3. RESULTADO / RECEITA
// ════════════════════════════════════════════════════════════════════════════
export const buildResultadoOption = (data: MonthlyDatum[]): EChartsOption => {
  const meses = data.map(d => d.mes);
  const receita = data.map(d => d.hasReceita ? Math.round(d.receita_liquida / 1000) : null);
  const resultado = data.map(d => d.hasReceita ? Math.round(d.resultado / 1000) : null);
  const pct = data.map(d => {
    const ind = computeIndicators(d);
    return d.hasReceita && ind.margemResultado !== null ? +(ind.margemResultado * 100).toFixed(2) : null;
  });

  return {
    title: baseTitle("RESULTADO / RECEITA LÍQUIDA", "(R$ x 1000)"),
    tooltip: { ...baseTooltip,
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params];
        return `<b>${arr[0].axisValue}</b><br/>` + arr.map((p: any) =>
          `${p.marker}${p.seriesName}: <b>${p.seriesName.includes("%") ? fmtPct(p.value) : fmtMilhar(p.value)}</b>`
        ).join("<br/>");
      },
    },
    legend: baseLegend,
    grid: baseGrid,
    xAxis: { type: "category", data: meses, axisLine: AXIS_LINE, axisTick: { show: false }, axisLabel: TEXT_STYLE },
    yAxis: [
      { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: SPLIT_LINE, axisLabel: { ...TEXT_STYLE, formatter: (v: number) => fmtMilhar(v) } },
      { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { ...TEXT_STYLE, formatter: "{value}%" } },
    ],
    series: [
      { name: "Receita Líquida", type: "bar", data: receita, itemStyle: { color: EXCEL_COLORS.azul, borderRadius: [2,2,0,0] },
        label: labelBox((p: any) => fmtMilhar(p.value), "top"), emphasis: { focus: "series" } },
      { name: "Lucro/Prejuízo Líquido", type: "bar", data: resultado, itemStyle: { color: EXCEL_COLORS.laranja, borderRadius: [2,2,0,0] },
        label: labelBox((p: any) => fmtMilhar(p.value), "top"), emphasis: { focus: "series" } },
      { name: "RESULTADO / RECEITA LIQUIDA (%)", type: "line", yAxisIndex: 1, data: pct,
        lineStyle: { color: EXCEL_COLORS.verde, width: 2 }, itemStyle: { color: EXCEL_COLORS.verde },
        symbol: "circle", symbolSize: 6,
        label: { ...labelBox((p: any) => fmtPct(p.value), "top"), color: EXCEL_COLORS.verde } },
    ],
  };
};

// ════════════════════════════════════════════════════════════════════════════
// 4. EBITDA
// ════════════════════════════════════════════════════════════════════════════
export const buildEBITDAOption = (data: MonthlyDatum[]): EChartsOption => {
  const meses = data.map(d => d.mes);
  const ebitda = data.map(d => d.hasReceita ? Math.round(d.ebitda) : null);
  return {
    title: baseTitle("EBITDA"),
    tooltip: { ...baseTooltip, trigger: "axis", formatter: (params: any) => {
      const p = Array.isArray(params) ? params[0] : params;
      return `<b>${p.axisValue}</b><br/>${p.marker}EBITDA: <b>${fmtMilhar(p.value)}</b>`;
    } },
    legend: baseLegend,
    grid: baseGrid,
    xAxis: { type: "category", data: meses, axisLine: AXIS_LINE, axisTick: { show: false }, axisLabel: TEXT_STYLE },
    yAxis: { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: SPLIT_LINE, axisLabel: { ...TEXT_STYLE, formatter: (v: number) => fmtMilhar(v) } },
    series: [
      { name: "EBITDA", type: "line", data: ebitda,
        lineStyle: { color: EXCEL_COLORS.ciano, width: 3 }, itemStyle: { color: EXCEL_COLORS.ciano },
        symbol: "circle", symbolSize: 7, smooth: false,
        label: { ...labelBox((p: any) => fmtMilhar(p.value), "top"), color: EXCEL_COLORS.ciano },
        markLine: { silent: true, symbol: "none", lineStyle: { color: EXCEL_COLORS.cinza }, data: [{ yAxis: 0 }] } },
    ],
  };
};

// ════════════════════════════════════════════════════════════════════════════
// 5. ÍNDICES DE LIQUIDEZ
// ════════════════════════════════════════════════════════════════════════════
export const buildLiquidezOption = (data: MonthlyDatum[]): EChartsOption => {
  const meses = data.map(d => d.mes);
  const series = (key: "liquidez_imediata"|"liquidez_corrente"|"liquidez_seca"|"liquidez_geral") =>
    data.map(d => {
      const v = computeIndicators(d)[key];
      return v !== null ? +v.toFixed(2) : null;
    });

  const mkLine = (name: string, key: any, color: string) => ({
    name, type: "line" as const, data: series(key),
    lineStyle: { color, width: 2 }, itemStyle: { color },
    symbol: "circle", symbolSize: 5,
    label: { ...labelBox((p: any) => fmtDec(p.value), "top"), color, fontSize: 9 },
    emphasis: { focus: "series" as const },
  });

  return {
    title: baseTitle("ÍNDICES DE LIQUIDEZ"),
    tooltip: { ...baseTooltip, trigger: "axis", formatter: (params: any) => {
      const arr = Array.isArray(params) ? params : [params];
      return `<b>${arr[0].axisValue}</b><br/>` + arr.map((p: any) =>
        `${p.marker}${p.seriesName}: <b>${fmtDec(p.value)}</b>`).join("<br/>");
    } },
    legend: baseLegend,
    grid: baseGrid,
    xAxis: { type: "category", data: meses, axisLine: AXIS_LINE, axisTick: { show: false }, axisLabel: TEXT_STYLE },
    yAxis: { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: SPLIT_LINE, axisLabel: { ...TEXT_STYLE, formatter: (v: number) => fmtDec(v) } },
    series: [
      mkLine("LIQUIDEZ IMEDIATA", "liquidez_imediata", EXCEL_COLORS.azul),
      mkLine("LIQUIDEZ CORRENTE", "liquidez_corrente", EXCEL_COLORS.vermelho),
      mkLine("LIQUIDEZ SECA",     "liquidez_seca",     EXCEL_COLORS.verde),
      mkLine("LIQUIDEZ GERAL",    "liquidez_geral",    EXCEL_COLORS.roxo),
    ],
  };
};

// ════════════════════════════════════════════════════════════════════════════
// 6. EVOLUÇÃO DO ENDIVIDAMENTO (stack + linha total)
// ════════════════════════════════════════════════════════════════════════════
export const buildEndividamentoOption = (data: MonthlyDatum[]): EChartsOption => {
  const meses = data.map(d => d.mes);
  const total = data.map(d => Math.round(d.divida_total));
  const stack = (key: keyof MonthlyDatum, name: string, color: string) => ({
    name, type: "bar" as const, stack: "div",
    data: data.map(d => Math.round(Number(d[key] || 0))),
    itemStyle: { color },
    label: { show: true, position: "inside" as const, formatter: (p: any) => p.value > 0 ? fmtMilhar(p.value) : "", fontSize: 9, color: "#fff" },
    emphasis: { focus: "series" as const },
  });

  return {
    title: baseTitle("EVOLUÇÃO DO ENDIVIDAMENTO", "(Em milhares de reais)"),
    tooltip: { ...baseTooltip, trigger: "axis", formatter: (params: any) => {
      const arr = Array.isArray(params) ? params : [params];
      return `<b>${arr[0].axisValue}</b><br/>` + arr.map((p: any) =>
        `${p.marker}${p.seriesName}: <b>${fmtMilhar(p.value)}</b>`).join("<br/>");
    } },
    legend: { ...baseLegend, type: "scroll" },
    grid: { ...baseGrid, bottom: 70 },
    xAxis: { type: "category", data: meses, axisLine: AXIS_LINE, axisTick: { show: false }, axisLabel: TEXT_STYLE },
    yAxis: [
      { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: SPLIT_LINE, axisLabel: { ...TEXT_STYLE, formatter: (v: number) => fmtMilhar(v) } },
      { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { ...TEXT_STYLE, formatter: (v: number) => fmtMilhar(v), color: EXCEL_COLORS.vermelho } },
    ],
    series: [
      stack("divida_tributaria",  "OBRIG. TRIBUTÁRIAS",      EXCEL_COLORS.azul),
      stack("divida_trabalhista", "OBRIG. TRABALHISTAS",     EXCEL_COLORS.laranja),
      stack("divida_financeira",  "EMPR. E FINANCIAMENTOS",  EXCEL_COLORS.cinzaEscuro),
      stack("fornecedores",       "FORNECEDORES",            EXCEL_COLORS.verde),
      stack("credores_rj",        "CREDORES RJ",             EXCEL_COLORS.amarelo),
      stack("outras_obrigacoes",  "OUTRAS OBRIGAÇÕES",       EXCEL_COLORS.vermelho),
      { name: "TOTAL", type: "line", yAxisIndex: 1, data: total,
        lineStyle: { color: EXCEL_COLORS.vermelho, width: 3 }, itemStyle: { color: EXCEL_COLORS.vermelho },
        symbol: "circle", symbolSize: 7,
        label: { ...labelBox((p: any) => fmtMilhar(p.value), "top"), color: EXCEL_COLORS.vermelho } },
    ],
  };
};

// ─── INSIGHTS AUTOMÁTICOS (alimenta o relatório) ───────────────────────────
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
  // Endividamento crescente?
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
