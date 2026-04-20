import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useUser } from "@/contexts/UserContext";
import { FileText, CheckCircle2, Clock, Award, Plus, Download, TrendingUp, TrendingDown, AlertTriangle, Shield, BarChart3, Eye, Calculator, Building2, Activity, Scale, AlertOctagon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { mockStats, mockCompliance, mockRisks, mockNormativeReferences, mockCriticalAreas, mockTrendData, mockAuditDistribution } from "@/data/dashboardMockData";
import PlatformLayout from "@/components/PlatformLayout";
import CompanySelectorDialog from "@/components/CompanySelectorDialog";
import { listCompanies, type Company } from "@/services/companiesService";

const COLORS = ["hsl(217,91%,50%)", "hsl(200,98%,55%)", "hsl(142,76%,36%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)"];

/* ── Mock: Last Audit Overview ── */
const lastAuditOverview = {
  empresa: "Empresa Demonstração S.A.",
  periodo: "Exercício 2023",
  statusFinanceiro: "Atenção",
  scoreRisco: 47,
  indicadores: {
    liquidezCorrente: 1.78,
    endividamento: 0.445,
    kanitz: 1.24,
  },
  alertasIA: [
    { icone: "⚠", titulo: "Estoque elevado", descricao: "Estoques cresceram 45% acima do CMV", severidade: "medio" },
    { icone: "⚠", titulo: "Dependência factoring", descricao: "Antecipação de recebíveis identificada — fator de risco", severidade: "alto" },
    { icone: "⚠", titulo: "Passivo crescente", descricao: "Empréstimos LP cresceram 57% no período", severidade: "alto" },
    { icone: "📉", titulo: "Margem em deterioração", descricao: "Margem líquida caiu 60% no período analisado", severidade: "critico" },
  ],
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
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);

  useEffect(() => { listCompanies().then(setCompanies).catch(() => {}); }, []);

  const handleStartNewAudit = (company: Company) => navigate(`/audit?company=${company.id}`);

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
            <div className="relative">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setCompanyMenuOpen(v => !v)}>
                <Building2 className="w-4 h-4" /> Ver Empresa
              </Button>
              {companyMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-popover border border-border rounded-lg shadow-lg max-h-72 overflow-auto">
                  {companies.length === 0 ? (
                    <div className="p-3"><p className="text-xs text-muted-foreground">Nenhuma empresa cadastrada. Inicie uma nova auditoria para cadastrar.</p></div>
                  ) : companies.map(c => (
                    <button key={c.id} onClick={() => { setCompanyMenuOpen(false); navigate(`/empresa/${c.id}`); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0">
                      <p className="font-medium text-foreground truncate">{c.name}</p>
                      {c.cnpj && <p className="text-[11px] text-muted-foreground">{c.cnpj}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5" onClick={() => setSelectorOpen(true)}>
              <Plus className="w-4 h-4" /> Nova Auditoria
            </Button>
            {role === "coordenadora" && (
              <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5" onClick={() => navigate("/usuarios")}>
                <Plus className="w-4 h-4" /> Cadastrar Usuário
              </Button>
            )}
          </div>
        </div>
        <CompanySelectorDialog open={selectorOpen} onOpenChange={setSelectorOpen} onConfirm={handleStartNewAudit} />

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
                    <span className="font-mono font-bold text-foreground">{lastAuditOverview.indicadores.liquidezCorrente.toFixed(2)}x</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Endividamento</span>
                    <span className="font-mono font-bold text-foreground">{(lastAuditOverview.indicadores.endividamento * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Kanitz (FI)</span>
                    <span className="font-mono font-bold text-[hsl(142,76%,36%)]">{lastAuditOverview.indicadores.kanitz.toFixed(2)}</span>
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
            { label: "Documentos", value: mockStats.totalDocuments, icon: FileText, color: "hsl(217,91%,50%)" },
            { label: "Auditorias", value: mockStats.totalAudits, icon: BarChart3, color: "hsl(200,98%,55%)" },
            { label: "Em Andamento", value: mockStats.auditsInProgress, icon: Clock, color: "hsl(38,92%,50%)" },
            { label: "Concluídas", value: mockStats.auditsCompleted, icon: CheckCircle2, color: "hsl(142,76%,36%)" },
            { label: "Pareceres", value: mockStats.opinionsIssued, icon: Award, color: "hsl(217,85%,45%)" },
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
                    <span className="text-4xl font-bold text-foreground">{mockCompliance.overallCompliance}%</span>
                    <span className="flex items-center gap-1 text-xs text-[hsl(142,76%,36%)] mb-1"><TrendingUp className="w-3 h-3" /> +2.1%</span>
                  </div>
                  <Progress value={mockCompliance.overallCompliance} className="h-2" />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Normas Aplicadas</p><p className="font-semibold text-foreground">{mockCompliance.normsApplied}</p></div>
                    <div className="p-3 rounded-lg bg-muted/50"><p className="text-xs text-muted-foreground">Desvios</p><p className="font-semibold text-[hsl(38,92%,50%)]">{mockCompliance.normsWithDeviations}</p></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[hsl(38,92%,50%)]" /> Distribuição de Riscos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: "Baixo", value: mockRisks.lowRisk, fill: "hsl(142,76%,36%)" },
                        { name: "Médio", value: mockRisks.mediumRisk, fill: "hsl(38,92%,50%)" },
                        { name: "Alto", value: mockRisks.highRisk, fill: "hsl(0,84%,60%)" },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,90%)" />
                        <XAxis dataKey="name" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {[{ fill: "hsl(142,76%,36%)" }, { fill: "hsl(38,92%,50%)" }, { fill: "hsl(0,84%,60%)" }].map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Áreas Críticas</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockCriticalAreas.map((area) => (
                    <div key={area.name} className="flex items-center gap-3">
                      <span className="text-sm text-foreground w-48 shrink-0">{area.name}</span>
                      <Progress value={area.riskLevel} className="flex-1 h-2" />
                      <Badge variant={area.riskLevel >= 80 ? "destructive" : area.riskLevel >= 65 ? "secondary" : "outline"} className="w-12 justify-center text-xs">{area.riskLevel}%</Badge>
                    </div>
                  ))}
                </div>
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
                { label: "Consistência", value: mockCompliance.consistencyIndex, color: "hsl(142,76%,36%)" },
                { label: "Reconhecimento", value: mockCompliance.recognition, color: "hsl(200,98%,55%)" },
                { label: "Mensuração", value: mockCompliance.measurement, color: "hsl(217,91%,50%)" },
                { label: "Evidenciação", value: mockCompliance.disclosure, color: "hsl(38,92%,50%)" },
              ].map((ind) => (
                <Card key={ind.label}>
                  <CardContent className="p-5 text-center">
                    <p className="text-xs text-muted-foreground mb-2">{ind.label}</p>
                    <p className="text-3xl font-bold" style={{ color: ind.color }}>{ind.value}%</p>
                    <Progress value={ind.value} className="h-1.5 mt-3" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Referências Normativas</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mockNormativeReferences.slice(0, 8).map((norm) => (
                    <div key={norm.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">{norm.type.toUpperCase()}</Badge>
                        <div><p className="text-sm font-medium text-foreground">{norm.code}</p><p className="text-xs text-muted-foreground">{norm.description}</p></div>
                      </div>
                      <div className="text-right text-xs">
                        <p className="text-muted-foreground">{norm.auditsImpacted} auditorias</p>
                        <p className="text-[hsl(38,92%,50%)]">{norm.findingsRelated} achados</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Tendência de Conformidade</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mockTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,90%)" />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis fontSize={12} domain={[80, 95]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="compliance" stroke="hsl(217,91%,50%)" strokeWidth={2} dot={{ r: 4 }} name="Conformidade %" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Distribuição de Auditorias</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={mockAuditDistribution} cx="50%" cy="50%" outerRadius={100} dataKey="count" nameKey="type" label={({ type, percentage }) => `${percentage}%`} fontSize={11}>
                          {mockAuditDistribution.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center mt-2">
                    {mockAuditDistribution.map((d, i) => (
                      <div key={d.type} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                        <span className="text-muted-foreground">{d.type}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            {[
              { severity: "high", title: "Reconhecimento de Receita — CPC 47", desc: "3 auditorias com alto risco identificado nesta área.", time: "2h atrás" },
              { severity: "high", title: "Provisões insuficientes — CPC 25", desc: "Divergência material identificada em provisões trabalhistas.", time: "5h atrás" },
              { severity: "medium", title: "Prazo de auditoria próximo", desc: "5 auditorias com prazo nos próximos 7 dias.", time: "1 dia atrás" },
              { severity: "medium", title: "Controles internos fragilizados", desc: "Área de contas a receber requer atenção.", time: "2 dias atrás" },
              { severity: "low", title: "Atualização normativa disponível", desc: "Nova revisão do CPC 06 publicada.", time: "3 dias atrás" },
            ].map((alert, i) => (
              <Card key={i} className={`border-l-4 ${alert.severity === "high" ? "border-l-[hsl(0,84%,60%)]" : alert.severity === "medium" ? "border-l-[hsl(38,92%,50%)]" : "border-l-[hsl(200,98%,55%)]"}`}>
                <CardContent className="p-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${alert.severity === "high" ? "text-[hsl(0,84%,60%)]" : alert.severity === "medium" ? "text-[hsl(38,92%,50%)]" : "text-[hsl(200,98%,55%)]"}`} />
                    <div><p className="text-sm font-medium text-foreground">{alert.title}</p><p className="text-xs text-muted-foreground mt-0.5">{alert.desc}</p></div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{alert.time}</span>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
};

export default Dashboard;
