import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Wallet, DollarSign, FileBarChart, Layers, Activity, RefreshCw,
  Save, AlertTriangle, Lightbulb, TrendingUp, Loader2, Sparkles, Info, CalendarRange,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, AreaChart, Area,
} from "recharts";
import {
  fetchCostConfig, fetchCostIndicators, upsertCostConfig, runCostDiagnostics,
  type CostConfigRow, type CostIndicators, type PeriodKey,
} from "@/services/gestorIaCostService";

const PIE_COLORS = [
  "hsl(217, 91%, 50%)", "hsl(258, 90%, 66%)", "hsl(38, 90%, 55%)",
  "hsl(152, 70%, 45%)", "hsl(0, 70%, 55%)", "hsl(190, 70%, 50%)",
];

const fmtUSD = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
const fmtUSDc = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

// Linhas editáveis de infraestrutura (persistidas em localStorage)
type InfraRow = {
  service: string;
  label: string;
  spec: string;
  monthly: number;   // R$/mês
  refReports: number; // relatórios/mês de referência E2E
};

const INFRA_DEFAULTS: InfraRow[] = [
  { service: "infra_compute",   label: "Compute",                  spec: "Machine type n4-standard-2 · 2 vCPUs · 8 GB RAM", monthly: 394.10, refReports: 700 },
  { service: "infra_boot_disk", label: "Boot disk",                spec: "Disco de boot · 10 GiB",                          monthly:   4.76, refReports: 700 },
  { service: "infra_bigquery",  label: "Data Analytics — BigQuery",spec: "On-Demand (BigQuery)",                            monthly: 138.82, refReports: 700 },
  { service: "infra_cloudsql",  label: "Database — Cloud SQL",     spec: "PostgreSQL (Cloud SQL)",                          monthly: 146.81, refReports: 700 },
  { service: "infra_storage",   label: "Storage Cloud",            spec: "Total armazenado · 1000 GiB",                     monthly: 118.45, refReports: 700 },
];

const INFRA_LS_KEY = "bex.infraRows.v1";

const fmtBRL = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBRL3 = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

