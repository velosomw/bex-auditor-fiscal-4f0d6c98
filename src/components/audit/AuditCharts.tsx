/**
 * AuditCharts — 6 gráficos do relatório BEX/Kanitz, replicando exatamente
 * o layout da aba "Dados Gráficos" do template Excel.
 *
 * 1. CMV / Receita Líquida
 * 2. CMV + Despesa x Receita Líquida
 * 3. Resultado / Receita Líquida
 * 4. EBITDA
 * 5. Índices de Liquidez
 * 6. Evolução do Endividamento
 */
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, LineChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import {
  buildMonthlyDataset, computeIndicators, type MonthlyDatum,
} from "@/services/auditDatasetBuilder";
import type { ParsedFinancialData } from "@/services/auditAIService";

interface Props { parsedData?: ParsedFinancialData | null }

// Cores fixas (padrão Excel/relatório)
const COLOR_RECEITA = "#4F81BD";   // azul Excel
const COLOR_CMV     = "#E46C0A";   // laranja
const COLOR_NEG     = "#C0504D";   // vermelho
const COLOR_POS     = "#9BBB59";   // verde
const COLOR_LINE    = "#C0504D";   // linha % (vermelho/verde no resultado)
const COLOR_EBITDA  = "#4BACC6";   // ciano Excel

const COLOR_TRIB    = "#4F81BD";
const COLOR_TRAB    = "#E46C0A";
const COLOR_FIN     = "#7F7F7F";
const COLOR_FORN    = "#9BBB59";
const COLOR_RJ      = "#F2C200";
const COLOR_OUTRAS  = "#C0504D";
const COLOR_TOTAL   = "#C00000";

const COLOR_LIQ_IMED = "#4F81BD";
const COLOR_LIQ_CORR = "#C0504D";
const COLOR_LIQ_SECA = "#9BBB59";
const COLOR_LIQ_GER  = "#7B68B6";

// ─── FORMATTERS ────────────────────────────────────────────────────────────
const fmtMilhar = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#N/D";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(v));
};
const fmtMilharParen = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#N/D";
  const n = Math.round(v);
  return n < 0 ? `(${fmtMilhar(Math.abs(n))})` : fmtMilhar(n);
};
const fmtPct = (v: number | null | undefined, decimals = 2) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#N/D";
  return `${(v * 100).toFixed(decimals).replace(".", ",")}%`;
};
const fmtNumDec = (v: number | null | undefined, d = 2) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(d).replace(".", ",");
};

// Card padrão
const ChartCard: React.FC<{ title: React.ReactNode; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <Card className="overflow-hidden">
    <CardHeader className="pb-2 text-center">
      <CardTitle className="text-base font-bold uppercase tracking-wide whitespace-pre-line">{title}</CardTitle>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </CardHeader>
    <CardContent className="pt-0">{children}</CardContent>
  </Card>
);

const Empty: React.FC<{ msg?: string }> = ({ msg = "Dados insuficientes para gerar este gráfico." }) => (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <AlertTriangle className="w-6 h-6 mb-2 opacity-50" />
    <p className="text-xs">{msg}</p>
  </div>
);

// Tooltip estilizado comum
const tooltipStyle = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  fontSize: 12,
  borderRadius: 6,
};

