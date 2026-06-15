/**
 * GRÁFICOS PARECER CONTÁBIL — Replicação 1:1 da aba "GRÁFICOS (2)" do template
 * Kanitz/Giannini. Os 12 gráficos consomem o SSOT (buildBSDados) garantindo
 * exatamente os mesmos números do Parecer Contábil (linhas O..V do template).
 *
 * Fórmulas (espelham as linhas da aba PARECER CONTÁBIL):
 *  - Liquidez Geral   = (AC + RLP) / (PC + PNC)        ← linha 38
 *  - Liquidez Corrente= AC / PC                         ← linha 39
 *  - Endividamento G. = (PC + PNC) / Ativo Total        ← linha 40
 *  - Cap. Terceiros   = (PC + PNC) / PL                 ← linha 41
 *  - Resultado/Receita= Resultado / Receita Líquida     ← linha 42
 *  - Emp.Financ/Pass. = Empréstimos / (PC + PNC)        ← linha 43
 *  - Imobilização CP  = (Imob+Intang) / PL              ← linha 51
 *  - Imobilização RNP = (Imob+Intang) / (PL + PNC)      ← linha 52
 *
 * Renderização Recharts (segue padrão do projeto, sem Chart.js/ECharts).
 */
import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, LineChart, ComposedChart,
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell, LabelList,
} from "recharts";

// Labels sempre visíveis (renderizados diretamente sobre o gráfico) — atende
// o requisito de manter os números à mostra mesmo sem hover.
const LABEL_DEC = { position: "top" as const, fontSize: 10, fill: "hsl(var(--foreground))", fontWeight: 600, formatter: (v: any) => (Number.isFinite(+v) ? (+v).toFixed(2) : "") };
const LABEL_PCT = { position: "top" as const, fontSize: 10, fill: "hsl(var(--foreground))", fontWeight: 600, formatter: (v: any) => (Number.isFinite(+v) ? `${(+v * 100).toFixed(1)}%` : "") };
const LABEL_MIL = { position: "top" as const, fontSize: 10, fill: "hsl(var(--foreground))", fontWeight: 600, formatter: (v: any) => {
  const n = Number(v); if (!Number.isFinite(n)) return "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n/1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n/1e3).toFixed(0)}k`;
  return n.toFixed(0);
}};
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, FileSpreadsheet, Info } from "lucide-react";
import { buildBSDados, type BalanceteEntry, type BSDadosRow } from "@/services/bsDadosBuilder";
import type { ParsedFinancialData } from "@/services/auditAIService";

interface Props {
  parsedData?: ParsedFinancialData | null;
  entries?: BalanceteEntry[];
}

const COLORS = {
  azul: "hsl(217, 91%, 50%)",
  azulEsc: "hsl(217, 91%, 35%)",
  laranja: "hsl(34, 95%, 55%)",
  verde: "hsl(150, 70%, 42%)",
  vermelho: "hsl(0, 75%, 55%)",
  roxo: "hsl(258, 90%, 66%)",
  ciano: "hsl(189, 85%, 45%)",
  amarelo: "hsl(45, 95%, 50%)",
  rosa: "hsl(340, 82%, 55%)",
  cinza: "hsl(220, 9%, 46%)",
  cinzaEsc: "hsl(220, 13%, 28%)",
};

const fmtMil = (v: any) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
};
const fmtBRL = (v: any) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
};
const fmtPct = (v: any) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
};
const fmtDec = (v: any) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
};

const AXIS = { tick: { fontSize: 12, fill: "hsl(var(--foreground))", fontWeight: 500 }, stroke: "hsl(var(--foreground) / 0.35)", tickLine: { stroke: "hsl(var(--foreground) / 0.35)" } };
const GRID = <CartesianGrid stroke="hsl(var(--foreground) / 0.18)" strokeDasharray="3 3" vertical={false} />;
const TIP = { contentStyle: { background: "hsl(var(--background))", border: "1px solid hsl(var(--foreground) / 0.25)", fontSize: 12, color: "hsl(var(--foreground))", borderRadius: 6, boxShadow: "0 4px 12px hsl(var(--foreground) / 0.15)" }, labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 }, itemStyle: { color: "hsl(var(--foreground))" }, cursor: { fill: "hsl(var(--foreground) / 0.06)" } };

