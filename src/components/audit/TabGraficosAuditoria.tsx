import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, ComposedChart, PieChart, Pie, Cell,
  RadialBarChart, RadialBar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, FileSpreadsheet, Loader2, Users, Wallet, TrendingUp, AlertTriangle, CheckCircle2, Activity, DollarSign, Gauge } from "lucide-react";
import {
  resolveBalanceteCharts,
  type BalanceteChartsResult,
} from "@/services/balanceteChartsParser";
import type { ParsedFinancialData } from "@/services/auditAIService";

interface Props {
  files?: File[];
  /** Dados estruturados extraídos pela IA — usados como fallback quando o
   *  arquivo carregado não é o template .xlsm com as abas de gráficos. */
  parsedData?: ParsedFinancialData | null;
}

// Paleta semântica (HSL) — usamos cores fixas para distinção das séries.
const SERIES_COLORS = [
  "hsl(217, 91%, 50%)", // azul vibrante
  "hsl(150, 70%, 42%)", // verde
  "hsl(34, 95%, 55%)",  // âmbar
  "hsl(340, 82%, 55%)", // rosa
  "hsl(258, 90%, 66%)", // roxo
  "hsl(189, 85%, 45%)", // ciano
  "hsl(0, 75%, 55%)",   // vermelho
  "hsl(45, 95%, 50%)",  // amarelo
  "hsl(280, 60%, 55%)",
  "hsl(170, 70%, 40%)",
];

