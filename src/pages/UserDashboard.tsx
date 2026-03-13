import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, CheckCircle2, Clock, AlertTriangle, Plus, Eye, TrendingUp, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import PlatformLayout from "@/components/PlatformLayout";
import { getAuditHistory, clearAuditHistory, type AuditHistoryEntry } from "@/services/auditHistoryService";

const statusConfig = {
  completed: { label: "Concluída", className: "bg-[hsl(142,76%,36%)]/20 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30" },
  in_progress: { label: "Em Andamento", className: "bg-[hsl(38,92%,50%)]/20 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30" },
  pending: { label: "Pendente", className: "" },
};

const riskBadge: Record<string, { className: string; label: string }> = {
  baixo: { className: "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30", label: "Baixo" },
  moderado: { className: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30", label: "Moderado" },
  elevado: { className: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-[hsl(0,84%,60%)]/30", label: "Elevado" },
  critico: { className: "bg-[hsl(0,0%,20%)]/15 text-[hsl(0,0%,20%)] border-[hsl(0,0%,20%)]/30", label: "Crítico" },
};

const UserDashboard = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getAuditHistory());
  }, []);

  const completed = history.filter(h => h.status === "completed").length;
  const inProgress = history.filter(h => h.status === "in_progress").length;
  const pending = history.filter(h => h.status === "pending").length;
  const totalRiscos = history.reduce((sum, h) => sum + h.riscos, 0);
  const avgConformidade = history.length > 0
    ? Math.round(history.reduce((sum, h) => sum + h.conformidade, 0) / history.length * 10) / 10
    : 0;

  const kpis = [
    { label: "Total de Auditorias", value: history.length, icon: FileText, bgClass: "bg-[hsl(217,91%,50%)]/10", colorClass: "text-[hsl(217,91%,50%)]" },
    { label: "Concluídas", value: completed, icon: CheckCircle2, bgClass: "bg-[hsl(142,76%,36%)]/10", colorClass: "text-[hsl(142,76%,36%)]" },
    { label: "Em Andamento", value: inProgress, icon: Clock, bgClass: "bg-[hsl(38,92%,50%)]/10", colorClass: "text-[hsl(38,92%,50%)]" },
    { label: "Achados Totais", value: totalRiscos, icon: AlertTriangle, bgClass: "bg-[hsl(0,84%,60%)]/10", colorClass: "text-[hsl(0,84%,60%)]" },
  ];

  const handleClear = () => {
    clearAuditHistory();
    setHistory([]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

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
            className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5"
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[hsl(217,91%,50%)]" />
                    <CardTitle className="text-lg">Documentos Analisados</CardTitle>
                  </div>
                  {history.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground gap-1">
                      <Trash2 className="w-3 h-3" /> Limpar
                    </Button>
                  )}
                </div>
                <CardDescription>
                  {history.length > 0
                    ? `${history.length} documento${history.length > 1 ? "s" : ""} processado${history.length > 1 ? "s" : ""} na auditoria`
                    : "Nenhum documento analisado ainda. Inicie uma nova auditoria."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">Nenhum documento encontrado</p>
                    <Button size="sm" onClick={() => navigate("/audit")} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5">
                      <Plus className="w-4 h-4" /> Iniciar Auditoria
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((audit) => {
                      const rb = riskBadge[audit.riskLevel] || riskBadge.moderado;
                      return (
                        <div
                          key={audit.id}
                          className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
                          onClick={() => navigate("/audit")}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="text-sm font-medium text-foreground truncate">{audit.fileName}</p>
                              <Badge className={`text-xs border shrink-0 ${statusConfig[audit.status].className}`}>
                                {statusConfig[audit.status].label}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] shrink-0">{audit.format}</Badge>
                              <Badge className={`text-[10px] border shrink-0 ${rb.className}`}>Risco: {rb.label}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{audit.date}</span>
                              <span>{formatFileSize(audit.fileSize)}</span>
                              <span className="flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" /> {audit.conformidade}%
                              </span>
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> {audit.riscos} pendências
                              </span>
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
                      );
                    })}
                  </div>
                )}
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
                  <p className="text-4xl font-bold text-[hsl(217,91%,50%)]">{avgConformidade}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Conformidade Geral</p>
                  <Progress value={avgConformidade} className="h-2 mt-3" />
                </div>
                <div className="border-t border-border/50 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Concluídas</span>
                    <span className="font-medium text-[hsl(142,76%,36%)]">{completed}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Em Andamento</span>
                    <span className="font-medium text-[hsl(38,92%,50%)]">{inProgress}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pendentes</span>
                    <span className="font-medium text-muted-foreground">{pending}</span>
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
                <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={() => navigate("/audit")}>
                  <Eye className="w-4 h-4" /> Ver Última Auditoria
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
