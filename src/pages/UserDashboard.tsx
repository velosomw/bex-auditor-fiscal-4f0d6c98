import { useNavigate } from "react-router-dom";
import { FileText, CheckCircle2, Clock, AlertTriangle, Plus, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { mockUserAudits } from "@/data/dashboardMockData";
import PlatformLayout from "@/components/PlatformLayout";

const UserDashboard = () => {
  const navigate = useNavigate();

  const completed = mockUserAudits.filter(a => a.status === "completed").length;
  const inProgress = mockUserAudits.filter(a => a.status === "in_progress").length;
  const totalFindings = mockUserAudits.reduce((sum, a) => sum + a.riscos, 0);
  const avgConformidade = Math.round(
    mockUserAudits.filter(a => a.conformidade > 0).reduce((sum, a) => sum + a.conformidade, 0) /
    mockUserAudits.filter(a => a.conformidade > 0).length
  );

  return (
    <PlatformLayout>
      <div className="max-w-[1200px] mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Minha Área de Auditoria</h1>
            <p className="text-sm text-muted-foreground">Gerencie suas auditorias e documentos</p>
          </div>
          <Button
            onClick={() => navigate("/audit")}
            className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nova Auditoria
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Auditorias", value: mockUserAudits.length, icon: FileText, color: "hsl(258,90%,66%)" },
            { label: "Concluídas", value: completed, icon: CheckCircle2, color: "hsl(142,76%,36%)" },
            { label: "Em Andamento", value: inProgress, icon: Clock, color: "hsl(38,92%,50%)" },
            { label: "Achados Totais", value: totalFindings, icon: AlertTriangle, color: "hsl(0,84%,60%)" },
          ].map((kpi) => (
            <Card key={kpi.label} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
                </div>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Audit List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Documentos Analisados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mockUserAudits.map((audit) => (
                    <div
                      key={audit.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate("/audit")}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          audit.status === "completed" ? "bg-[hsl(142,76%,36%)]" :
                          audit.status === "in_progress" ? "bg-[hsl(38,92%,50%)]" :
                          "bg-muted-foreground"
                        }`} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{audit.name}</p>
                          <p className="text-xs text-muted-foreground">{audit.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {audit.conformidade > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <Progress value={audit.conformidade} className="w-16 h-1.5" />
                            <span className="text-muted-foreground w-8 text-right">{audit.conformidade}%</span>
                          </div>
                        )}
                        <Badge variant={
                          audit.status === "completed" ? "default" :
                          audit.status === "in_progress" ? "secondary" : "outline"
                        } className="text-xs">
                          {audit.status === "completed" ? "✅" : audit.status === "in_progress" ? "🔄" : "⏳"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resumo de Conformidade</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-4xl font-bold text-[hsl(258,90%,66%)]">{avgConformidade}%</p>
                <p className="text-xs text-muted-foreground mt-1">Média de conformidade</p>
                <Progress value={avgConformidade} className="h-2 mt-4" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ações Rápidas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-sm"
                  onClick={() => navigate("/audit")}
                >
                  <Plus className="w-4 h-4" /> Iniciar Nova Auditoria
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2 text-sm">
                  <Eye className="w-4 h-4" /> Ver Relatórios
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2 text-sm">
                  <FileText className="w-4 h-4" /> Exportar Dados
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PlatformLayout>
  );
};

export default UserDashboard;
