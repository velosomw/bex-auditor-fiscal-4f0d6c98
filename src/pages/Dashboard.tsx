import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useUser } from "@/contexts/UserContext";
import { FileText, CheckCircle2, Clock, Award, Plus, Download, TrendingUp, TrendingDown, AlertTriangle, Shield, BarChart3, Eye, Calculator, Building2, Activity, Scale, AlertOctagon, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { loadDashboardStats, emptyStats, type DashboardStats } from "@/services/dashboardStatsService";
import PlatformLayout from "@/components/PlatformLayout";
import CompanySelectorDialog from "@/components/CompanySelectorDialog";
import CoordinatorDashboard from "@/components/coordinator/CoordinatorDashboard";
import { listCompanies, type Company } from "@/services/companiesService";

const COLORS = ["hsl(217,91%,50%)", "hsl(200,98%,55%)", "hsl(142,76%,36%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)"];

/* Empty state for last audit until real data exists */
const emptyAuditOverview = {
  empresa: "Sem auditoria registrada",
  periodo: "—",
  statusFinanceiro: "Saudável" as const,
  scoreRisco: 0,
  indicadores: { liquidezCorrente: null, endividamento: null, kanitz: null } as { liquidezCorrente: number | null; endividamento: number | null; kanitz: number | null },
  alertasIA: [] as { titulo: string; descricao: string; severidade: string }[],
};

const severityStyle: Record<string, string> = {
  critico: "border-l-[hsl(0,84%,60%)] bg-[hsl(0,84%,60%)]/5",
  alto: "border-l-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)]/5",
  medio: "border-l-[hsl(200,98%,55%)] bg-[hsl(200,98%,55%)]/5",
  baixo: "border-l-muted bg-muted/30",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { role } = useUser();
  const [period, setPeriod] = useState("6m");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const lastAuditOverview = stats.lastAudit ?? emptyAuditOverview;

  const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
  const searchResults = (() => {
    const q = searchTerm.trim();
    if (!q) return [] as Company[];
    const qn = norm(q);
    const qd = onlyDigits(q);
    return companies
      .filter((c) =>
        norm(c.name).includes(qn) ||
        (c.cnpj && qd && onlyDigits(c.cnpj).includes(qd)) ||
        (c.id && c.id.toLowerCase().includes(q.toLowerCase())) ||
        (c.sector && norm(c.sector).includes(qn))
      )
      .slice(0, 8);
  })();

  const refreshCompanies = () => listCompanies().then(setCompanies).catch(() => {});

  useEffect(() => {
    refreshCompanies();
    loadDashboardStats()
      .then(setStats)
      .catch(() => setStats(emptyStats))
      .finally(() => setLoading(false));
  }, []);

  const handleStartNewAudit = (company: Company) => navigate(`/audit?company=${company.id}`);

  if (role === "coordenadora") {
    return (
      <PlatformLayout>
        <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard da Coordenadora</h1>
            <p className="text-sm text-muted-foreground">Cockpit consolidado de governança e supervisão</p>
          </div>
          <CoordinatorDashboard />
        </div>
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard do Auditor Chefe</h1>
            <p className="text-sm text-muted-foreground">Cockpit consolidado de auditorias</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">Último mês</SelectItem>
                <SelectItem value="3m">3 meses</SelectItem>
                <SelectItem value="6m">6 meses</SelectItem>
                <SelectItem value="12m">12 meses</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => navigate("/modelo-matematico")}>
              <Calculator className="w-4 h-4" /> Modelo Matemático
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => navigate("/empresas")}>
              <Building2 className="w-4 h-4" /> Ver Empresas
            </Button>
            <Button size="sm" className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5" onClick={() => setSelectorOpen(true)}>
              <Plus className="w-4 h-4" /> Nova Auditoria
            </Button>
          </div>
        </div>
        <CompanySelectorDialog open={selectorOpen} onOpenChange={setSelectorOpen} onConfirm={handleStartNewAudit} />

        {/* ── Quick Search ── */}
        <Card className="border-border/60">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 h-9 rounded-md bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] text-xs font-medium shrink-0">
                <Search className="w-3.5 h-3.5" /> Buscar Empresa
              </div>
              <div className="relative flex-1">
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Pesquise por empresa, ID, CNPJ ou setor para abrir a visão 360°..."
                  className="h-9 text-sm pr-8"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {searchTerm && (
              <div className="mt-3 border border-border/60 rounded-lg overflow-hidden">
                {searchResults.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    Nenhuma empresa encontrada para "{searchTerm}".
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                    {searchResults.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => navigate(`/empresa/${c.id}`)}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/50 transition text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-md bg-[hsl(258,90%,66%)]/10 flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {c.cnpj ? `CNPJ ${c.cnpj}` : "CNPJ não informado"}
                                {c.sector ? ` · ${c.sector}` : ""}
                                {` · ID ${c.id.slice(0, 8)}`}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">Abrir 360°</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Audit Overview Panel ── */}
        <Card className="border-2 border-[hsl(258,90%,66%)]/20 bg-gradient-to-r from-[hsl(258,90%,66%)]/5 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Última Avaliação Empresarial
              </CardTitle>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => navigate("/audit")}>
                <Eye className="w-3.5 h-3.5" /> Ver Análise Completa
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-card border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Empresa</p>
                <p className="text-sm font-semibold text-foreground">{lastAuditOverview.empresa}</p>
                <p className="text-xs text-muted-foreground">{lastAuditOverview.periodo}</p>
              </div>
              <div className="p-3 rounded-lg bg-card border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status Financeiro</p>
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${
                    lastAuditOverview.statusFinanceiro === "Saudável" ? "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)]" :
                    lastAuditOverview.statusFinanceiro === "Atenção" ? "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]" :
                    "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)]"
                  }`}>
                    {lastAuditOverview.statusFinanceiro === "Saudável" ? "🟢" : lastAuditOverview.statusFinanceiro === "Atenção" ? "🟡" : "🔴"} {lastAuditOverview.statusFinanceiro}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Score BEX: {lastAuditOverview.scoreRisco}/100</p>
              </div>
              <div className="p-3 rounded-lg bg-card border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Indicadores-Chave</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Liquidez Corrente</span>
                    <span className="font-mono font-bold text-foreground">{lastAuditOverview.indicadores.liquidezCorrente != null ? `${lastAuditOverview.indicadores.liquidezCorrente.toFixed(2)}x` : "—"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Endividamento</span>
                    <span className="font-mono font-bold text-foreground">{lastAuditOverview.indicadores.endividamento != null ? `${(lastAuditOverview.indicadores.endividamento * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Kanitz (FI)</span>
                    <span className="font-mono font-bold text-[hsl(142,76%,36%)]">{lastAuditOverview.indicadores.kanitz != null ? lastAuditOverview.indicadores.kanitz.toFixed(2) : "—"}</span>
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-card border border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Score de Risco</p>
                <div className="flex items-center gap-3">
                  <p className={`text-3xl font-bold ${
                    lastAuditOverview.scoreRisco <= 30 ? "text-[hsl(142,76%,36%)]" :
                    lastAuditOverview.scoreRisco <= 60 ? "text-[hsl(38,92%,50%)]" :
                    "text-[hsl(0,84%,60%)]"
                  }`}>{lastAuditOverview.scoreRisco}</p>
                  <div>
                    <p className="text-xs text-muted-foreground">de 100</p>
                    <Progress value={lastAuditOverview.scoreRisco} className="h-1.5 w-20" />
                  </div>
                </div>
              </div>
            </div>

            {/* Alertas IA */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-[hsl(38,92%,50%)]" /> Alertas IA
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {lastAuditOverview.alertasIA.map((alerta, i) => (
                  <div key={i} className={`border-l-4 rounded-lg p-3 ${severityStyle[alerta.severidade] || severityStyle.baixo}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-sm">{alerta.icone}</span>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{alerta.titulo}</p>
                        <p className="text-[10px] text-muted-foreground">{alerta.descricao}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Documentos", value: stats.totalDocuments, icon: FileText, color: "hsl(217,91%,50%)" },
            { label: "Auditorias", value: stats.totalAudits, icon: BarChart3, color: "hsl(200,98%,55%)" },
            { label: "Em Andamento", value: stats.auditsInProgress, icon: Clock, color: "hsl(38,92%,50%)" },
            { label: "Concluídas", value: stats.auditsCompleted, icon: CheckCircle2, color: "hsl(142,76%,36%)" },
            { label: "Pareceres", value: stats.opinionsIssued, icon: Award, color: "hsl(217,85%,45%)" },
          ].map((kpi) => (
            <Card key={kpi.label} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
                </div>
                <p className="text-2xl font-bold text-foreground">{kpi.value.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="indicators">Indicadores</TabsTrigger>
            <TabsTrigger value="trends">Tendências</TabsTrigger>
            <TabsTrigger value="alerts">Alertas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[hsl(142,76%,36%)]" /> Conformidade Geral
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-bold text-foreground">{stats.overallCompliance}%</span>
                    <span className="text-xs text-muted-foreground mb-1">média real</span>
                  </div>
                  <Progress value={stats.overallCompliance} className="h-2" />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Auditorias</p><p className="font-semibold text-foreground">{stats.totalAudits}</p></div>
                    <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Empresas</p><p className="font-semibold text-foreground">{stats.totalCompanies}</p></div>
                  </div>
                  {stats.overallCompliance === 0 && !loading && (
                    <p className="text-[11px] text-muted-foreground italic">Sem dados de conformidade ainda. Execute uma auditoria para popular os indicadores.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[hsl(38,92%,50%)]" /> Distribuição de Riscos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(stats.highRisk + stats.mediumRisk + stats.lowRisk) === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">Sem auditorias classificadas por risco.</div>
                  ) : (
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: "Baixo", value: stats.lowRisk, fill: "hsl(142,76%,36%)" },
                          { name: "Médio", value: stats.mediumRisk, fill: "hsl(38,92%,50%)" },
                          { name: "Alto", value: stats.highRisk, fill: "hsl(0,84%,60%)" },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,90%)" />
                          <XAxis dataKey="name" fontSize={12} />
                          <YAxis fontSize={12} allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                            {[{ fill: "hsl(142,76%,36%)" }, { fill: "hsl(38,92%,50%)" }, { fill: "hsl(0,84%,60%)" }].map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Áreas Críticas</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground italic">
                  Mapa de áreas críticas será gerado automaticamente a partir das próximas auditorias (necessário ≥ 3 relatórios concluídos).
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-[hsl(217,91%,50%)]/5 to-[hsl(200,98%,55%)]/5 border-[hsl(217,60%,70%)]/20">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)]/10 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">Insights da IA</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      A conformidade geral apresentou melhoria consistente nos últimos 6 meses (+6pp). Recomenda-se atenção especial à área de Reconhecimento de Receita (risco 92%) e Provisões e Contingências (risco 85%), que concentram 45% dos achados de alto risco.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="indicators" className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Conformidade Média", value: stats.overallCompliance, color: "hsl(142,76%,36%)" },
                { label: "Auditorias Concluídas", value: stats.auditsCompleted, color: "hsl(200,98%,55%)", suffix: "" },
                { label: "Em Andamento", value: stats.auditsInProgress, color: "hsl(217,91%,50%)", suffix: "" },
                { label: "Empresas Ativas", value: stats.totalCompanies, color: "hsl(38,92%,50%)", suffix: "" },
              ].map((ind: any) => (
                <Card key={ind.label}>
                  <CardContent className="p-5 text-center">
                    <p className="text-xs text-muted-foreground mb-2">{ind.label}</p>
                    <p className="text-3xl font-bold" style={{ color: ind.color }}>{ind.value}{ind.suffix === "" ? "" : "%"}</p>
                    <Progress value={Math.min(ind.value, 100)} className="h-1.5 mt-3" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Referências Normativas</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground italic">
                  As referências normativas (CPC, NBC TA, IFRS) serão indexadas automaticamente conforme os relatórios de auditoria forem gerados.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Tendência de Conformidade</CardTitle></CardHeader>
                <CardContent>
                  {stats.trend.length === 0 ? (
                    <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
                      Sem histórico suficiente. A tendência será exibida após o processamento de novos balancetes.
                    </div>
                  ) : (
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats.trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,90%)" />
                          <XAxis dataKey="month" fontSize={12} />
                          <YAxis fontSize={12} domain={[0, 100]} />
                          <Tooltip />
                          <Line type="monotone" dataKey="compliance" stroke="hsl(217,91%,50%)" strokeWidth={2} dot={{ r: 4 }} name="Quality %" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Distribuição de Auditorias</CardTitle></CardHeader>
                <CardContent>
                  {stats.auditDistribution.length === 0 ? (
                    <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">Sem auditorias registradas.</div>
                  ) : (
                    <>
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={stats.auditDistribution} cx="50%" cy="50%" outerRadius={100} dataKey="count" nameKey="type" label={({ percentage }: any) => `${percentage}%`} fontSize={11}>
                              {stats.auditDistribution.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap gap-3 justify-center mt-2">
                        {stats.auditDistribution.map((d, i) => (
                          <div key={d.type} className="flex items-center gap-1.5 text-xs">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                            <span className="text-muted-foreground">{d.type}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            {lastAuditOverview.alertasIA.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  Nenhum alerta inteligente registrado. Os alertas serão derivados automaticamente das próximas análises de auditoria.
                </CardContent>
              </Card>
            ) : (
              lastAuditOverview.alertasIA.map((alert, i) => {
                const sev = alert.severidade === "critico" || alert.severidade === "alto" ? "high" :
                            alert.severidade === "medio" ? "medium" : "low";
                return (
                  <Card key={i} className={`border-l-4 ${sev === "high" ? "border-l-[hsl(0,84%,60%)]" : sev === "medium" ? "border-l-[hsl(38,92%,50%)]" : "border-l-[hsl(200,98%,55%)]"}`}>
                    <CardContent className="p-4 flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${sev === "high" ? "text-[hsl(0,84%,60%)]" : sev === "medium" ? "text-[hsl(38,92%,50%)]" : "text-[hsl(200,98%,55%)]"}`} />
                        <div><p className="text-sm font-medium text-foreground">{alert.titulo}</p><p className="text-xs text-muted-foreground mt-0.5">{alert.descricao}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
};

export default Dashboard;
