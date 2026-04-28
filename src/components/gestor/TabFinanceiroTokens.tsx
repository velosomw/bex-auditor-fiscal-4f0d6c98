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
  Save, AlertTriangle, Lightbulb, TrendingUp, Loader2, Sparkles, Info,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import {
  fetchCostConfig, fetchCostIndicators, upsertCostConfig, runCostDiagnostics,
  type CostConfigRow, type CostIndicators,
} from "@/services/gestorIaCostService";

const PIE_COLORS = [
  "hsl(217, 91%, 50%)", "hsl(258, 90%, 66%)", "hsl(38, 90%, 55%)",
  "hsl(152, 70%, 45%)", "hsl(0, 70%, 55%)", "hsl(190, 70%, 50%)",
];

const fmtUSD = (n: number) =>
  `$ ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
const fmtUSDc = (n: number) =>
  `$ ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

const TabFinanceiroTokens = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [config, setConfig] = useState<CostConfigRow[]>([]);
  const [indicators, setIndicators] = useState<CostIndicators | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<CostConfigRow>>>({});

  const reload = async () => {
    setLoading(true);
    try {
      const [c, ind] = await Promise.all([fetchCostConfig(), fetchCostIndicators()]);
      setConfig(c);
      setIndicators(ind);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

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
      toast.success(`${row.label} atualizado`);
      setDrafts((d) => { const n = { ...d }; delete n[row.service]; return n; });
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">
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
        />
        <KpiCard
          icon={<Layers className="w-4 h-4" />}
          label="Custo por Balancete"
          value={fmtUSDc(indicators?.custoBalancete ?? 0)}
          sub={`${indicators?.totalBalancetes ?? 0} balancetes`}
          color="hsl(258,90%,66%)"
        />
        <KpiCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Custo Total (E2E)"
          value={fmtUSDc(indicators?.custoTotal ?? 0)}
          sub="Acumulado"
          color="hsl(152,70%,45%)"
        />
        <KpiCard
          icon={<Activity className="w-4 h-4" />}
          label="Custo Médio/Execução"
          value={fmtUSDc(indicators?.custoMedioExecucao ?? 0)}
          sub="por documento"
          color="hsl(38,90%,55%)"
        />
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

      {/* ─── Insights ──────────────────────────────────────────── */}
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
          <Badge variant="outline" className="text-[10px]">USD — editável (Gestor IA / Coordenadora)</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Serviço</TableHead>
                <TableHead className="text-xs text-right">Input $/1k</TableHead>
                <TableHead className="text-xs text-right">Output $/1k</TableHead>
                <TableHead className="text-xs text-right">$ / Requisição</TableHead>
                <TableHead className="text-xs text-right">$ / Página</TableHead>
                <TableHead className="text-xs text-right">$ Fixo</TableHead>
                <TableHead className="text-xs text-right">Total Acumulado</TableHead>
                <TableHead className="text-xs text-right w-28">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.map((row) => {
                const draft = drafts[row.service];
                const dirty = !!draft;
                const v = (k: keyof CostConfigRow) => (draft?.[k] ?? row[k]) as number;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs">
                      <div className="font-semibold text-foreground">{row.label}</div>
                      <div className="text-[10px] text-muted-foreground">{row.provider} · {row.service}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={(v("cost_per_1k_input") ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                          updateDraft(row.service, "cost_per_1k_input", parseFloat(raw) || 0);
                        }}
                        placeholder="0,000"
                        className="h-8 text-xs text-right font-mono w-28 ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={(v("cost_per_1k_output") ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                          updateDraft(row.service, "cost_per_1k_output", parseFloat(raw) || 0);
                        }}
                        placeholder="0,000"
                        className="h-8 text-xs text-right font-mono w-28 ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={(v("cost_per_request") ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                          updateDraft(row.service, "cost_per_request", parseFloat(raw) || 0);
                        }}
                        placeholder="0,000"
                        className="h-8 text-xs text-right font-mono w-28 ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={(v("cost_per_page") ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                          updateDraft(row.service, "cost_per_page", parseFloat(raw) || 0);
                        }}
                        placeholder="0,000"
                        className="h-8 text-xs text-right font-mono w-28 ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={(v("cost_fixed") ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                          updateDraft(row.service, "cost_fixed", parseFloat(raw) || 0);
                        }}
                        placeholder="0,000"
                        className="h-8 text-xs text-right font-mono w-28 ml-auto"
                      />
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
                  <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                    {loading ? "Carregando..." : "Nenhuma configuração de custo encontrada."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

// ─── Subcomponentes ────────────────────────────────────────────
const KpiCard = ({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string;
}) => (
  <div className="bg-card border border-border rounded-xl p-4">
    <div className="flex items-center justify-between mb-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div style={{ color }}>{icon}</div>
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
