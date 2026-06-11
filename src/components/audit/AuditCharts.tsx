/**
 * Dashboard Executivo — 6 gráficos via Recharts.
 * Refatorado de Apache ECharts (vulnerabilidade Critical em echarts-for-react)
 * mantendo a paleta Excel e a leitura visual original.
 */
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, LineChart,
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, TrendingDown } from "lucide-react";
import { buildMonthlyDataset, computeIndicators, type MonthlyDatum } from "@/services/auditDatasetBuilder";
import { buildBSDados, type BalanceteEntry } from "@/services/bsDadosBuilder";
import { bsDadosToMonthlyDataset } from "@/services/bsDadosToMonthlyDatum";
import { EXCEL_COLORS, fmtMilhar, fmtPct, fmtDec, generateInsights } from "@/services/auditChartsOptions";
import type { ParsedFinancialData } from "@/services/auditAIService";
import WindowSelector, { applyWindow, type Window } from "./WindowSelector";
import MonthsConsistencyAlert from "./MonthsConsistencyAlert";
import SanityDiagnostico from "./SanityDiagnostico";

interface Props {
  parsedData?: ParsedFinancialData | null;
  entries?: BalanceteEntry[];
}

const TITLE_STYLE = "text-center text-[13px] font-bold text-foreground mb-1 uppercase tracking-wide";
const SUB_STYLE = "text-center text-[11px] text-muted-foreground mb-2 font-medium";
const AXIS_PROPS = {
  tick: { fontSize: 12, fill: "hsl(var(--foreground))", fontFamily: "Segoe UI, Arial, sans-serif", fontWeight: 500 },
  stroke: "hsl(var(--foreground) / 0.35)",
  tickLine: { stroke: "hsl(var(--foreground) / 0.35)" },
};
const GRID = <CartesianGrid stroke="hsl(var(--foreground) / 0.18)" strokeDasharray="3 3" vertical={false} />;
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--background))",
    border: "1px solid hsl(var(--foreground) / 0.25)",
    fontSize: 12,
    fontFamily: "Segoe UI, Arial, sans-serif",
    color: "hsl(var(--foreground))",
    borderRadius: 6,
    boxShadow: "0 4px 12px hsl(var(--foreground) / 0.15)",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--foreground))" },
  cursor: { fill: "hsl(var(--foreground) / 0.06)" },
};