const Tile: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; height?: number }> = ({ title, subtitle, children, height = 320 }) => (
  <Card className="overflow-hidden border-2">
    <CardHeader className="pb-2 bg-muted/30 border-b">
      <CardTitle className="text-[13px] font-bold text-center uppercase tracking-wide">{title}</CardTitle>
      {subtitle && <CardDescription className="text-center text-[11px] font-medium">{subtitle}</CardDescription>}
    </CardHeader>
    <CardContent className="pt-4 pb-3 px-3 bg-background">
      <div style={{ width: "100%", height, minHeight: height }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={height}>
          {children as any}
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

/** Cálculos por mês — espelham as linhas do PARECER CONTÁBIL. */
function buildSeries(rows: BSDadosRow[]) {
  return rows.map(r => {
    const at = (r.ativo_circulante || 0) + (r.ativo_nao_circulante || 0);
    const pcpnc = (r.passivo_circulante || 0) + (r.passivo_nao_circulante || 0);
    const liqGeral = pcpnc > 0 ? ((r.ativo_circulante || 0) + (r.realizavel_longo_prazo || 0)) / pcpnc : null;
    const liqCorr = (r.passivo_circulante || 0) > 0 ? (r.ativo_circulante || 0) / (r.passivo_circulante || 0) : null;
    const endivG = at > 0 ? pcpnc / at : null;
    const empPass = pcpnc > 0 ? (r.divida_financeira || 0) / pcpnc : null;
    const custoDesp = Math.abs(r.cmv || 0) + Math.abs(r.despesas || 0);
    const cdReceitaPct = (r.receita_liquida || 0) !== 0 ? custoDesp / r.receita_liquida : null;
    const resReceita = (r.receita_liquida || 0) !== 0 ? (r.resultado || 0) / r.receita_liquida : null;
    const imobIntang = r.imobilizado || 0;
    const pl = r.patrimonio_liquido || 0;
    const imobRnp = (pl + (r.passivo_nao_circulante || 0)) !== 0
      ? imobIntang / (pl + (r.passivo_nao_circulante || 0))
      : null;

    return {
      mes: r.mes,
      // brutos
      AC: r.ativo_circulante || 0,
      ANC: r.ativo_nao_circulante || 0,
      RLP: r.realizavel_longo_prazo || 0,
      PC: r.passivo_circulante || 0,
      PNC: r.passivo_nao_circulante || 0,
      PL: pl,
      imob: imobIntang,
      receita: r.receita_liquida || 0,
      custoDesp,
      resultado: r.resultado || 0,
      // dívida (stack)
      trib: r.divida_tributaria || 0,
      trab: r.divida_trabalhista || 0,
      emp: r.divida_financeira || 0,
      forn: r.fornecedores || 0,
      credRJ: r.credores_rj || 0,
      outras: r.outras_obrigacoes || 0,
      total: r.divida_total || 0,
      // índices
      liqGeral, liqCorr, endivG, empPass, cdReceitaPct, resReceita, imobRnp,
    };
  });
}

const TabGraficosParecer: React.FC<Props> = ({ parsedData, entries = [] }) => {
  const rows = useMemo(() => buildBSDados(parsedData ?? null, entries), [parsedData, entries]);
  const series = useMemo(() => buildSeries(rows), [rows]);

  // Médias anuais (replicam as células "Média Mensal" do Parecer Contábil)
  const mediaReceita = useMemo(() => {
    if (!series.length) return 0;
    return series.reduce((s, r) => s + r.receita, 0) / series.length;
  }, [series]);
  const mediaCusto = useMemo(() => {
    if (!series.length) return 0;
    return series.reduce((s, r) => s + r.custoDesp, 0) / series.length;
  }, [series]);
  const totalReceita = useMemo(() => series.reduce((s, r) => s + r.receita, 0), [series]);
  const totalCusto = useMemo(() => series.reduce((s, r) => s + r.custoDesp, 0), [series]);

  if (!rows.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Gráficos — Parecer Contábil
          </CardTitle>
          <CardDescription>
            Reprodução fiel da aba <strong>GRÁFICOS (2)</strong> do template Kanitz/Giannini, alimentada
            pela mesma fonte de verdade (BS &amp; Dados) usada nos demais módulos da auditoria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-10 flex flex-col items-center text-muted-foreground">
            <FileSpreadsheet className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">Nenhum balancete consolidado disponível.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-[hsl(217,91%,50%)]/20 bg-[hsl(217,91%,50%)]/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[hsl(217,91%,50%)]" />
            Gráficos — Parecer Contábil
          </CardTitle>
          <CardDescription className="text-xs flex items-center gap-2">
            <Info className="w-3 h-3" />
            Espelha 1:1 a aba <em>GRÁFICOS (2)</em> do template Kanitz/Giannini.
            Fórmulas idênticas às linhas O..V do Parecer Contábil; valores derivados da consolidação BS &amp; Dados.
            <Badge variant="outline" className="text-[10px]">{series.length} mês(es)</Badge>
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {/* 1. LIQUIDEZ GERAL */}
        <Tile title="LIQUIDEZ GERAL" subtitle="(AC + RLP) / (PC + PNC)">
          <LineChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtDec} />
            <Tooltip {...TIP} formatter={(v: any) => [fmtDec(v), "Liquidez Geral"]} />
            <Line type="monotone" dataKey="liqGeral" name="Liquidez Geral" stroke={COLORS.azul} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }}>
              <LabelList dataKey="liqGeral" {...LABEL_DEC} />
            </Line>
          </LineChart>
        </Tile>

        {/* 2. EVOLUÇÃO DO ENDIVIDAMENTO (stacked) */}
        <Tile title="EVOLUÇÃO DO ENDIVIDAMENTO" subtitle="(Em reais)">
          <ComposedChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis yAxisId="l" {...AXIS} tickFormatter={fmtMil} />
            <YAxis yAxisId="r" orientation="right" {...AXIS} tickFormatter={fmtMil} stroke={COLORS.vermelho} />
            <Tooltip {...TIP} formatter={(v: any, n: string) => [fmtBRL(v), n]} />
            <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
            <Bar yAxisId="l" dataKey="trib" name="Obrig. Tributárias" stackId="d" fill={COLORS.azul} />
            <Bar yAxisId="l" dataKey="trab" name="Obrig. Trabalhistas" stackId="d" fill={COLORS.laranja} />
            <Bar yAxisId="l" dataKey="emp" name="Empr. e Financ." stackId="d" fill={COLORS.cinzaEsc} />
            <Bar yAxisId="l" dataKey="forn" name="Fornecedores" stackId="d" fill={COLORS.verde} />
            <Bar yAxisId="l" dataKey="credRJ" name="Credores RJ" stackId="d" fill={COLORS.amarelo} />
            <Bar yAxisId="l" dataKey="outras" name="Outras Obrigações" stackId="d" fill={COLORS.rosa} />
            <Line yAxisId="r" type="monotone" dataKey="total" name="TOTAL" stroke={COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }}>
              <LabelList dataKey="total" {...LABEL_MIL} />
            </Line>
          </ComposedChart>
        </Tile>

        {/* 3. EVOLUÇÃO DO PASSIVO */}
        <Tile title="EVOLUÇÃO DO PASSIVO" subtitle="PC × PNC">
          <BarChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtMil} />
            <Tooltip {...TIP} formatter={(v: any, n: string) => [fmtBRL(v), n]} />
            <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
            <Bar dataKey="PC" name="Passivo Circulante" fill={COLORS.azul}>
              <LabelList dataKey="PC" {...LABEL_MIL} />
            </Bar>
            <Bar dataKey="PNC" name="Passivo Não Circulante" fill={COLORS.laranja}>
              <LabelList dataKey="PNC" {...LABEL_MIL} />
            </Bar>
          </BarChart>
        </Tile>

        {/* 4. EMPRÉSTIMOS E FINANCIAMENTOS */}
        <Tile title="EVOLUÇÃO DE EMPRÉSTIMOS E FINANCIAMENTOS" subtitle="Empr. / (PC + PNC)">
          <LineChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
            <Tooltip {...TIP} formatter={(v: any) => [fmtPct(v), "Emp. / Passivo Total"]} />
            <Line type="monotone" dataKey="empPass" name="Empr. / Passivo Total" stroke={COLORS.verde} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }}>
              <LabelList dataKey="empPass" {...LABEL_PCT} />
            </Line>
          </LineChart>
        </Tile>

        {/* 5. ENDIVIDAMENTO GERAL */}
        <Tile title="ENDIVIDAMENTO GERAL" subtitle="(PC + PNC) / Ativo Total">
          <LineChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
            <Tooltip {...TIP} formatter={(v: any) => [fmtPct(v), "Endividamento Geral"]} />
            <ReferenceLine y={1} stroke={COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100%", fontSize: 10, fill: COLORS.vermelho }} />
            <Line type="monotone" dataKey="endivG" name="Endividamento Geral" stroke={COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }}>
              <LabelList dataKey="endivG" {...LABEL_PCT} />
            </Line>
          </LineChart>
        </Tile>

        {/* 6. CUSTO E DESPESA / RECEITA LÍQUIDA (%) */}
        <Tile title="CUSTO E DESPESA / RECEITA LÍQUIDA" subtitle="(%)">
          <BarChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
            <Tooltip {...TIP} formatter={(v: any) => [fmtPct(v), "Custo+Desp / Receita"]} />
            <ReferenceLine y={1} stroke={COLORS.vermelho} strokeDasharray="4 4" />
            <Bar dataKey="cdReceitaPct" name="Custo+Desp / Receita">
              {series.map((s, i) => (
                <Cell key={i} fill={(s.cdReceitaPct ?? 0) > 1 ? COLORS.vermelho : COLORS.azul} />
              ))}
              <LabelList dataKey="cdReceitaPct" {...LABEL_PCT} />
            </Bar>
          </BarChart>
        </Tile>

        {/* 7. RESULTADO / RECEITA LÍQUIDA */}
        <Tile title="RESULTADO / RECEITA LÍQUIDA">
          <LineChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
            <Tooltip {...TIP} formatter={(v: any) => [fmtPct(v), "Resultado / Receita"]} />
            <ReferenceLine y={0} stroke={COLORS.cinza} />
            <Line type="monotone" dataKey="resReceita" name="Resultado / Receita" stroke={COLORS.verde} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }}>
              <LabelList dataKey="resReceita" {...LABEL_PCT} />
            </Line>
          </LineChart>
        </Tile>

        {/* 8. RELAÇÃO CUSTO/DESPESA × RECEITA (Anual) */}
        <Tile title="RELAÇÃO CUSTO/DESPESA × RECEITA LÍQUIDA" subtitle="Anual (soma do período)">
          <BarChart
            data={[
              { cat: "Receita Líquida", v: totalReceita, fill: COLORS.azul },
              { cat: "Custo + Despesa", v: totalCusto, fill: COLORS.vermelho },
            ]}
            margin={{ top: 10, right: 20, bottom: 20, left: 10 }}
          >
            {GRID}
            <XAxis dataKey="cat" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtMil} />
            <Tooltip {...TIP} formatter={(v: any) => [fmtBRL(v), "Total"]} />
            <Bar dataKey="v">
              {[totalReceita, totalCusto].map((_, i) => (
                <Cell key={i} fill={i === 0 ? COLORS.azul : COLORS.vermelho} />
              ))}
              <LabelList dataKey="v" {...LABEL_MIL} />
            </Bar>
          </BarChart>
        </Tile>

        {/* 9. RELAÇÃO CUSTO × RECEITA (Média Mensal) */}
        <Tile title="CUSTO/DESPESA × RECEITA LÍQUIDA" subtitle="Média mensal (em reais)">
          <BarChart
            data={[
              { cat: "Receita Líquida (Média)", v: mediaReceita },
              { cat: "Custo + Despesa (Média)", v: mediaCusto },
            ]}
            margin={{ top: 10, right: 20, bottom: 20, left: 10 }}
          >
            {GRID}
            <XAxis dataKey="cat" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtMil} />
            <Tooltip {...TIP} formatter={(v: any) => [fmtBRL(v), "Média"]} />
            <Bar dataKey="v">
              <Cell fill={COLORS.azul} />
              <Cell fill={COLORS.vermelho} />
              <LabelList dataKey="v" {...LABEL_MIL} />
            </Bar>
          </BarChart>
        </Tile>

        {/* 10. LIQUIDEZ CORRENTE E GERAL */}
        <Tile title="LIQUIDEZ CORRENTE E GERAL">
          <LineChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtDec} />
            <Tooltip {...TIP} formatter={(v: any, n: string) => [fmtDec(v), n]} />
            <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
            <ReferenceLine y={1} stroke={COLORS.cinza} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="liqCorr" name="Liquidez Corrente (AC/PC)" stroke={COLORS.azul} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }}>
              <LabelList dataKey="liqCorr" {...LABEL_DEC} />
            </Line>
            <Line type="monotone" dataKey="liqGeral" name="Liquidez Geral" stroke={COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }}>
              <LabelList dataKey="liqGeral" {...LABEL_DEC} />
            </Line>
          </LineChart>
        </Tile>

        {/* 11. IMOBILIZADO + INTANGÍVEL / PL + PNC */}
        <Tile title="IMOBILIZADO E INTANGÍVEL / (PL + PNC)" subtitle="Imobilização dos Recursos Não Permanentes">
          <BarChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
            <Tooltip {...TIP} formatter={(v: any) => [fmtPct(v), "Imob. / (PL+PNC)"]} />
            <Bar dataKey="imobRnp" name="Imob. / (PL + PNC)" fill={COLORS.roxo}>
              <LabelList dataKey="imobRnp" {...LABEL_PCT} />
            </Bar>
          </BarChart>
        </Tile>

        {/* 12. IMOBILIZADO E INTANGÍVEL */}
        <Tile title="IMOBILIZADO E INTANGÍVEL" subtitle="(Em reais)">
          <BarChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={fmtMil} />
            <Tooltip {...TIP} formatter={(v: any) => [fmtBRL(v), "Imob. + Intang."]} />
            <Bar dataKey="imob" name="Imobilizado + Intangível" fill={COLORS.ciano} />
          </BarChart>
        </Tile>
      </div>
    </div>
  );
};

export default TabGraficosParecer;