const fmtMoeda = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
};
const fmtCompact = (v: number | undefined) => {
  if (v === undefined || v === null || !Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v/1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v/1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v/1e3).toFixed(0)}k`;
  return v.toString();
};

const EmptyState = ({ icon: Icon, title }: { icon: any; title: string }) => (
  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
    <Icon className="w-8 h-8 mb-2 opacity-40" />
    <p className="text-sm">{title}</p>
  </div>
);

const TabGraficosAuditoria = ({ files, parsedData }: Props) => {
  const [data, setData] = useState<BalanceteChartsResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hasFiles = !!files?.length;
    const hasParsed = !!parsedData?.balanco?.length;
    if (!hasFiles && !hasParsed) { setData(null); return; }
    setLoading(true);
    resolveBalanceteCharts(files, parsedData ?? null)
      .then(r => { if (!cancelled) setData(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [files, parsedData]);

  // ── Bloco 1: Balanço (linha multi-série) ──────────────────────────────────
  const balancoRows = useMemo(() => {
    if (!data?.balanco) return [];
    return data.balanco.meses.map((m, i) => {
      const obj: Record<string, any> = { mes: m };
      data.balanco!.series.forEach(s => { obj[s.nome] = s.valores[i]; });
      return obj;
    });
  }, [data]);

  // ── Bloco 2: Folha ────────────────────────────────────────────────────────
  const folhaRows = useMemo(() => {
    if (!data?.folha) return [];
    return data.folha.meses.map((m, i) => ({
      mes: m,
      "Nº Funcionários": data.folha!.funcionarios[i],
      "Folha de Pagamento": data.folha!.folhaPagamento[i],
      "Contratados PJ": data.folha!.contratadosPJ[i],
    }));
  }, [data]);

  // ── Bloco 3: FCP ──────────────────────────────────────────────────────────
  const fcpRows = useMemo(() => {
    if (!data?.fcp) return [];
    return data.fcp.meses.map((m, i) => ({
      mes: m,
      "Saldo Acumulado": data.fcp!.saldoAcumulado[i],
      "Fluxo Mensal": data.fcp!.fluxoMensal[i],
    }));
  }, [data]);

  // ── Bloco 4: Prev x Realiz ────────────────────────────────────────────────
  const prevRealRows = useMemo(() => {
    if (!data?.prevReal) return { entradas: [], saidas: [] };
    const build = (cats: typeof data.prevReal.entradas) =>
      data.prevReal!.meses.map((m, i) => {
        const obj: Record<string, any> = { mes: m };
        cats.forEach(cat => {
          obj[`${cat.tipo} • Previsto`] = cat.previsto[i];
          obj[`${cat.tipo} • Realizado`] = cat.realizado[i];
        });
        return obj;
      });
    return { entradas: build(data.prevReal.entradas), saidas: build(data.prevReal.saidas) };
  }, [data]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Extraindo gráficos do balancete…</span>
        </CardContent>
      </Card>
    );
  }

  if ((!files?.length && !parsedData?.balanco?.length) || !data?.hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Gráficos de Auditoria
          </CardTitle>
          <CardDescription>
            Os gráficos são extraídos automaticamente do <strong>balancete carregado</strong> na fase de
            processamento. Para gráficos completos (Folha, FCP, Previsto×Realizado), envie o template{" "}
            <code className="text-[10px]">.xlsm</code> com as abas <em>Dados para Graficos</em>,{" "}
            <em>Folha</em>, <em>FCP - 6 meses</em> e <em>Fluxo de Caixa - Prev x Realiz</em>. Para
            balancetes contábeis (PDF/CSV/XLSX), o bloco <em>Balanço — Evolução Mensal</em> é gerado a
            partir da análise IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={FileSpreadsheet}
            title={
              parsedData?.balanco?.length
                ? "Não foi possível derivar séries do balancete analisado."
                : "Nenhum balancete processado ainda."
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <Card className="border-[hsl(217,91%,50%)]/20 bg-[hsl(217,91%,50%)]/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[hsl(217,91%,50%)]" />
                Gráficos de Auditoria — Balancete
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Reprodução fiel das abas <em>Dados para Graficos</em>, <em>Folha</em>, <em>FCP - 6 meses</em> e{" "}
                <em>Fluxo de Caixa - Prev x Realiz</em>. Ordem, séries e granularidade preservadas.
              </CardDescription>
            </div>
            {data.fileName && (
              <span className="text-xs text-muted-foreground font-mono px-2 py-1 rounded bg-background border">
                📎 {data.fileName}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* BLOCO 1 — Balanço */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            Balanço — Evolução Mensal
          </CardTitle>
          <CardDescription>Aba <strong>Dados para Graficos</strong> · linhas por categoria contábil</CardDescription>
        </CardHeader>
        <CardContent>
          {balancoRows.length && data.balanco?.series.length ? (
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={balancoRows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtCompact} />
                <Tooltip
                  formatter={(v: number) => fmtMoeda(v)}
                  contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {data.balanco.series.map((s, i) => (
                  <Line
                    key={s.nome}
                    type="monotone"
                    dataKey={s.nome}
                    stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={BarChart3} title="Sem dados na aba 'Dados para Graficos'." />}
        </CardContent>
      </Card>

      {/* BLOCO 2 — Folha */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-[hsl(150,70%,42%)]" />
            Evolução da Folha
          </CardTitle>
          <CardDescription>Aba <strong>Folha</strong> · número de funcionários e folha de pagamento</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
          {folhaRows.length ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">Nº de Funcionários (CLT)</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={folhaRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Bar dataKey="Nº Funcionários" fill="hsl(150, 70%, 42%)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">Folha de Pagamento vs Contratados PJ</p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={folhaRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtCompact} />
                    <Tooltip
                      formatter={(v: number, name: string) => name === "Contratados PJ" ? v : fmtMoeda(v)}
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Folha de Pagamento" stroke="hsl(217, 91%, 50%)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    <Line type="monotone" dataKey="Contratados PJ" stroke="hsl(34, 95%, 55%)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : <EmptyState icon={Users} title="Sem dados na aba 'Folha'." />}
        </CardContent>
      </Card>

      {/* BLOCO 3 — FCP */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[hsl(258,90%,66%)]" />
            Fluxo de Caixa Projetado (FCP) — 6 meses
          </CardTitle>
          <CardDescription>Aba <strong>FCP - 6 meses</strong> · saldo acumulado (linha) + fluxo mensal (coluna)</CardDescription>
        </CardHeader>
        <CardContent>
          {fcpRows.length ? (
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={fcpRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtCompact} />
                <Tooltip
                  formatter={(v: number) => fmtMoeda(v)}
                  contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Fluxo Mensal" fill="hsl(217, 91%, 50%)" radius={[4,4,0,0]} />
                <Line type="monotone" dataKey="Saldo Acumulado" stroke="hsl(34, 95%, 55%)" strokeWidth={2.5} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={Wallet} title="Sem dados na aba 'FCP - 6 meses'." />}
        </CardContent>
      </Card>

      {/* BLOCO 4 — Prev x Realiz */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[hsl(340,82%,55%)]" />
            Fluxo de Caixa — Previsto vs Realizado
          </CardTitle>
          <CardDescription>
            Aba <strong>Fluxo de Caixa - Prev x Realiz</strong> · barras agrupadas por categoria (Operacional / Não Operacional)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {prevRealRows.entradas.length ? (
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">↗ ENTRADAS</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={prevRealRows.entradas}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtCompact} />
                  <Tooltip
                    formatter={(v: number) => fmtMoeda(v)}
                    contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {data.prevReal!.entradas.map((cat, i) => [
                    <Bar key={`${cat.tipo}-p`} dataKey={`${cat.tipo} • Previsto`} fill={SERIES_COLORS[i*2 % SERIES_COLORS.length]} radius={[3,3,0,0]} />,
                    <Bar key={`${cat.tipo}-r`} dataKey={`${cat.tipo} • Realizado`} fill={SERIES_COLORS[(i*2+1) % SERIES_COLORS.length]} radius={[3,3,0,0]} />,
                  ])}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {prevRealRows.saidas.length ? (
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">↘ SAÍDAS</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={prevRealRows.saidas}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtCompact} />
                  <Tooltip
                    formatter={(v: number) => fmtMoeda(v)}
                    contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {data.prevReal!.saidas.map((cat, i) => [
                    <Bar key={`${cat.tipo}-p`} dataKey={`${cat.tipo} • Previsto`} fill={SERIES_COLORS[(i*2+4) % SERIES_COLORS.length]} radius={[3,3,0,0]} />,
                    <Bar key={`${cat.tipo}-r`} dataKey={`${cat.tipo} • Realizado`} fill={SERIES_COLORS[(i*2+5) % SERIES_COLORS.length]} radius={[3,3,0,0]} />,
                  ])}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {!prevRealRows.entradas.length && !prevRealRows.saidas.length && (
            <EmptyState icon={BarChart3} title="Sem dados na aba 'Fluxo de Caixa - Prev x Realiz'." />
          )}
        </CardContent>
      </Card>

      {/* Nota de fidelidade */}
      <p className="text-[10px] text-muted-foreground text-center italic px-4">
        🔒 Fidelidade ao Excel: ordem, labels, granularidade e separação de séries preservados conforme planilha de origem.
        Valores nulos / #N/A são exibidos como pontos ausentes (não interpolados).
      </p>
    </div>
  );
};

export default TabGraficosAuditoria;
