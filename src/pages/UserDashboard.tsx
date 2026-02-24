import { useNavigate } from "react-router-dom";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Eye,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import PlatformLayout from "@/components/PlatformLayout";

// Mock data inline per blueprint
const userStats = {
  totalAudits: 12,
  completed: 8,
  inProgress: 3,
  pending: 1,
  avgConformidade: 89.5,
  totalFindings: 34,
};

const userAudits = [
  { id: "1", name: "Demonstrações Financeiras Q4 2024", status: "completed" as const, date: "2024-01-15", conformidade: 92, riscos: 3 },
  { id: "2", name: "Balanço Patrimonial Anual", status: "completed" as const, date: "2024-01-10", conformidade: 88, riscos: 5 },
  { id: "3", name: "DRE Consolidado", status: "in_progress" as const, date: "2024-01-18", conformidade: 45, riscos: 2 },
  { id: "4", name: "Notas Explicativas", status: "pending" as const, date: "2024-01-20", conformidade: 0, riscos: 0 },
];

const statusConfig = {
  completed: { label: "Concluída", className: "bg-[hsl(142,76%,36%)]/20 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30" },
  in_progress: { label: "Em Andamento", className: "bg-[hsl(38,92%,50%)]/20 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30" },
  pending: { label: "Pendente", className: "" },
};

const kpis = [
  { label: "Total de Auditorias", value: userStats.totalAudits, icon: FileText, bgClass: "bg-[hsl(258,90%,66%)]/10", colorClass: "text-[hsl(258,90%,66%)]" },
  { label: "Concluídas", value: userStats.completed, icon: CheckCircle2, bgClass: "bg-[hsl(142,76%,36%)]/10", colorClass: "text-[hsl(142,76%,36%)]" },
  { label: "Em Andamento", value: userStats.inProgress, icon: Clock, bgClass: "bg-[hsl(38,92%,50%)]/10", colorClass: "text-[hsl(38,92%,50%)]" },
  { label: "Achados Totais", value: userStats.totalFindings, icon: AlertTriangle, bgClass: "bg-[hsl(0,84%,60%)]/10", colorClass: "text-[hsl(0,84%,60%)]" },
];

const UserDashboard = () => {
  const navigate = useNavigate();

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Minha Área de Auditoria</h1>
            <p className="text-muted-foreground">Resumo das suas auditorias e documentos analisados</p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/audit")}
            className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nova Auditoria
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${kpi.bgClass}`}>
                    <kpi.icon className={`w-4 h-4 ${kpi.colorClass}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Documentos Analisados */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[hsl(258,90%,66%)]" />
                  <CardTitle className="text-lg">Documentos Analisados</CardTitle>
                </div>
                <CardDescription>Suas auditorias recentes e status de análise</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {userAudits.map((audit) => (
                    <div
                      key={audit.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
                      onClick={() => navigate("/audit")}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-foreground truncate">{audit.name}</p>
                          {audit.status === "pending" ? (
                            <Badge variant="outline" className="text-xs shrink-0">{statusConfig[audit.status].label}</Badge>
                          ) : (
                            <Badge className={`text-xs border shrink-0 ${statusConfig[audit.status].className}`}>
                              {statusConfig[audit.status].label}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{audit.date}</span>
                          {audit.status !== "pending" && (
                            <>
                              <span className="flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" /> {audit.conformidade}%
                              </span>
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> {audit.riscos} riscos
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                        onClick={(e) => { e.stopPropagation(); navigate("/audit"); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Resumo de Conformidade */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo de Conformidade</CardTitle>
                <CardDescription>Índice médio das suas auditorias</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-4">
                  <p className="text-4xl font-bold text-[hsl(258,90%,66%)]">{userStats.avgConformidade}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Conformidade Geral</p>
                  <Progress value={userStats.avgConformidade} className="h-2 mt-3" />
                </div>
                <div className="border-t border-border/50 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Concluídas</span>
                    <span className="font-medium text-[hsl(142,76%,36%)]">{userStats.completed}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Em Andamento</span>
                    <span className="font-medium text-[hsl(38,92%,50%)]">{userStats.inProgress}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pendentes</span>
                    <span className="font-medium text-muted-foreground">{userStats.pending}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ações Rápidas */}
            <Card>
              <CardHeader>
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
                  <Eye className="w-4 h-4" /> Ver Todos os Documentos
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