// ════════════════════════════════════════════════════════════════════════════
// 4.1 — CMV / Receita Líquida
// ════════════════════════════════════════════════════════════════════════════
const ChartCMV: React.FC<{ data: MonthlyDatum[] }> = ({ data }) => {
  const rows = useMemo(() => data.map(d => {
    const ind = computeIndicators(d);
    const visible = d.hasReceita;
    return {
      mes: d.mes,
      Receita: visible ? Math.round(d.receita_liquida / 1000) : null,
      CMV: visible ? Math.round(d.cmv / 1000) : null,
      pct: visible && ind.cmvPct !== null ? +(ind.cmvPct * 100).toFixed(2) : null,
    };
  }), [data]);

  if (!rows.length) return <Empty />;
  return (
    <ChartCard title={"CMV / RECEITA LÍQUIDA\n(R$ x 1000)"}>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 30, right: 50, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtMilharParen} />
          <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[-100, 100]} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: any, name: string) => name === "pct" ? [fmtPct((v as number) / 100), "CMV / Receita"] : [fmtMilharParen(v), name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="Receita" name="Receita Líquida" fill={COLOR_RECEITA} radius={[2,2,0,0]}>
            <LabelList dataKey="Receita" position="top" formatter={(v: any) => v == null ? "#N/D" : fmtMilhar(v)} fontSize={10} />
          </Bar>
          <Bar yAxisId="left" dataKey="CMV" name="CMV" fill={COLOR_CMV} radius={[0,0,2,2]}>
            <LabelList dataKey="CMV" position="bottom" formatter={(v: any) => v == null ? "#N/D" : fmtMilharParen(v)} fontSize={10} />
          </Bar>
          <Line yAxisId="right" dataKey="pct" name="CMV / X RECEITA LIQUIDA (%)" stroke={COLOR_NEG} strokeWidth={2} type="monotone" dot={{ r: 4 }}>
            <LabelList dataKey="pct" position="top" formatter={(v: any) => v == null ? "" : `${v.toFixed(2).replace(".",",")}%`} fontSize={10} fill={COLOR_NEG} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// 4.2 — CMV + DESPESA x RECEITA LÍQUIDA
// ════════════════════════════════════════════════════════════════════════════
const ChartCMVDespesa: React.FC<{ data: MonthlyDatum[] }> = ({ data }) => {
  const rows = useMemo(() => data.map(d => {
    const ind = computeIndicators(d);
    const visible = d.hasReceita;
    const total = Math.abs(d.cmv) + Math.abs(d.despesas);
    return {
      mes: d.mes,
      Receita: visible ? Math.round(d.receita_liquida / 1000) : null,
      Custos: visible ? Math.round(total / 1000) : null,
      pct: visible && ind.cmvDespPct !== null ? +(ind.cmvDespPct * 100).toFixed(2) : null,
    };
  }), [data]);
  if (!rows.length) return <Empty />;
  return (
    <ChartCard title={"CMV + DESPESA × RECEITA LÍQUIDA\n(R$ x 1000)"} subtitle="Indicador de inviabilidade operacional (linha > 100% = crítico)">
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 30, right: 50, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtMilhar} />
          <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: any, name: string) => name === "pct" ? [fmtPct((v as number) / 100), "CMV+Desp / Receita"] : [fmtMilhar(v), name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="Receita" name="Receita Líquida" fill={COLOR_RECEITA} radius={[2,2,0,0]}>
            <LabelList dataKey="Receita" position="top" formatter={(v: any) => v == null ? "#N/D" : fmtMilhar(v)} fontSize={10} />
          </Bar>
          <Bar yAxisId="left" dataKey="Custos" name="CMV + DESPESA" fill={COLOR_NEG} radius={[2,2,0,0]}>
            <LabelList dataKey="Custos" position="top" formatter={(v: any) => v == null ? "#N/D" : fmtMilhar(v)} fontSize={10} />
          </Bar>
          <Line yAxisId="right" dataKey="pct" name="CMV + DESPESA / RECEITA LIQUIDA (%)" stroke={COLOR_NEG} strokeWidth={2} type="monotone" dot={{ r: 4 }}>
            <LabelList dataKey="pct" position="top" formatter={(v: any) => v == null ? "" : `${v.toFixed(2).replace(".",",")}%`} fontSize={10} fill={COLOR_NEG} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// 4.3 — RESULTADO / RECEITA
// ════════════════════════════════════════════════════════════════════════════
const ChartResultado: React.FC<{ data: MonthlyDatum[] }> = ({ data }) => {
  const rows = useMemo(() => data.map(d => {
    const ind = computeIndicators(d);
    const visible = d.hasReceita;
    return {
      mes: d.mes,
      Receita: visible ? Math.round(d.receita_liquida / 1000) : null,
      Resultado: visible ? Math.round(d.resultado / 1000) : null,
      pct: visible && ind.margemResultado !== null ? +(ind.margemResultado * 100).toFixed(2) : null,
    };
  }), [data]);
  if (!rows.length) return <Empty />;
  return (
    <ChartCard title={"RESULTADO / RECEITA LÍQUIDA\n(R$ x 1000)"}>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 30, right: 50, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtMilharParen} />
          <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: any, name: string) => name === "pct" ? [fmtPct((v as number) / 100), "Resultado / Receita"] : [fmtMilharParen(v), name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="Receita" name="Receita Líquida" fill={COLOR_RECEITA} radius={[2,2,0,0]}>
            <LabelList dataKey="Receita" position="top" formatter={(v: any) => v == null ? "#N/D" : fmtMilhar(v)} fontSize={10} />
          </Bar>
          <Bar yAxisId="left" dataKey="Resultado" name="Lucro/Prejuízo Líquido" fill={COLOR_CMV} radius={[2,2,0,0]}>
            <LabelList dataKey="Resultado" position="top" formatter={(v: any) => v == null ? "#N/D" : fmtMilharParen(v)} fontSize={10} />
          </Bar>
          <Line yAxisId="right" dataKey="pct" name="RESULTADO / RECEITA LIQUIDA (%)" stroke={COLOR_POS} strokeWidth={2} type="monotone" dot={{ r: 4 }}>
            <LabelList dataKey="pct" position="top" formatter={(v: any) => v == null ? "" : `${v.toFixed(2).replace(".",",")}%`} fontSize={10} fill={COLOR_POS} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// 4.4 — EBITDA (linha simples)
// ════════════════════════════════════════════════════════════════════════════
const ChartEBITDA: React.FC<{ data: MonthlyDatum[] }> = ({ data }) => {
  const rows = useMemo(() => data.map(d => ({
    mes: d.mes,
    EBITDA: d.hasReceita ? Math.round(d.ebitda) : null,
  })), [data]);
  if (!rows.length || rows.every(r => r.EBITDA == null)) return <Empty />;
  return (
    <ChartCard title="EBITDA">
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={rows} margin={{ top: 30, right: 30, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtMilharParen} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtMilharParen(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="EBITDA" stroke={COLOR_EBITDA} strokeWidth={3} type="monotone" dot={{ r: 5, fill: COLOR_EBITDA }}>
            <LabelList dataKey="EBITDA" position="top" formatter={(v: any) => v == null ? "" : fmtMilharParen(v)} fontSize={10} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// 4.5 — ÍNDICES DE LIQUIDEZ
// ════════════════════════════════════════════════════════════════════════════
const ChartLiquidez: React.FC<{ data: MonthlyDatum[] }> = ({ data }) => {
  const rows = useMemo(() => data.map(d => {
    const ind = computeIndicators(d);
    return {
      mes: d.mes,
      "LIQUIDEZ IMEDIATA": ind.liquidez_imediata !== null ? +ind.liquidez_imediata.toFixed(2) : null,
      "LIQUIDEZ CORRENTE": ind.liquidez_corrente !== null ? +ind.liquidez_corrente.toFixed(2) : null,
      "LIQUIDEZ SECA":     ind.liquidez_seca !== null ? +ind.liquidez_seca.toFixed(2) : null,
      "LIQUIDEZ GERAL":    ind.liquidez_geral !== null ? +ind.liquidez_geral.toFixed(2) : null,
    };
  }), [data]);
  if (!rows.length || rows.every(r => r["LIQUIDEZ CORRENTE"] == null)) return <Empty />;
  return (
    <ChartCard title="ÍNDICES DE LIQUIDEZ">
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={rows} margin={{ top: 30, right: 30, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => fmtNumDec(v)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtNumDec(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="LIQUIDEZ IMEDIATA" stroke={COLOR_LIQ_IMED} strokeWidth={2} type="monotone" dot={{ r: 3 }}>
            <LabelList dataKey="LIQUIDEZ IMEDIATA" position="top" formatter={(v: any) => v == null ? "" : fmtNumDec(v)} fontSize={9} fill={COLOR_LIQ_IMED} />
          </Line>
          <Line dataKey="LIQUIDEZ CORRENTE" stroke={COLOR_LIQ_CORR} strokeWidth={2} type="monotone" dot={{ r: 3 }}>
            <LabelList dataKey="LIQUIDEZ CORRENTE" position="top" formatter={(v: any) => v == null ? "" : fmtNumDec(v)} fontSize={9} fill={COLOR_LIQ_CORR} />
          </Line>
          <Line dataKey="LIQUIDEZ SECA" stroke={COLOR_LIQ_SECA} strokeWidth={2} type="monotone" dot={{ r: 3 }}>
            <LabelList dataKey="LIQUIDEZ SECA" position="top" formatter={(v: any) => v == null ? "" : fmtNumDec(v)} fontSize={9} fill={COLOR_LIQ_SECA} />
          </Line>
          <Line dataKey="LIQUIDEZ GERAL" stroke={COLOR_LIQ_GER} strokeWidth={2} type="monotone" dot={{ r: 3 }}>
            <LabelList dataKey="LIQUIDEZ GERAL" position="top" formatter={(v: any) => v == null ? "" : fmtNumDec(v)} fontSize={9} fill={COLOR_LIQ_GER} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// 4.6 — EVOLUÇÃO DO ENDIVIDAMENTO (stack + linha total)
// ════════════════════════════════════════════════════════════════════════════
const ChartEndividamento: React.FC<{ data: MonthlyDatum[] }> = ({ data }) => {
  const rows = useMemo(() => data.map(d => ({
    mes: d.mes,
    "OBRIG. TRIBUTÁRIAS":  d.divida_tributaria  || 0,
    "OBRIG. TRABALHISTAS": d.divida_trabalhista || 0,
    "EMPR. E FINANCIAMENTOS": d.divida_financeira || 0,
    "FORNECEDORES":        d.fornecedores       || 0,
    "CREDORES RJ":         d.credores_rj        || 0,
    "OUTRAS OBRIGAÇÕES":   d.outras_obrigacoes  || 0,
    TOTAL: d.divida_total || 0,
  })), [data]);
  if (!rows.length || rows.every(r => r.TOTAL === 0)) return <Empty />;
  return (
    <ChartCard title={"EVOLUÇÃO DO ENDIVIDAMENTO\n(Em milhares de reais)"}>
      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={rows} margin={{ top: 30, right: 60, left: 20, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtMilhar} />
          <YAxis yAxisId="right" orientation="right" stroke={COLOR_TOTAL} fontSize={11} tickFormatter={fmtMilhar} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtMilhar(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="OBRIG. TRIBUTÁRIAS"  stackId="d" fill={COLOR_TRIB} />
          <Bar yAxisId="left" dataKey="OBRIG. TRABALHISTAS" stackId="d" fill={COLOR_TRAB} />
          <Bar yAxisId="left" dataKey="EMPR. E FINANCIAMENTOS" stackId="d" fill={COLOR_FIN} />
          <Bar yAxisId="left" dataKey="FORNECEDORES"        stackId="d" fill={COLOR_FORN} />
          <Bar yAxisId="left" dataKey="CREDORES RJ"         stackId="d" fill={COLOR_RJ} />
          <Bar yAxisId="left" dataKey="OUTRAS OBRIGAÇÕES"   stackId="d" fill={COLOR_OUTRAS} />
          <Line yAxisId="right" dataKey="TOTAL" stroke={COLOR_TOTAL} strokeWidth={3} type="monotone" dot={{ r: 5, fill: COLOR_TOTAL }}>
            <LabelList dataKey="TOTAL" position="top" formatter={(v: any) => fmtMilhar(v)} fontSize={10} fill={COLOR_TOTAL} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// CONTAINER
// ════════════════════════════════════════════════════════════════════════════
const AuditCharts: React.FC<Props> = ({ parsedData }) => {
  const dataset = useMemo(() => buildMonthlyDataset(parsedData ?? null), [parsedData]);

  if (!dataset.length) {
    return (
      <Card>
        <CardContent className="py-10">
          <Empty msg="Carregue um balancete na fase de processamento para gerar os gráficos." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ChartCMV data={dataset} />
      <ChartCMVDespesa data={dataset} />
      <ChartResultado data={dataset} />
      <ChartEBITDA data={dataset} />
      <ChartLiquidez data={dataset} />
      <ChartEndividamento data={dataset} />
    </div>
  );
};

export default AuditCharts;
