import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, ComposedChart, PieChart, Pie, Cell,
  RadialBarChart, RadialBar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, FileSpreadsheet, Loader2, Users, Wallet, TrendingUp, AlertTriangle, CheckCircle2, Activity, DollarSign, Gauge, Eye, EyeOff, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resolveBalanceteCharts,
  type BalanceteChartsResult,
} from "@/services/balanceteChartsParser";
import type { ParsedFinancialData } from "@/services/auditAIService";
import type { BalanceteEntry } from "@/services/bsDadosBuilder";
import AuditCharts from "@/components/audit/AuditCharts";
import AuditChartsBex from "@/components/audit/AuditChartsBex";

interface Props {
  files?: File[];
  /** Dados estruturados extraídos pela IA — usados como fallback quando o
   *  arquivo carregado não é o template .xlsm com as abas de gráficos. */
  parsedData?: ParsedFinancialData | null;
  /** Mês atribuído pelo usuário em cada balancete (consolida BS & Dados). */
  entries?: BalanceteEntry[];
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

const TabGraficosAuditoria = ({ files, parsedData, entries = [] }: Props) => {
  const [data, setData] = useState<BalanceteChartsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDiagnostico, setShowDiagnostico] = useState(false);
  const [showIndicadores, setShowIndicadores] = useState(false);

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

  // ── Derivações executivas (KPIs, Kanitz, Receita×Custo×Lucro, Alertas) ───
  const exec = useMemo(() => {
    if (!parsedData?.dre?.length && !parsedData?.balanco?.length) return null;
    const years = parsedData?.years ?? [];
    const lastYear = years[years.length - 1];
    if (!lastYear) return null;

    const sumByKw = (rows: ParsedFinancialData["dre"], kws: string, year: string) => {
      const re = new RegExp(kws, "i");
      return (rows ?? [])
        .filter(r => re.test(r.descricao || r.conta || ""))
        .reduce((s, r) => s + (Number(r.values?.[year]) || 0), 0);
    };

    const receita = Math.abs(sumByKw(parsedData.dre, "receita.*l[ií]quida|receita.*bruta|vendas", lastYear));
    const custo = Math.abs(sumByKw(parsedData.dre, "custo.*(mercadoria|servi[çc]o|produto|cmv|csv)", lastYear));
    const despesas = Math.abs(sumByKw(parsedData.dre, "despesa|gasto", lastYear));
    const lucro = sumByKw(parsedData.dre, "lucro.*l[ií]quid|resultado.*l[ií]quid|preju[ií]zo", lastYear);
    const margem = receita > 0 ? (lucro / receita) * 100 : 0;

    const ativoCirc = sumByKw(parsedData.balanco, "ativo.*circulante", lastYear);
    const passivoCirc = sumByKw(parsedData.balanco, "passivo.*circulante", lastYear);
    const passivoNCirc = sumByKw(parsedData.balanco, "passivo.*n[aã]o.*circulante|exig[ií]vel.*longo", lastYear);
    const pl = sumByKw(parsedData.balanco, "patrim[oô]nio.*l[ií]quido", lastYear);
    const estoques = sumByKw(parsedData.balanco, "estoque", lastYear);
    const caixa = sumByKw(parsedData.balanco, "caixa|disponibilidade|banco", lastYear);

    // Kanitz FI
    const x1 = pl > 0 ? lucro / pl : 0;
    const x2 = passivoCirc > 0 ? ativoCirc / passivoCirc : 0;
    const x3 = passivoCirc > 0 ? (ativoCirc - estoques) / passivoCirc : 0;
    const x4 = passivoCirc > 0 ? ativoCirc / passivoCirc : 0;
    const x5 = pl > 0 ? (passivoCirc + passivoNCirc) / pl : 0;
    const fi = 0.05 * x1 + 1.65 * x2 + 3.55 * x3 - 1.06 * x4 - 0.33 * x5;
    const kanitzClass = fi > 0 ? "Solvência" : fi >= -3 ? "Penumbra" : "Insolvência";
    const kanitzColor = fi > 0 ? "hsl(150,70%,42%)" : fi >= -3 ? "hsl(34,95%,55%)" : "hsl(0,75%,55%)";

    const rclSerie = years.map(y => ({
      periodo: y,
      Receita: Math.abs(sumByKw(parsedData.dre, "receita.*l[ií]quida|receita.*bruta|vendas", y)),
      Custo: Math.abs(sumByKw(parsedData.dre, "custo.*(mercadoria|servi[çc]o|produto|cmv|csv)", y)),
      Lucro: sumByKw(parsedData.dre, "lucro.*l[ií]quid|resultado.*l[ií]quid", y),
    }));
    const margemSerie = rclSerie.map(p => ({
      periodo: p.periodo,
      "Margem (%)": p.Receita > 0 ? +(p.Lucro / p.Receita * 100).toFixed(2) : 0,
    }));

    const custoStruct = [
      { name: "Custo Operacional", value: custo, color: "hsl(0,75%,55%)" },
      { name: "Despesas", value: despesas, color: "hsl(34,95%,55%)" },
      { name: "Lucro", value: Math.max(lucro, 0), color: "hsl(150,70%,42%)" },
    ].filter(d => d.value > 0);

    const alertas: Array<{ nivel: "critico" | "atencao" | "ok"; texto: string }> = [];
    if (margem < 0) alertas.push({ nivel: "critico", texto: `Margem líquida negativa (${margem.toFixed(1)}%)` });
    else if (margem < 5) alertas.push({ nivel: "atencao", texto: `Margem líquida baixa (${margem.toFixed(1)}%)` });
    if (receita > 0 && custo / receita > 0.8) alertas.push({ nivel: "critico", texto: `Custo acima de 80% da receita (${(custo / receita * 100).toFixed(0)}%)` });
    if (fi < -3) alertas.push({ nivel: "critico", texto: "Kanitz indica risco de insolvência" });
    else if (fi < 0) alertas.push({ nivel: "atencao", texto: "Kanitz na faixa de penumbra" });
    if (passivoCirc > ativoCirc && ativoCirc > 0) alertas.push({ nivel: "critico", texto: "Liquidez corrente < 1 (passivo > ativo circulante)" });
    if (caixa <= 0) alertas.push({ nivel: "atencao", texto: "Caixa/disponibilidades baixos ou nulos" });
    if (!alertas.length) alertas.push({ nivel: "ok", texto: "Sem alertas críticos detectados" });

    const insight = margem < 0
      ? `A empresa apresenta margem negativa (${margem.toFixed(1)}%) com custo elevado em relação à receita.`
      : margem < 5
      ? `Margem reduzida (${margem.toFixed(1)}%). Avaliar redução de custos ou reprecificação.`
      : `Operação rentável com margem de ${margem.toFixed(1)}%.`;

    return {
      kpis: { receita, lucro, margem, caixa, custo, despesas },
      kanitz: { fi: +fi.toFixed(2), classe: kanitzClass, color: kanitzColor },
      rclSerie, margemSerie, custoStruct, alertas, insight,
    };
  }, [parsedData]);

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