const Empty = ({ msg }: { msg: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <AlertTriangle className="w-6 h-6 mb-2 opacity-50" />
    <p className="text-xs">{msg}</p>
  </div>
);

const ChartTile = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <Card className="overflow-hidden border-2">
    <CardContent className="p-4 bg-background">
      <div className={TITLE_STYLE}>{title}</div>
      {subtitle && <div className={SUB_STYLE}>{subtitle}</div>}
      <div style={{ width: "100%", height: 320, minHeight: 320 }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={320}>
          {children as any}
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

// ─── Construção dos datasets de cada gráfico ───────────────────────────────
function buildSeries(data: MonthlyDatum[]) {
  return data.map(d => {
    const ind = computeIndicators(d);
    return {
      mes: d.mes,
      receita: d.hasReceita ? Math.round(d.receita_liquida / 1000) : null,
      cmv: d.hasReceita ? Math.round(d.cmv / 1000) : null,
      cmvDesp: d.hasReceita ? Math.round((Math.abs(d.cmv) + Math.abs(d.despesas)) / 1000) : null,
      resultado: d.hasReceita ? Math.round(d.resultado / 1000) : null,
      ebitda: d.hasReceita ? Math.round(d.ebitda) : null,
      cmvPct: d.hasReceita && ind.cmvPct !== null ? +(ind.cmvPct * 100).toFixed(2) : null,
      cmvDespPct: d.hasReceita && ind.cmvDespPct !== null ? +(ind.cmvDespPct * 100).toFixed(2) : null,
      margemPct: d.hasReceita && ind.margemResultado !== null ? +(ind.margemResultado * 100).toFixed(2) : null,
      liquidez_imediata: ind.liquidez_imediata !== null ? +ind.liquidez_imediata.toFixed(2) : null,
      liquidez_corrente: ind.liquidez_corrente !== null ? +ind.liquidez_corrente.toFixed(2) : null,
      liquidez_seca: ind.liquidez_seca !== null ? +ind.liquidez_seca.toFixed(2) : null,
      liquidez_geral: ind.liquidez_geral !== null ? +ind.liquidez_geral.toFixed(2) : null,
      divida_tributaria: Math.round(Number(d.divida_tributaria || 0)),
      divida_trabalhista: Math.round(Number(d.divida_trabalhista || 0)),
      divida_financeira: Math.round(Number(d.divida_financeira || 0)),
      fornecedores: Math.round(Number(d.fornecedores || 0)),
      credores_rj: Math.round(Number(d.credores_rj || 0)),
      outras_obrigacoes: Math.round(Number(d.outras_obrigacoes || 0)),
      divida_total: Math.round(d.divida_total),
    };
  });
}

const tooltipMilhar = (v: any) => fmtMilhar(typeof v === "number" ? v : Number(v));
const tooltipPct = (v: any) => fmtPct(typeof v === "number" ? v : Number(v));
const tooltipDec = (v: any) => fmtDec(typeof v === "number" ? v : Number(v));

const AuditCharts: React.FC<Props> = ({ parsedData, entries = [] }) => {
  const [windowSize, setWindowSize] = useState<Window>("ALL");

  const fullDataset = useMemo(() => {
    const bs = buildBSDados(parsedData ?? null, entries);
    if (bs.length) return bsDadosToMonthlyDataset(bs);
    return buildMonthlyDataset(parsedData ?? null);
  }, [parsedData, entries]);

  const dataset = useMemo(() => applyWindow(fullDataset, windowSize), [fullDataset, windowSize]);
  const series = useMemo(() => buildSeries(dataset), [dataset]);
  const insights = useMemo(() => generateInsights(dataset), [dataset]);

  if (!dataset.length) {
    return (
      <div className="space-y-4">
        <MonthsConsistencyAlert entries={entries} datasetMesKeys={[]} />
        <Card>
          <CardContent className="py-10">
            <Empty msg="Carregue um balancete na fase de processamento para gerar os gráficos." />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MonthsConsistencyAlert
        entries={entries}
        datasetMesKeys={fullDataset.map(d => d.mesKey).filter(Boolean) as string[]}
      />
      <SanityDiagnostico dataset={fullDataset} />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {fullDataset.length} mês(es) consolidado(s) — exibindo {dataset.length}
        </span>
        <WindowSelector value={windowSize} onChange={setWindowSize} available={fullDataset.length} />
      </div>

      {insights.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Info className="w-4 h-4 text-[hsl(217,91%,50%)]" />
              <span className="text-sm font-semibold">Auto-Interpretação IA</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {insights.map((i, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className={
                    i.tipo === "critico"
                      ? "bg-[hsl(0,75%,55%)]/10 border-[hsl(0,75%,55%)]/40 text-[hsl(0,75%,40%)]"
                      : i.tipo === "atencao"
                      ? "bg-[hsl(34,95%,55%)]/10 border-[hsl(34,95%,55%)]/40 text-[hsl(30,95%,40%)]"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {i.tipo === "critico" && <TrendingDown className="w-3 h-3 mr-1" />}
                  {i.texto}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {/* 1. CMV / RECEITA */}
        <ChartTile title="CMV / RECEITA LÍQUIDA" subtitle="(R$ x 1000)">
          <ComposedChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis yAxisId="left" {...AXIS_PROPS} tickFormatter={tooltipMilhar} />
            <YAxis yAxisId="right" orientation="right" {...AXIS_PROPS} domain={[-100, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [n.includes("%") ? tooltipPct(v) : tooltipMilhar(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="receita" name="Receita Líquida" fill={EXCEL_COLORS.azul} />
            <Bar yAxisId="left" dataKey="cmv" name="CMV" fill={EXCEL_COLORS.laranja} />
            <Line yAxisId="right" type="monotone" dataKey="cmvPct" name="CMV / Receita (%)" stroke={EXCEL_COLORS.vermelho} strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ChartTile>

        {/* 2. CMV + DESPESA × RECEITA */}
        <ChartTile title="CMV + DESPESA × RECEITA LÍQUIDA" subtitle="(R$ x 1000)">
          <ComposedChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis yAxisId="left" {...AXIS_PROPS} tickFormatter={tooltipMilhar} />
            <YAxis yAxisId="right" orientation="right" {...AXIS_PROPS} tickFormatter={(v) => `${v}%`} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [n.includes("%") ? tooltipPct(v) : tooltipMilhar(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="receita" name="Receita Líquida" fill={EXCEL_COLORS.azul} />
            <Bar yAxisId="left" dataKey="cmvDesp" name="CMV + Despesa" fill={EXCEL_COLORS.vermelho} />
            <Line yAxisId="right" type="monotone" dataKey="cmvDespPct" name="CMV+Desp / Receita (%)" stroke={EXCEL_COLORS.vermelho} strokeWidth={2} dot={{ r: 4 }} />
            <ReferenceLine yAxisId="right" y={100} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100% (limite)", fontSize: 10, fill: EXCEL_COLORS.vermelho }} />
          </ComposedChart>
        </ChartTile>

        {/* 3. RESULTADO / RECEITA */}
        <ChartTile title="RESULTADO / RECEITA LÍQUIDA" subtitle="(R$ x 1000)">
          <ComposedChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis yAxisId="left" {...AXIS_PROPS} tickFormatter={tooltipMilhar} />
            <YAxis yAxisId="right" orientation="right" {...AXIS_PROPS} tickFormatter={(v) => `${v}%`} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [n.includes("%") ? tooltipPct(v) : tooltipMilhar(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="receita" name="Receita Líquida" fill={EXCEL_COLORS.azul} />
            <Bar yAxisId="left" dataKey="resultado" name="Lucro/Prejuízo Líquido" fill={EXCEL_COLORS.laranja} />
            <Line yAxisId="right" type="monotone" dataKey="margemPct" name="Resultado / Receita (%)" stroke={EXCEL_COLORS.verde} strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ChartTile>

        {/* 4. EBITDA */}
        <ChartTile title="EBITDA">
          <LineChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} tickFormatter={tooltipMilhar} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tooltipMilhar(v), "EBITDA"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke={EXCEL_COLORS.cinza} />
            <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke={EXCEL_COLORS.ciano} strokeWidth={3} dot={{ r: 5, fill: EXCEL_COLORS.ciano }} />
          </LineChart>
        </ChartTile>

        {/* 5. LIQUIDEZ */}
        <ChartTile title="ÍNDICES DE LIQUIDEZ">
          <LineChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} tickFormatter={tooltipDec} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [tooltipDec(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="liquidez_imediata" name="LIQUIDEZ IMEDIATA" stroke={EXCEL_COLORS.azul} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="liquidez_corrente" name="LIQUIDEZ CORRENTE" stroke={EXCEL_COLORS.vermelho} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="liquidez_seca" name="LIQUIDEZ SECA" stroke={EXCEL_COLORS.verde} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="liquidez_geral" name="LIQUIDEZ GERAL" stroke={EXCEL_COLORS.roxo} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartTile>

        {/* 6. ENDIVIDAMENTO */}
        <ChartTile title="EVOLUÇÃO DO ENDIVIDAMENTO" subtitle="(Em milhares de reais)">
          <ComposedChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis yAxisId="left" {...AXIS_PROPS} tickFormatter={tooltipMilhar} />
            <YAxis yAxisId="right" orientation="right" {...AXIS_PROPS} tickFormatter={tooltipMilhar} stroke={EXCEL_COLORS.vermelho} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [tooltipMilhar(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="divida_tributaria" name="OBRIG. TRIBUTÁRIAS" stackId="div" fill={EXCEL_COLORS.azul} />
            <Bar yAxisId="left" dataKey="divida_trabalhista" name="OBRIG. TRABALHISTAS" stackId="div" fill={EXCEL_COLORS.laranja} />
            <Bar yAxisId="left" dataKey="divida_financeira" name="EMPR. E FINANCIAMENTOS" stackId="div" fill={EXCEL_COLORS.cinzaEscuro} />
            <Bar yAxisId="left" dataKey="fornecedores" name="FORNECEDORES" stackId="div" fill={EXCEL_COLORS.verde} />
            <Bar yAxisId="left" dataKey="credores_rj" name="CREDORES RJ" stackId="div" fill={EXCEL_COLORS.amarelo} />
            <Bar yAxisId="left" dataKey="outras_obrigacoes" name="OUTRAS OBRIGAÇÕES" stackId="div" fill={EXCEL_COLORS.vermelho} />
            <Line yAxisId="right" type="monotone" dataKey="divida_total" name="TOTAL" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, fill: EXCEL_COLORS.vermelho }} />
          </ComposedChart>
        </ChartTile>
      </div>
    </div>
  );
};

export default AuditCharts;