const TabFinanceiroTokens = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [config, setConfig] = useState<CostConfigRow[]>([]);
  const [indicators, setIndicators] = useState<CostIndicators | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("mes");
  const [showE2EDetail, setShowE2EDetail] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("gestor.e2eDetail.open") !== "0";
  });
  const [drafts, setDrafts] = useState<Record<string, Partial<CostConfigRow>>>({});
  // Buffers de string para permitir digitação livre nos campos numéricos (pt-BR)
  const [inputBuffers, setInputBuffers] = useState<Record<string, string>>({});
  // Linhas de infraestrutura editáveis (persistidas em localStorage)
  const [infraRows, setInfraRows] = useState<InfraRow[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(INFRA_LS_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as InfraRow[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return INFRA_DEFAULTS;
  });
  const [infraDirty, setInfraDirty] = useState(false);

  const updateInfra = (service: string, field: keyof InfraRow, value: string | number) => {
    setInfraRows((rows) => rows.map((r) => (r.service === service ? { ...r, [field]: value } : r)));
    setInfraDirty(true);
  };
  const saveInfra = () => {
    try {
      window.localStorage.setItem(INFRA_LS_KEY, JSON.stringify(infraRows));
      setInfraDirty(false);
      toast.success("Valores de infraestrutura salvos");
    } catch {
      toast.error("Falha ao salvar infraestrutura");
    }
  };
  const resetInfra = () => {
    setInfraRows(INFRA_DEFAULTS);
    setInfraDirty(true);
  };

  const infraMonthlyTotal = useMemo(
    () => infraRows.reduce((acc, r) => acc + (Number(r.monthly) || 0), 0),
    [infraRows]
  );
  const infraPerReportTotal = useMemo(
    () => infraRows.reduce((acc, r) => acc + (r.refReports > 0 ? r.monthly / r.refReports : 0), 0),
    [infraRows]
  );

  // ─── Breakdown E2E (reutilizado no card e no painel detalhado) ───
  const e2eBreakdown = useMemo(() => {
    const bk = indicators?.breakdown ?? [];
    const sumByMatch = (matchers: string[]) =>
      bk
        .filter((b) => matchers.some((m) => (b.service || "").toLowerCase().includes(m)))
        .reduce((acc, b) => acc + Number(b.cost || 0), 0);
    const costOCR        = sumByMatch(["document_ai", "ocr"]);
    const costEmbeddings = sumByMatch(["embedding"]);
    const costFlash      = sumByMatch(["gemini_2_5_flash", "gemini-2.5-flash", "gemini_flash"]);
    const costPro        = sumByMatch(["gemini_2_5_pro", "gemini-2.5-pro", "gemini_pro"]);
    const aiKnown        = costOCR + costEmbeddings + costFlash + costPro;
    const aiTotal        = Number(indicators?.custoTotal ?? 0);
    const aiOutros       = Math.max(0, aiTotal - aiKnown);
    const totalReports   = Number(indicators?.totalRelatorios ?? 0);
    const infraPerRep    = infraPerReportTotal;
    const infraPeriod    = infraPerRep * totalReports;
    const e2eTotal       = aiTotal + infraPeriod;
    return { costOCR, costEmbeddings, costFlash, costPro, aiKnown, aiTotal, aiOutros, totalReports, infraPerRep, infraPeriod, e2eTotal };
  }, [indicators, infraPerReportTotal]);

  const fmtBR = (n: number) =>
    Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const parseBR = (s: string): number => {
    const cleaned = (s || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  };

  const bufKey = (service: string, field: string) => `${service}::${field}`;
  const getBuf = (service: string, field: keyof CostConfigRow, fallback: number) => {
    const k = bufKey(service, field as string);
    return inputBuffers[k] !== undefined ? inputBuffers[k] : fmtBR(fallback);
  };
  const setBuf = (service: string, field: keyof CostConfigRow, raw: string) => {
    const k = bufKey(service, field as string);
    // aceita só dígitos, vírgula, ponto
    const sanitized = raw.replace(/[^\d.,]/g, "");
    setInputBuffers((b) => ({ ...b, [k]: sanitized }));
    updateDraft(service, field, parseBR(sanitized));
  };
  const blurBuf = (service: string, field: keyof CostConfigRow) => {
    const k = bufKey(service, field as string);
    const val = parseBR(inputBuffers[k] ?? "");
    setInputBuffers((b) => ({ ...b, [k]: fmtBR(val) }));
  };

  const reload = async (p: PeriodKey = period) => {
    setLoading(true);
    try {
      const [c, ind] = await Promise.all([fetchCostConfig(), fetchCostIndicators(p)]);
      setConfig(c);
      setIndicators(ind);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload("mes"); }, []);

  const onPeriodChange = (p: PeriodKey) => {
    setPeriod(p);
    reload(p);
  };

  const updateDraft = (service: string, field: keyof CostConfigRow, value: number) => {
    setDrafts((d) => ({ ...d, [service]: { ...d[service], [field]: value } }));
  };

  const saveRow = async (row: CostConfigRow) => {
    const draft = drafts[row.service];
    if (!draft) return;
    setSaving(row.service);
    try {
      await upsertCostConfig({
        service: row.service,
        provider: row.provider,
        label: row.label,
        cost_per_1k_input: draft.cost_per_1k_input ?? row.cost_per_1k_input,
        cost_per_1k_output: draft.cost_per_1k_output ?? row.cost_per_1k_output,
        cost_per_request: draft.cost_per_request ?? row.cost_per_request,
        cost_per_page: draft.cost_per_page ?? row.cost_per_page,
        cost_fixed: draft.cost_fixed ?? row.cost_fixed,
      });
      toast.success("Item Salvo");
      setDrafts((d) => { const n = { ...d }; delete n[row.service]; return n; });
      // limpa buffers da linha salva
      setInputBuffers((b) => {
        const n = { ...b };
        ["cost_per_1k_input","cost_per_1k_output","cost_per_request","cost_per_page","cost_fixed"]
          .forEach((f) => delete n[`${row.service}::${f}`]);
        return n;
      });
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar (verifique permissão)");
    } finally {
      setSaving(null);
    }
  };

  const runDiagnostic = async () => {
    setDiagRunning(true);
    try {
      const r = await runCostDiagnostics();
      toast.success(`Diagnóstico OK — ${r.updated} ajuste(s) em ${r.total} log(s)`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha no diagnóstico");
    } finally {
      setDiagRunning(false);
    }
  };

  const pieData = useMemo(() => indicators?.breakdown ?? [], [indicators]);

  return (
    <div className="space-y-6">
      {/* ─── Header / Ações ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[hsl(217,91%,50%)]" />
            Controle Financeiro de Tokens & APIs
          </h2>
          <p className="text-xs text-muted-foreground">
            Custo real de cada operação de IA — baseado em <strong>uso efetivo</strong> registrado pelo pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="w-3.5 h-3.5" />
            Período:
          </div>
          <Select value={period} onValueChange={(v) => onPeriodChange(v as PeriodKey)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mês corrente</SelectItem>
              <SelectItem value="trimestre">Trimestre atual</SelectItem>
              <SelectItem value="semestre">Semestre atual</SelectItem>
              <SelectItem value="ano">Ano atual</SelectItem>
              <SelectItem value="total">Total acumulado</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => reload()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Informação sobre os preços"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                Os valores refletem faixa real de mercado <strong>(2025–2026)</strong> e podem variar por contrato/volume do fornecedor de IA.
                O Gestor IA pode realizar <strong>ajuste fino</strong> diretamente no painel de custos abaixo.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            size="sm"
            onClick={runDiagnostic}
            disabled={diagRunning}
            className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5"
          >
            {diagRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {diagRunning ? "Diagnosticando..." : "Executar Diagnóstico"}
          </Button>
        </div>
      </div>

      {/* ─── KPIs ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<FileBarChart className="w-4 h-4" />}
          label="Custo por Relatório"
          value={fmtUSDc(indicators?.custoRelatorio ?? 0)}
          sub={`${indicators?.totalRelatorios ?? 0} relatórios`}
          color="hsl(217,91%,50%)"
          info={
            <>
              <p className="font-semibold mb-1">Custo por Relatório</p>
              <p>Custo médio para gerar 1 relatório de auditoria, incluindo a etapa de geração de insights e narrativa final pelo <strong>Gemini Pro</strong>.</p>
              <p className="mt-1 text-muted-foreground">Fórmula: soma dos custos dos logs do tipo <em>relatorio/insight</em> ÷ nº de relatórios únicos no período.</p>
            </>
          }
        />
        <KpiCard
          icon={<Layers className="w-4 h-4" />}
          label="Custo por Balancete"
          value={fmtUSDc(indicators?.custoBalancete ?? 0)}
          sub={`${indicators?.totalBalancetes ?? 0} balancetes`}
          color="hsl(258,90%,66%)"
          info={
            <>
              <p className="font-semibold mb-1">Custo por Balancete</p>
              <p>Custo médio para processar 1 balancete: <strong>OCR/Document AI</strong>, <strong>embeddings</strong> e <strong>mapping/normalização</strong> de contas via Gemini Flash.</p>
              <p className="mt-1 text-muted-foreground">Fórmula: soma dos custos dos logs de balancete/ocr/mapping ÷ nº de balancetes únicos no período.</p>
            </>
          }
        />
        {(() => {
          const { costOCR, costEmbeddings, costFlash, costPro, aiTotal, aiOutros, totalReports, infraPerRep, infraPeriod, e2eTotal } = e2eBreakdown;
          return (
            <KpiCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Custo Total (E2E)"
              value={fmtUSDc(e2eTotal)}
              sub={`${indicators?.periodLabel ?? "Acumulado"} · IA ${fmtBRL(aiTotal)} + infra ${fmtBRL(infraPeriod)}`}
              color="hsl(152,70%,45%)"
              info={
                <>
                  <p className="font-semibold mb-1">Custo Total (E2E) — detalhamento</p>
                  <p className="text-muted-foreground mb-1">Soma de todos os agentes de IA no período + infraestrutura por relatório.</p>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li><strong>OCR / Document AI</strong>: <strong>{fmtBRL3(costOCR)}</strong></li>
                    <li><strong>Embeddings</strong>: <strong>{fmtBRL3(costEmbeddings)}</strong></li>
                    <li><strong>Gemini Flash</strong>: <strong>{fmtBRL3(costFlash)}</strong></li>
                    <li><strong>Gemini Pro</strong>: <strong>{fmtBRL3(costPro)}</strong></li>
                    {aiOutros > 0 && (<li>Outros: <strong>{fmtBRL3(aiOutros)}</strong></li>)}
                  </ul>
                  <p className="mt-1">Subtotal IA: <strong>{fmtBRL(aiTotal)}</strong></p>
                  <p className="mt-1">Infra: <strong>{fmtBRL3(infraPerRep)}</strong>/rel × <strong>{totalReports}</strong> rel = <strong>{fmtBRL(infraPeriod)}</strong></p>
                  <p className="mt-1 font-semibold">E2E = IA ({fmtBRL(aiTotal)}) + Infra ({fmtBRL(infraPeriod)}) = <strong>{fmtBRL(e2eTotal)}</strong></p>
                </>
              }
            />
          );
        })()}
        <KpiCard
          icon={<Activity className="w-4 h-4" />}
          label="Custo Médio/Execução"
          value={fmtUSDc(indicators?.custoMedioExecucao ?? 0)}
          sub="por documento"
          color="hsl(38,90%,55%)"
          info={
            <>
              <p className="font-semibold mb-1">Custo Médio por Execução</p>
              <p>Custo médio consumido por documento processado de ponta a ponta, considerando todas as etapas do pipeline.</p>
              <p className="mt-1 text-muted-foreground">Fórmula: Custo Total (E2E) ÷ nº de documentos únicos processados no período.</p>
            </>
          }
        />
      </div>

      {/* ─── Detalhamento do Custo E2E ─────────────────────────── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[hsl(152,70%,45%)]" />
            <h3 className="text-sm font-semibold">Detalhamento do Custo E2E</h3>
            <Badge variant="secondary" className="text-[10px]">{indicators?.periodLabel ?? "Acumulado"}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Fórmula: <code>Σ agentes IA (período) + (Σ infra/relatório × nº relatórios)</code>
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[34%]">Componente</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right w-[14%]">Valor unitário</TableHead>
              <TableHead className="text-right w-[10%]">Qtd.</TableHead>
              <TableHead className="text-right w-[16%]">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">OCR / Document AI</TableCell>
              <TableCell className="text-muted-foreground text-xs">Leitura do PDF do balancete</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right font-mono">{fmtBRL3(e2eBreakdown.costOCR)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Embeddings</TableCell>
              <TableCell className="text-muted-foreground text-xs">Vetorização para busca semântica</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right font-mono">{fmtBRL3(e2eBreakdown.costEmbeddings)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Gemini Flash</TableCell>
              <TableCell className="text-muted-foreground text-xs">Mapping/normalização das contas contábeis</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right font-mono">{fmtBRL3(e2eBreakdown.costFlash)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Gemini Pro</TableCell>
              <TableCell className="text-muted-foreground text-xs">Geração de insights e relatório final</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right font-mono">{fmtBRL3(e2eBreakdown.costPro)}</TableCell>
            </TableRow>
            {e2eBreakdown.aiOutros > 0 && (
              <TableRow>
                <TableCell className="font-medium">Outros (storage, ajustes)</TableCell>
                <TableCell className="text-muted-foreground text-xs">Logs não classificados nos agentes acima</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                <TableCell className="text-right font-mono">{fmtBRL3(e2eBreakdown.aiOutros)}</TableCell>
              </TableRow>
            )}
            <TableRow className="bg-muted/40">
              <TableCell className="font-semibold">Subtotal Agentes IA</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                Σ <code>cost_calculated</code> em <code>ai_usage_logs</code> agrupado por <code>service</code> no período
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
              <TableCell className="text-right font-mono font-semibold">{fmtBRL(e2eBreakdown.aiTotal)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Infraestrutura</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                Custo/relatório (Σ Compute + Boot disk + BigQuery + Cloud SQL + Storage) × nº de relatórios
              </TableCell>
              <TableCell className="text-right font-mono">{fmtBRL3(e2eBreakdown.infraPerRep)}</TableCell>
              <TableCell className="text-right font-mono">{e2eBreakdown.totalReports}</TableCell>
              <TableCell className="text-right font-mono">{fmtBRL(e2eBreakdown.infraPeriod)}</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="font-semibold text-right">
                Custo Total (E2E) = IA ({fmtBRL(e2eBreakdown.aiTotal)}) + Infra ({fmtBRL(e2eBreakdown.infraPeriod)})
              </TableCell>
              <TableCell className="text-right font-mono font-bold text-[hsl(152,70%,45%)]">
                {fmtBRL(e2eBreakdown.e2eTotal)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* ─── Gráficos ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Distribuição de custos">
          {pieData.length === 0 ? (
            <Empty hint="Sem uso registrado ainda" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="cost" nameKey="label" outerRadius={80} innerRadius={45}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip formatter={(v: any) => fmtUSD(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Evolução mensal">
          {(indicators?.monthlySeries.length ?? 0) === 0 ? (
            <Empty hint="Sem histórico mensal" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={indicators!.monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any) => fmtUSD(Number(v))} />
                <Line type="monotone" dataKey="custo" stroke="hsl(217,91%,50%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Custo por serviço">
          {(indicators?.byService.length ?? 0) === 0 ? (
            <Empty hint="Sem dados por serviço" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={indicators!.byService}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: any) => fmtUSD(Number(v))} />
                <Bar dataKey="custo" fill="hsl(258,90%,66%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ─── Últimos 6 meses ─────────────────────────────────────── */}
      <ChartCard title="Custo nos últimos 6 meses">
        {(indicators?.last6Months ?? []).every((m) => m.custo === 0) ? (
          <Empty hint="Sem custos registrados nos últimos 6 meses" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={indicators!.last6Months}>
              <defs>
                <linearGradient id="grad6m" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(217,91%,50%)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(217,91%,50%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RTooltip formatter={(v: any) => fmtUSD(Number(v))} />
              <Area type="monotone" dataKey="custo" stroke="hsl(217,91%,50%)" strokeWidth={2} fill="url(#grad6m)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      {indicators && indicators.insights.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[hsl(38,90%,55%)]" /> Diagnóstico inteligente
          </h3>
          <div className="grid md:grid-cols-2 gap-3">
            {indicators.insights.map((ins, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 border text-xs ${
                  ins.level === "critical"
                    ? "border-[hsl(0,70%,55%)]/30 bg-[hsl(0,70%,55%)]/5"
                    : ins.level === "warning"
                    ? "border-[hsl(38,90%,55%)]/30 bg-[hsl(38,90%,55%)]/5"
                    : "border-[hsl(217,91%,50%)]/30 bg-[hsl(217,91%,50%)]/5"
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5 text-foreground">
                  {ins.level === "critical" ? <AlertTriangle className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  {ins.alerta}
                </div>
                <div className="text-muted-foreground mt-1">{ins.causa}</div>
                <div className="mt-1.5"><strong>Ação:</strong> {ins.acao}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Tabela de configuração ────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Tabela de preços por serviço</h3>
          <Badge variant="outline" className="text-[10px]">BRL — editável (Gestor IA / Coordenadora)</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Serviço</TableHead>
                <TableHead className="text-xs text-right">Input R$/1k</TableHead>
                <TableHead className="text-xs text-right">Output R$/1k</TableHead>
                <TableHead className="text-xs text-right">R$ / Requisição</TableHead>
                <TableHead className="text-xs text-right">R$ / Página</TableHead>
                <TableHead className="text-xs text-right">R$ Fixo</TableHead>
                <TableHead className="text-xs text-right">Total Acumulado</TableHead>
                <TableHead className="text-xs text-right w-28">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.map((row) => {
                const draft = drafts[row.service];
                const dirty = !!draft;
                const v = (k: keyof CostConfigRow) => (draft?.[k] ?? row[k]) as number;
                const rowTotal =
                  (Number(v("cost_per_1k_input")) || 0) +
                  (Number(v("cost_per_1k_output")) || 0) +
                  (Number(v("cost_per_request")) || 0) +
                  (Number(v("cost_per_page")) || 0) +
                  (Number(v("cost_fixed")) || 0);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs">
                      <div className="font-semibold text-foreground">{row.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.provider} · {row.service.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </div>
                    </TableCell>
                    {(["cost_per_1k_input","cost_per_1k_output","cost_per_request","cost_per_page","cost_fixed"] as (keyof CostConfigRow)[]).map((field) => (
                      <TableCell key={field as string} className="text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={getBuf(row.service, field, v(field))}
                          onChange={(e) => setBuf(row.service, field, e.target.value)}
                          onBlur={() => blurBuf(row.service, field)}
                          placeholder="0,000"
                          className="h-8 text-xs text-right font-mono w-28 ml-auto"
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <span className="inline-block font-mono text-xs font-semibold text-foreground tabular-nums">
                        {rowTotal.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={dirty ? "default" : "outline"}
                        disabled={!dirty || saving === row.service}
                        onClick={() => saveRow(row)}
                        className="h-8 gap-1.5 text-xs"
                      >
                        {saving === row.service ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Salvar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {config.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                    {loading ? "Carregando..." : "Nenhuma configuração de custo encontrada."}
                  </TableCell>
                </TableRow>
              )}

              {/* ─── Infraestrutura (valores estimados, EDITÁVEIS) ─── */}
              <TableRow className="bg-muted/30">
                <TableCell colSpan={6} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground py-2">
                  Valores estimados de infraestrutura — referência E2E ≈ 700 relatórios/mês
                </TableCell>
                <TableCell colSpan={2} className="text-right py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={resetInfra}
                      className="h-7 text-[11px]"
                    >
                      Restaurar padrão
                    </Button>
                    <Button
                      size="sm"
                      variant={infraDirty ? "default" : "outline"}
                      disabled={!infraDirty}
                      onClick={saveInfra}
                      className="h-7 gap-1.5 text-[11px]"
                    >
                      <Save className="w-3 h-3" /> Salvar infra
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {infraRows.map((r) => {
                const perReport = r.refReports > 0 ? r.monthly / r.refReports : 0;
                return (
                  <TableRow key={r.service} className="bg-muted/10">
                    <TableCell className="text-xs align-top">
                      <Input
                        type="text"
                        value={r.label}
                        onChange={(e) => updateInfra(r.service, "label", e.target.value)}
                        className="h-7 text-xs font-semibold"
                      />
                      <Input
                        type="text"
                        value={r.spec}
                        onChange={(e) => updateInfra(r.service, "spec", e.target.value)}
                        className="h-6 mt-1 text-[10px] text-muted-foreground"
                      />
                    </TableCell>
                    <TableCell colSpan={2} className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-[10px] text-muted-foreground">R$</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={r.monthly}
                          onChange={(e) => updateInfra(r.service, "monthly", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs text-right font-mono w-28"
                        />
                        <span className="text-[10px] text-muted-foreground">/mês</span>
                      </div>
                    </TableCell>
                    <TableCell colSpan={2} className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-[10px] text-muted-foreground">Ref.:</span>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={r.refReports}
                          onChange={(e) => updateInfra(r.service, "refReports", parseInt(e.target.value) || 1)}
                          className="h-7 text-xs text-right font-mono w-20"
                        />
                        <span className="text-[10px] text-muted-foreground">rel./mês</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                      {fmtBRL3(perReport)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="text-[10px]">infra</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/20">
                <TableCell className="text-xs font-semibold text-foreground">Total infraestrutura</TableCell>
                <TableCell colSpan={2} className="text-right font-mono text-xs tabular-nums text-foreground">
                  {fmtBRL(infraMonthlyTotal)} <span className="text-[10px] text-muted-foreground">/mês</span>
                </TableCell>
                <TableCell colSpan={2} className="text-right text-[10px] text-muted-foreground">
                  Custo/relatório (Σ):
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-bold text-primary tabular-nums">
                  {fmtBRL3(infraPerReportTotal)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
            {config.length > 0 && (() => {
              const sum = (k: keyof CostConfigRow) =>
                config.reduce((acc, r) => acc + (Number((drafts[r.service]?.[k] ?? r[k]) as number) || 0), 0);
              const tIn = sum("cost_per_1k_input");
              const tOut = sum("cost_per_1k_output");
              const tReq = sum("cost_per_request");
              const tPg = sum("cost_per_page");
              const tFix = sum("cost_fixed");
              const grand = tIn + tOut + tReq + tPg + tFix;
              const fmt = (n: number) =>
                n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
              return (
                <TableFooter>
                  <TableRow>
                    <TableCell className="text-xs font-semibold text-foreground">Total geral</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{fmt(tIn)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{fmt(tOut)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{fmt(tReq)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{fmt(tPg)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{fmt(tFix)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-primary tabular-nums">{fmt(grand)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              );
            })()}
          </Table>
        </div>
      </div>
    </div>
  );
};

// ─── Subcomponentes ────────────────────────────────────────────
const KpiCard = ({ icon, label, value, sub, color, info }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string; info?: React.ReactNode;
}) => (
  <div className="bg-card border border-border rounded-xl p-4">
    <div className="flex items-center justify-between mb-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="flex items-center gap-1.5">
        {info && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Mais informações">
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
                {info}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div style={{ color }}>{icon}</div>
      </div>
    </div>
    <div className="text-xl font-bold font-mono text-foreground">{value}</div>
    <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
  </div>
);

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-card border border-border rounded-xl p-4">
    <h3 className="text-xs font-semibold text-foreground mb-2">{title}</h3>
    {children}
  </div>
);

const Empty = ({ hint }: { hint: string }) => (
  <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">
    {hint}
  </div>
);

export default TabFinanceiroTokens;