  // Só mostra empty se não há nem dados de template nem dados executivos derivados
  const hasAnyData = !!data?.hasData || !!exec;
  if ((!files?.length && !parsedData?.balanco?.length && !parsedData?.dre?.length) || !hasAnyData) {
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

  // Diagnóstico de completude — explica ao usuário o que está disponível e o que falta.
  const hasDRE = !!parsedData?.dre?.length;
  const hasBalanco = !!parsedData?.balanco?.length;
  const hasTemplateSheets = !!(data?.folha || data?.fcp || data?.prevReal || data?.balanco);
  const missingHints: string[] = [];
  if (!hasDRE) missingHints.push("DRE ausente — KPIs de receita, custo, lucro, margem e Kanitz não podem ser calculados.");
  if (!hasBalanco) missingHints.push("Balanço Patrimonial ausente — índices de liquidez e endividamento não disponíveis.");
  if (!hasTemplateSheets) missingHints.push("Abas auxiliares (Folha, FCP, Fluxo Prev×Real) não encontradas — envie o template .xlsm BEX para visualizar esses blocos.");

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
            {data?.fileName && (
              <span className="text-xs text-muted-foreground font-mono px-2 py-1 rounded bg-background border">
                📎 {data.fileName}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* DIAGNÓSTICO DE EXTRAÇÃO — colapsável */}
      <Card className="border-[hsl(34,95%,55%)]/30 bg-[hsl(34,95%,55%)]/5">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[hsl(34,95%,55%)]" />
                Diagnóstico da Extração de Dados
              </CardTitle>
              <CardDescription className="text-[11px]">
                Resumo do que a IA conseguiu extrair do(s) arquivo(s) — ajuda a entender a completude da auditoria.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDiagnostico(v => !v)}
              className="shrink-0 h-8 gap-1.5"
              aria-expanded={showDiagnostico}
              aria-label={showDiagnostico ? "Ocultar diagnóstico" : "Mostrar diagnóstico"}
            >
              {showDiagnostico ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="text-xs">{showDiagnostico ? "Ocultar" : "Mostrar"}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDiagnostico ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        {showDiagnostico && (
          <CardContent className="space-y-2 text-xs">
            <div className="grid sm:grid-cols-2 gap-2">
              <div className={`flex items-center gap-2 p-2 rounded border ${hasBalanco ? "border-[hsl(150,70%,42%)]/40 bg-[hsl(150,70%,42%)]/10" : "border-[hsl(0,75%,55%)]/40 bg-[hsl(0,75%,55%)]/10"}`}>
                {hasBalanco ? <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(150,70%,42%)]" /> : <AlertTriangle className="w-3.5 h-3.5 text-[hsl(0,75%,55%)]" />}
                <span><strong>Balanço Patrimonial:</strong> {hasBalanco ? `${parsedData!.balanco.length} contas` : "ausente"}</span>
              </div>
              <div className={`flex items-center gap-2 p-2 rounded border ${hasDRE ? "border-[hsl(150,70%,42%)]/40 bg-[hsl(150,70%,42%)]/10" : "border-[hsl(0,75%,55%)]/40 bg-[hsl(0,75%,55%)]/10"}`}>
                {hasDRE ? <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(150,70%,42%)]" /> : <AlertTriangle className="w-3.5 h-3.5 text-[hsl(0,75%,55%)]" />}
                <span><strong>DRE:</strong> {hasDRE ? `${parsedData!.dre.length} linhas` : "ausente — envie a DRE para liberar Kanitz e KPIs"}</span>
              </div>
              <div className={`flex items-center gap-2 p-2 rounded border ${hasTemplateSheets ? "border-[hsl(150,70%,42%)]/40 bg-[hsl(150,70%,42%)]/10" : "border-muted bg-muted/30"}`}>
                {hasTemplateSheets ? <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(150,70%,42%)]" /> : <Activity className="w-3.5 h-3.5 text-muted-foreground" />}
                <span><strong>Template BEX (.xlsm):</strong> {hasTemplateSheets ? "detectado" : "não detectado — apenas balancete contábil"}</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded border border-[hsl(217,91%,50%)]/30 bg-[hsl(217,91%,50%)]/5">
                <Activity className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
                <span><strong>Períodos detectados:</strong> {parsedData?.years?.length ?? 0}</span>
              </div>
            </div>
            {missingHints.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground list-disc pl-5">
                {missingHints.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            )}
            <p className="text-[10px] text-muted-foreground mt-2 italic">
              ℹ️ Datas como Nov/2026 ou Dez/2026 que apareçam sem contexto provavelmente vinham de
              códigos contábeis interpretados como ano — corrigido nesta versão (heurística estrita
              de detecção de período).
            </p>
          </CardContent>
        )}
      </Card>

      {/* ── 12 GRÁFICOS BEX/KANITZ — aba "GRÁFICOS (2)" do template ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            Gráficos de Auditoria — Padrão BEX (Aba GRÁFICOS 2)
          </CardTitle>
          <CardDescription className="text-xs">
            Liquidez Geral, Liquidez Corrente, Evolução do Passivo (PC + PNC), Empréstimos e
            Financiamentos, Imobilizado/Intangível, Endividamento Geral, Resultado/Receita,
            Custo+Despesa/Receita e relações anual e média mensal — reprodução visual fiel da aba{" "}
            <em>GRÁFICOS (2)</em> do template BEX/Kanitz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditChartsBex parsedData={parsedData} entries={entries} />
        </CardContent>
      </Card>



      {/* ── 6 GRÁFICOS DO RELATÓRIO BEX/KANITZ — colapsável ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                Indicadores Operacionais e Estruturais (mensal)
              </CardTitle>
              <CardDescription className="text-xs">
                CMV/RL · CMV+Despesa/RL · Resultado/RL · EBITDA · Liquidez · Endividamento — calculados a
                partir do dataset mensal padronizado (mesma base usada no relatório final).
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowIndicadores(v => !v)}
              className="shrink-0 h-8 gap-1.5"
              aria-expanded={showIndicadores}
              aria-label={showIndicadores ? "Ocultar indicadores" : "Mostrar indicadores"}
            >
              {showIndicadores ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="text-xs">{showIndicadores ? "Ocultar" : "Mostrar"}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showIndicadores ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        {showIndicadores && (
          <CardContent>
            <AuditCharts parsedData={parsedData} entries={entries} />
          </CardContent>
        )}
      </Card>

      {/* RESUMO EXECUTIVO + KANITZ + ALERTAS — derivados da DRE/Balanço */}
      {exec && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Receita", value: fmtMoeda(exec.kpis.receita), icon: TrendingUp, color: "hsl(217,91%,50%)" },
              { label: "Lucro / Prejuízo", value: fmtMoeda(exec.kpis.lucro), icon: DollarSign, color: exec.kpis.lucro >= 0 ? "hsl(150,70%,42%)" : "hsl(0,75%,55%)" },
              { label: "Margem", value: `${exec.kpis.margem.toFixed(1)}%`, icon: Activity, color: exec.kpis.margem >= 5 ? "hsl(150,70%,42%)" : exec.kpis.margem >= 0 ? "hsl(34,95%,55%)" : "hsl(0,75%,55%)" },
              { label: "Caixa Disponível", value: fmtMoeda(exec.kpis.caixa), icon: Wallet, color: "hsl(258,90%,66%)" },
            ].map((k) => (
              <Card key={k.label} className="border-l-4" style={{ borderLeftColor: k.color }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</span>
                    <k.icon className="w-4 h-4" style={{ color: k.color }} />
                  </div>
                  <p className="text-xl font-bold font-mono" style={{ color: k.color }}>{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-muted/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Activity className="w-4 h-4 mt-0.5 text-[hsl(217,91%,50%)] shrink-0" />
              <p className="text-sm text-foreground"><strong>Insight IA:</strong> {exec.insight}</p>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="w-4 h-4" style={{ color: exec.kanitz.color }} /> Kanitz — Fator de Insolvência
                </CardTitle>
                <CardDescription>FI = 0,05·X1 + 1,65·X2 + 3,55·X3 − 1,06·X4 − 0,33·X5</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <RadialBarChart innerRadius="65%" outerRadius="100%" data={[{ name: "FI", value: Math.max(-7, Math.min(7, exec.kanitz.fi)) + 7, fill: exec.kanitz.color }]} startAngle={180} endAngle={0}>
                    <RadialBar background dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="text-center -mt-12">
                  <p className="text-3xl font-bold font-mono" style={{ color: exec.kanitz.color }}>{exec.kanitz.fi}</p>
                  <Badge style={{ backgroundColor: exec.kanitz.color, color: "white" }} className="mt-1">{exec.kanitz.classe}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground text-center mt-3">
                  Faixas: <strong>FI &gt; 0</strong> Solvência · <strong>−3 ≤ FI ≤ 0</strong> Penumbra · <strong>FI &lt; −3</strong> Insolvência
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[hsl(0,75%,55%)]" /> Estrutura de Custos
                </CardTitle>
                <CardDescription>Distribuição Custo · Despesas · Lucro (último período)</CardDescription>
              </CardHeader>
              <CardContent>
                {exec.custoStruct.length ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={exec.custoStruct} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={(e: any) => `${e.name}: ${((e.percent || 0) * 100).toFixed(0)}%`}>
                        {exec.custoStruct.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtMoeda(v)} contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={DollarSign} title="Sem dados de custos." />}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Receita × Custo × Lucro
                </CardTitle>
                <CardDescription>Cores fixas (padrão Excel): Azul · Vermelho · Verde</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={exec.rclSerie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="periodo" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtCompact} />
                    <Tooltip formatter={(v: number) => fmtMoeda(v)} contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Receita" fill="hsl(217,91%,50%)" radius={[3,3,0,0]} />
                    <Bar dataKey="Custo" fill="hsl(0,75%,55%)" radius={[3,3,0,0]} />
                    <Bar dataKey="Lucro" fill="hsl(150,70%,42%)" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[hsl(150,70%,42%)]" /> Margem Líquida (%)
                </CardTitle>
                <CardDescription>Evolução percentual do lucro sobre receita</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={exec.margemSerie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="periodo" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit="%" />
                    <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Margem (%)" stroke="hsl(150,70%,42%)" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[hsl(34,95%,55%)]" /> Alertas Inteligentes
              </CardTitle>
              <CardDescription>Detecção automática de riscos financeiros</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {exec.alertas.map((a, i) => {
                const map = {
                  critico: { color: "hsl(0,75%,55%)", icon: AlertTriangle, label: "Crítico" },
                  atencao: { color: "hsl(34,95%,55%)", icon: AlertTriangle, label: "Atenção" },
                  ok: { color: "hsl(150,70%,42%)", icon: CheckCircle2, label: "OK" },
                }[a.nivel];
                const Icon = map.icon;
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded border-l-4 bg-muted/30" style={{ borderLeftColor: map.color }}>
                    <Icon className="w-4 h-4 shrink-0" style={{ color: map.color }} />
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: map.color, color: map.color }}>{map.label}</Badge>
                    <span className="text-sm">{a.texto}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

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
