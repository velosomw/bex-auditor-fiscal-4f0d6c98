/**
 * Gráficos de Auditoria — Reprodução fiel da aba "GRÁFICOS (2)" do template
 * BEX/Kanitz. 12 gráficos cobrindo Liquidez, Passivo, Empréstimos,
 * Imobilizado/Intangível, Endividamento Geral, Resultado×Receita e
 * Relação Custo/Despesa (anual e média mensal).
 *
 * Identidade visual:
 *   - Paleta semântica (EXCEL_COLORS) consistente com o restante do app
 *   - Tipografia foreground com pesos 500/600
 *   - Tooltip com borda + sombra suave
 *   - Bordas duplas nas cards e fundo background sólido
 */
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, LineChart,
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { buildMonthlyDataset, type MonthlyDatum } from "@/services/auditDatasetBuilder";
import { buildBSDados, type BalanceteEntry } from "@/services/bsDadosBuilder";
import { bsDadosToMonthlyDataset } from "@/services/bsDadosToMonthlyDatum";
import { EXCEL_COLORS, fmtMilhar, fmtDec } from "@/services/auditChartsOptions";
import type { ParsedFinancialData } from "@/services/auditAIService";

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

const Tile = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
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

const Empty = ({ msg }: { msg: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-muted/5 rounded-lg border border-dashed border-muted">
    <AlertTriangle className="w-6 h-6 mb-2 opacity-50" />
    <p className="text-sm font-medium mb-1">Não existem dados no Balancete para gerar o gráfico</p>
    <p className="text-[11px] opacity-70 text-center px-4">{msg}</p>
  </div>
);

const safeDiv = (n: number, d: number) => (d && Number.isFinite(n / d) ? n / d : 0);
const tMilhar = (v: any) => fmtMilhar(typeof v === "number" ? v : Number(v));
const tDec = (v: any) => fmtDec(typeof v === "number" ? v : Number(v));
const tPctRatio = (v: any) => `${(Number(v) * 100).toFixed(1)}%`;

// ─── Conversões para o formato das séries ─────────────────────────────────
function buildSeries(data: MonthlyDatum[]) {
  return data.map((d) => {
    const ac = Math.abs(d.ativo_circulante || 0);
    const anc = Math.abs(d.ativo_nao_circulante || 0);
    const pc = Math.abs(d.passivo_circulante || 0);
    const pnc = Math.abs(d.passivo_nao_circulante || 0);
    const pt = pc + pnc;
    const at = ac + anc;
    // PL: usa o declarado se houver; senão deriva pela identidade contábil
    const pl = (d.patrimonio_liquido ?? (at - pt)) || 0;
    const imob = Math.abs(d.imobilizado ?? 0);
    const intg = Math.abs(d.intangivel ?? 0);
    // Se template não trouxer imob/intg explícitos, usa ANC como aproximação
    const imobInt = imob + intg > 0 ? imob + intg : anc;
    const empr = Math.abs(d.divida_financeira || 0);
    const receita = Math.abs(d.receita_liquida || 0);
    const custoDesp = Math.abs(d.cmv || 0) + Math.abs(d.despesas || 0);
    const resultado = d.resultado || 0;

    return {
      mes: d.mes,
      // milhares para barras de valor
      pcK: Math.round(pc / 1000),
      pncK: Math.round(pnc / 1000),
      ptK: Math.round(pt / 1000),
      emprK: Math.round(empr / 1000),
      imobK: Math.round(imob / 1000),
      intgK: Math.round(intg / 1000),
      imobIntK: Math.round(imobInt / 1000),
      receitaK: Math.round(receita / 1000),
      custoDespK: Math.round(custoDesp / 1000),
      resultadoK: Math.round(resultado / 1000),
      // médias mensais (÷12) — referência do gráfico do Excel
      receitaMedK: Math.round(receita / 12 / 1000),
      custoDespMedK: Math.round(custoDesp / 12 / 1000),
      // índices (ratio)
      liqGeral: +safeDiv(ac + anc, pt).toFixed(2),
      liqCorrente: +safeDiv(ac, pc).toFixed(2),
      endivGeral: +safeDiv(pt, at).toFixed(4),
      imobIntSobrePLPnc: +safeDiv(imobInt, pl + pnc).toFixed(4),
      custoSobreReceita: +safeDiv(custoDesp, receita).toFixed(4),
      resultadoSobreReceita: +safeDiv(resultado, receita).toFixed(4),
    };
  });
}

const AuditChartsBex: React.FC<Props> = ({ parsedData, entries = [] }) => {
  const dataset = useMemo(() => {
    const bs = buildBSDados(parsedData ?? null, entries);
    if (bs.length) return bsDadosToMonthlyDataset(bs);
    return buildMonthlyDataset(parsedData ?? null);
  }, [parsedData, entries]);

  const series = useMemo(() => buildSeries(dataset), [dataset]);

  if (!series.length) {
    return (
      <Card>
        <CardContent className="py-10">
          <Empty msg="Carregue um balancete na fase de processamento para gerar a reprodução dos 12 gráficos do Padrão BEX." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
      {/* 1. LIQUIDEZ GERAL */}
      <Tile title="LIQUIDEZ GERAL" subtitle="(AC + ANC) / (PC + PNC)">
        <LineChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tDec} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tDec(v), "Liquidez Geral"]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.cinza} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="liqGeral" name="LIQUIDEZ GERAL" stroke={EXCEL_COLORS.azul} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </LineChart>
      </Tile>

      {/* 2. LIQUIDEZ CORRENTE E GERAL */}
      <Tile title="LIQUIDEZ CORRENTE E GERAL">
        <LineChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tDec} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [tDec(v), n]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.cinza} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="liqGeral" name="LIQUIDEZ GERAL" stroke={EXCEL_COLORS.azul} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
          <Line type="monotone" dataKey="liqCorrente" name="LIQUIDEZ CORRENTE" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </LineChart>
      </Tile>

      {/* 3. EVOLUÇÃO DO PASSIVO (PC + PNC empilhado) */}
      <Tile title="EVOLUÇÃO DO PASSIVO" subtitle="(R$ x 1000)">
        <BarChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [tMilhar(v), n]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <Bar dataKey="pcK" name="PASSIVO CIRCULANTE" stackId="p" fill={EXCEL_COLORS.azul} />
          <Bar dataKey="pncK" name="PASSIVO NÃO CIRCULANTE" stackId="p" fill={EXCEL_COLORS.laranja} />
        </BarChart>
      </Tile>

      {/* 4. EVOLUÇÃO DE EMPRÉSTIMOS E FINANCIAMENTOS */}
      <Tile title="EVOLUÇÃO DE EMPRÉSTIMOS E FINANCIAMENTOS" subtitle="(R$ x 1000)">
        <LineChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tMilhar(v), "Empréstimos e Financiamentos"]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <Line type="monotone" dataKey="emprK" name="EMPRÉSTIMOS E FINANCIAMENTOS" stroke={EXCEL_COLORS.cinzaEscuro} strokeWidth={3} dot={{ r: 5, fill: EXCEL_COLORS.cinzaEscuro }} />
        </LineChart>
      </Tile>

      {/* 5. IMOBILIZADO E INTANGÍVEL / (PL + PNC) */}
      <Tile title="IMOBILIZADO E INTANGÍVEL / (PL + PNC)" subtitle="Imobilização dos recursos não correntes">
        <BarChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tPctRatio} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tPctRatio(v), "Imob+Intang / (PL+PNC)"]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100%", fontSize: 10, fill: EXCEL_COLORS.vermelho }} />
          <Bar dataKey="imobIntSobrePLPnc" name="IMOB + INTANG / (PL + PNC)" fill={EXCEL_COLORS.roxo} />
        </BarChart>
      </Tile>

      {/* 6. IMOBILIZADO E INTANGÍVEL (absoluto) */}
      <Tile title="IMOBILIZADO E INTANGÍVEL" subtitle="(R$ x 1000)">
        <BarChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [tMilhar(v), n]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <Bar dataKey="imobIntK" name="IMOBILIZADO + INTANGÍVEL" fill={EXCEL_COLORS.ciano} />
        </BarChart>
      </Tile>

      {/* 7. ENDIVIDAMENTO GERAL */}
      <Tile title="ENDIVIDAMENTO GERAL" subtitle="(PC + PNC) / Ativo Total">
        <LineChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tPctRatio} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tPctRatio(v), "Endividamento Geral"]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100%", fontSize: 10, fill: EXCEL_COLORS.vermelho }} />
          <Line type="monotone" dataKey="endivGeral" name="ENDIVIDAMENTO GERAL" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </LineChart>
      </Tile>

      {/* 8. RESULTADO / RECEITA LÍQUIDA */}
      <Tile title="RESULTADO / RECEITA LÍQUIDA">
        <LineChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tPctRatio} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tPctRatio(v), "Resultado/Receita"]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <ReferenceLine y={0} stroke={EXCEL_COLORS.cinza} />
          <Line type="monotone" dataKey="resultadoSobreReceita" name="RESULTADO / RECEITA LÍQUIDA" stroke={EXCEL_COLORS.verde} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </LineChart>
      </Tile>

      {/* 9. CUSTO E DESPESA / RECEITA LÍQUIDA (%) */}
      <Tile title="CUSTO E DESPESA / RECEITA LÍQUIDA (%)">
        <BarChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tPctRatio} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tPctRatio(v), "Custo+Desp / Receita"]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100%", fontSize: 10, fill: EXCEL_COLORS.vermelho }} />
          <Bar dataKey="custoSobreReceita" name="(CUSTO + DESPESA) / RECEITA LÍQUIDA" fill={EXCEL_COLORS.laranja} />
        </BarChart>
      </Tile>

      {/* 10. RELAÇÃO CUSTO/DESPESA × RECEITA (Anual / total do período) */}
      <Tile title="RELAÇÃO CUSTO/DESPESA × RECEITA LÍQUIDA" subtitle="(Acumulado por período — R$ x 1000)">
        <BarChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [tMilhar(v), n]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <Bar dataKey="receitaK" name="RECEITA LÍQUIDA" fill={EXCEL_COLORS.azul} />
          <Bar dataKey="custoDespK" name="CUSTO + DESPESA" fill={EXCEL_COLORS.vermelho} />
        </BarChart>
      </Tile>

      {/* 11. RELAÇÃO CUSTO/DESPESA × RECEITA (Média mensal) */}
      <Tile title="RELAÇÃO CUSTO/DESPESA × RECEITA LÍQUIDA (Média Mensal)" subtitle="(Em milhares de reais)">
        <BarChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={tMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [tMilhar(v), n]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <Bar dataKey="receitaMedK" name="RECEITA LÍQUIDA (Média Mensal)" fill={EXCEL_COLORS.azul} />
          <Bar dataKey="custoDespMedK" name="CUSTO + DESPESA (Média Mensal)" fill={EXCEL_COLORS.vermelho} />
        </BarChart>
      </Tile>

      {/* 12. RESULTADO × RECEITA (barras de valor — complementar ao gráfico 8) */}
      <Tile title="RESULTADO × RECEITA LÍQUIDA" subtitle="(R$ x 1000)">
        <ComposedChart data={series} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis yAxisId="left" {...AXIS_PROPS} tickFormatter={tMilhar} />
          <YAxis yAxisId="right" orientation="right" {...AXIS_PROPS} tickFormatter={tPctRatio} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: string) => [n.includes("%") ? tPctRatio(v) : tMilhar(v), n]} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <ReferenceLine yAxisId="left" y={0} stroke={EXCEL_COLORS.cinza} />
          <Bar yAxisId="left" dataKey="receitaK" name="RECEITA LÍQUIDA" fill={EXCEL_COLORS.azul} />
          <Bar yAxisId="left" dataKey="resultadoK" name="RESULTADO" fill={EXCEL_COLORS.verde} />
          <Line yAxisId="right" type="monotone" dataKey="resultadoSobreReceita" name="RESULTADO/RECEITA (%)" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </ComposedChart>
      </Tile>
    </div>
  );
};

export default AuditChartsBex;
