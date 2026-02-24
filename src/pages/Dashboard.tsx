import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, CheckCircle2, Clock, Award, Plus, Download, TrendingUp, TrendingDown, AlertTriangle, Shield, BarChart3, Eye, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { mockStats, mockCompliance, mockRisks, mockNormativeReferences, mockCriticalAreas, mockTrendData, mockAuditDistribution } from "@/data/dashboardMockData";
import PlatformLayout from "@/components/PlatformLayout";

const COLORS = ["hsl(258,90%,66%)", "hsl(200,98%,55%)", "hsl(142,76%,36%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)"];

const Dashboard = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("6m");

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard do Auditor Chefe</h1>
            <p className="text-sm text-muted-foreground">Cockpit consolidado de auditorias</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
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
            <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white gap-1.5">
              <Plus className="w-4 h-4" /> Nova Auditoria
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Documentos", value: mockStats.totalDocuments, icon: FileText, color: "hsl(258,90%,66%)" },
            { label: "Auditorias", value: mockStats.totalAudits, icon: BarChart3, color: "hsl(200,98%,55%)" },
            { label: "Em Andamento", value: mockStats.auditsInProgress, icon: Clock, color: "hsl(38,92%,50%)" },
            { label: "Concluídas", value: mockStats.auditsCompleted, icon: CheckCircle2, color: "hsl(142,76%,36%)" },
            { label: "Pareceres", value: mockStats.opinionsIssued, icon: Award, color: "hsl(258,80%,55%)" },
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

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="indicators">Indicadores</TabsTrigger>
            <TabsTrigger value="trends">Tendências</TabsTrigger>
            <TabsTrigger value="alerts">Alertas</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Conformidade */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[hsl(142,76%,36%)]" />
                    Conformidade Geral
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-bold text-foreground">{mockCompliance.overallCompliance}%</span>
                    <span className="flex items-center gap-1 text-xs text-[hsl(142,76%,36%)] mb-1">
                      <TrendingUp className="w-3 h-3" /> +2.1%
                    </span>
                  </div>
                  <Progress value={mockCompliance.overallCompliance} className="h-2" />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Normas Aplicadas</p>
                      <p className="font-semibold text-foreground">{mockCompliance.normsApplied}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Desvios</p>
                      <p className="font-semibold text-[hsl(38,92%,50%)]">{mockCompliance.normsWithDeviations}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Riscos */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[hsl(38,92%,50%)]" />
                    Distribuição de Riscos
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
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(230,20%,90%)" />
                        <XAxis dataKey="name" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {[
                            { fill: "hsl(142,76%,36%)" },
                            { fill: "hsl(38,92%,50%)" },
                            { fill: "hsl(0,84%,60%)" },
                          ].map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Áreas Críticas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Áreas Críticas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockCriticalAreas.map((area) => (
                    <div key={area.name} className="flex items-center gap-3">
                      <span className="text-sm text-foreground w-48 shrink-0">{area.name}</span>
                      <Progress
                        value={area.riskLevel}
                        className="flex-1 h-2"
                      />
                      <Badge
                        variant={area.riskLevel >= 80 ? "destructive" : area.riskLevel >= 65 ? "secondary" : "outline"}
                        className="w-12 justify-center text-xs"
                      >
                        {area.riskLevel}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Insights IA */}
            <Card className="bg-gradient-to-r from-[hsl(258,90%,66%)]/5 to-[hsl(200,98%,55%)]/5 border-[hsl(258,60%,70%)]/20">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">Insights da IA</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      A conformidade geral apresentou melhoria consistente nos últimos 6 meses (+6pp). Recomenda-se atenção especial à área de Reconhecimento de Receita (risco 92%) e Provisões e Contingências (risco 85%), que concentram 45% dos achados de alto risco. O índice de consistência de 94.3% está acima da média setorial.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Indicadores */}
          <TabsContent value="indicators" className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Consistência", value: mockCompliance.consistencyIndex, color: "hsl(142,76%,36%)" },
                { label: "Reconhecimento", value: mockCompliance.recognition, color: "hsl(200,98%,55%)" },
                { label: "Mensuração", value: mockCompliance.measurement, color: "hsl(258,90%,66%)" },
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

            {/* Normas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Referências Normativas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mockNormativeReferences.slice(0, 8).map((norm) => (
                    <div key={norm.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">
                          {norm.type.toUpperCase()}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium text-foreground">{norm.code}</p>
                          <p className="text-xs text-muted-foreground">{norm.description}</p>
                        </div>
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

          {/* Tendências */}
          <TabsContent value="trends" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Tendência de Conformidade</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mockTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(230,20%,90%)" />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis fontSize={12} domain={[80, 95]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="compliance" stroke="hsl(258,90%,66%)" strokeWidth={2} dot={{ r: 4 }} name="Conformidade %" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Distribuição de Auditorias</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={mockAuditDistribution}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="count"
                          nameKey="type"
                          label={({ type, percentage }) => `${percentage}%`}
                          fontSize={11}
                        >
                          {mockAuditDistribution.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
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

          {/* Alertas */}
          <TabsContent value="alerts" className="space-y-4">
            {[
              { severity: "high", title: "Reconhecimento de Receita — CPC 47", desc: "3 auditorias com alto risco identificado nesta área. Revisão imediata recomendada.", time: "2h atrás" },
              { severity: "high", title: "Provisões insuficientes — CPC 25", desc: "Divergência material identificada em provisões trabalhistas em 2 entidades.", time: "5h atrás" },
              { severity: "medium", title: "Prazo de auditoria próximo", desc: "5 auditorias com prazo de entrega nos próximos 7 dias.", time: "1 dia atrás" },
              { severity: "medium", title: "Controles internos fragilizados", desc: "Área de contas a receber requer atenção em 4 auditorias.", time: "2 dias atrás" },
              { severity: "low", title: "Atualização normativa disponível", desc: "Nova revisão do CPC 06 publicada. Verificar impacto nas auditorias em curso.", time: "3 dias atrás" },
            ].map((alert, i) => (
              <Card key={i} className={`border-l-4 ${
                alert.severity === "high" ? "border-l-[hsl(0,84%,60%)]" :
                alert.severity === "medium" ? "border-l-[hsl(38,92%,50%)]" :
                "border-l-[hsl(200,98%,55%)]"
              }`}>
                <CardContent className="p-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                      alert.severity === "high" ? "text-[hsl(0,84%,60%)]" :
                      alert.severity === "medium" ? "text-[hsl(38,92%,50%)]" :
                      "text-[hsl(200,98%,55%)]"
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{alert.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{alert.desc}</p>
                    </div>
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
