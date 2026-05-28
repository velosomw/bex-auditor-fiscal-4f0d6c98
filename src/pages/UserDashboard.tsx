import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, CheckCircle2, Clock, AlertTriangle, Plus, Eye, TrendingUp, Trash2, ChevronsRight, Building2, Crown, Rocket, User as UserIcon, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import PlatformLayout from "@/components/PlatformLayout";
import CompanySelectorDialog from "@/components/CompanySelectorDialog";
import {
  getAuditHistory,
  getGeneratedReports,
  clearAuditHistory,
  hydrateFromRemote,
  type AuditHistoryEntry,
  type GeneratedReportEntry,
} from "@/services/auditHistoryService";
import { listCompanies, type Company } from "@/services/companiesService";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";

const statusConfig = {
  completed: { label: "Concluída", className: "bg-[hsl(142,76%,36%)]/20 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30" },
  in_progress: { label: "Em Andamento", className: "bg-[hsl(38,92%,50%)]/20 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30" },
  pending: { label: "Pendente", className: "" },
};

const riskBadge: Record<string, { className: string; label: string }> = {
  baixo: { className: "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30", label: "Baixo" },
  moderado: { className: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30", label: "Moderado" },
  elevado: { className: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-[hsl(0,84%,60%)]/30", label: "Elevado" },
  critico: { className: "bg-[hsl(0,0%,20%)]/15 text-foreground border-border", label: "Crítico" },
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const DocCard = ({
  title,
  status,
  format,
  riskLevel,
  date,
  size,
  conformidade,
  riscos,
  onClick,
}: {
  title: string;
  status: keyof typeof statusConfig;
  format: string;
  riskLevel: string;
  date: string;
  size: number;
  conformidade: number;
  riscos: number;
  onClick?: () => void;
}) => {
  const rb = riskBadge[riskLevel] || riskBadge.moderado;
  return (
    <div
      onClick={onClick}
      className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{title}</p>
        <Badge className={`text-xs border shrink-0 ${statusConfig[status].className}`}>
          {statusConfig[status].label}
        </Badge>
        <Badge variant="outline" className="text-[10px] shrink-0">{format}</Badge>
        <Badge className={`text-[10px] border shrink-0 ${rb.className}`}>Risco: {rb.label}</Badge>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span>{date}</span>
        <span>{formatFileSize(size)}</span>
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> {conformidade}%
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {riscos} pendências
        </span>
      </div>
    </div>
  );
};

const UserDashboard = () => {
  const navigate = useNavigate();
  const { isReadOnly, supabaseUser } = useUser();
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);
  const [reports, setReports] = useState<GeneratedReportEntry[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [profilePending, setProfilePending] = useState(false);

  useEffect(() => {
    hydrateFromRemote().finally(() => {
      setHistory(getAuditHistory());
      setReports(getGeneratedReports());
    });
    listCompanies({ ownedOnly: true }).then(setCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabaseUser) return;
    supabase
      .from("profiles")
      .select("profile_required, profile_completed_at")
      .eq("user_id", supabaseUser.id)
      .maybeSingle()
      .then(({ data }) => {
        const d = data as any;
        if (d && d.profile_required && !d.profile_completed_at) setProfilePending(true);
      });
  }, [supabaseUser]);

  const handleStartNewAudit = (company: Company) => {
    navigate(`/audit?company=${company.id}`);
  };

  const completed = history.filter(h => h.status === "completed").length;
  const inProgress = history.filter(h => h.status === "in_progress").length;
  const pending = history.filter(h => h.status === "pending").length;
  const totalRiscos = history.reduce((sum, h) => sum + h.riscos, 0);

  // Índice de Conformidade IA (Balancete → BEx/Kanitz)
  // 1) Extração IA do balancete: média de conformidade dos documentos analisados
  // 2) Tratamento IA → Relatório: média de conformidade dos relatórios BEx/Kanitz/Completo gerados
  const docsAnalisados = history.filter(h => (h.conformidade ?? 0) > 0);
  const extracaoBalancete = docsAnalisados.length > 0
    ? Math.round(docsAnalisados.reduce((s, h) => s + (h.conformidade ?? 0), 0) / docsAnalisados.length * 10) / 10
    : 0;
  const relatoriosIA = reports.filter(r => (r.conformidade ?? 0) > 0);
  const tratamentoRelatorio = relatoriosIA.length > 0
    ? Math.round(relatoriosIA.reduce((s, r) => s + (r.conformidade ?? 0), 0) / relatoriosIA.length * 10) / 10
    : 0;
  // Composto: 50% extração + 50% geração de relatório (só pondera o lado que existe)
  const partes = [extracaoBalancete, tratamentoRelatorio].filter(v => v > 0);
  const avgConformidade = partes.length > 0
    ? Math.round(partes.reduce((a, b) => a + b, 0) / partes.length * 10) / 10
    : 0;

  // Agrupa documentos por batchId; documentos sem batch ficam em "orfãos"
  const docsByBatch = new Map<string, AuditHistoryEntry[]>();
  const orphanDocs: AuditHistoryEntry[] = [];
  history.forEach(d => {
    if (d.batchId) {
      const arr = docsByBatch.get(d.batchId) || [];
      arr.push(d);
      docsByBatch.set(d.batchId, arr);
    } else {
      orphanDocs.push(d);
    }
  });

  // Constrói pares (relatório → documentos correspondentes)
  type ReportGroup = {
    report: GeneratedReportEntry;
    docs: AuditHistoryEntry[] | { fileName: string; fileSize: number; format: string; date: string }[];
  };
  // Mostra apenas o ÚLTIMO par documento↔relatório no dashboard.
  // Histórico completo fica em /user/empresas.
  const dedupeDocs = (arr: any[]): any[] => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const d of arr) {
      const key = `${d.fileName || ""}|${d.fileSize ?? ""}|${(d.periodos || []).join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
    return out;
  };
  const groups: ReportGroup[] = reports.slice(0, 1).map(r => {
    let docs: any[] = [];
    if (r.batchId && docsByBatch.has(r.batchId)) {
      docs = docsByBatch.get(r.batchId)!;
    } else if (r.sourceDocuments && r.sourceDocuments.length) {
      docs = r.sourceDocuments.map(s => ({ ...s, date: r.date }));
    }
    return { report: r, docs: dedupeDocs(docs) };
  });


  // Apenas o ÚLTIMO documento sem relatório gerado.
  const usedBatchIds = new Set(reports.map(r => r.batchId).filter(Boolean) as string[]);
  const unmatchedDocs = [
    ...Array.from(docsByBatch.entries())
      .filter(([bid]) => !usedBatchIds.has(bid))
      .flatMap(([, docs]) => docs),
    ...orphanDocs,
  ].slice(0, 1);

  const hasMoreHistory = reports.length > 1 || (
    [...Array.from(docsByBatch.entries()).filter(([bid]) => !usedBatchIds.has(bid)).flatMap(([, docs]) => docs), ...orphanDocs].length > 1
  );

  const kpis = [
    { label: "Total de Auditorias", value: history.length, icon: FileText, bgClass: "bg-[hsl(217,91%,50%)]/10", colorClass: "text-[hsl(217,91%,50%)]" },
    { label: "Concluídas", value: completed, icon: CheckCircle2, bgClass: "bg-[hsl(142,76%,36%)]/10", colorClass: "text-[hsl(142,76%,36%)]" },
    { label: "Em Andamento", value: inProgress, icon: Clock, bgClass: "bg-[hsl(38,92%,50%)]/10", colorClass: "text-[hsl(38,92%,50%)]" },
    { label: "Achados Totais", value: totalRiscos, icon: AlertTriangle, bgClass: "bg-[hsl(0,84%,60%)]/10", colorClass: "text-[hsl(0,84%,60%)]" },
  ];

  const handleClear = () => {
    clearAuditHistory();
    setHistory([]);
    setReports([]);
  };

  const hasGroups = groups.length > 0;

  return (
    <PlatformLayout>
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        {profilePending && (
          <div className="flex items-center justify-between gap-3 flex-wrap p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-800">Finalize seu cadastro</p>
                <p className="text-amber-700 text-xs">Complete os dados da empresa em Perfil para liberar todos os recursos da plataforma.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate("/perfil")} className="bg-amber-600 hover:bg-amber-700 text-white">
              Atualizar
            </Button>
          </div>
        )}
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Minha Área de Auditoria</h1>
            <p className="text-muted-foreground">Resumo das suas auditorias e documentos analisados</p>
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <>
                <Button
                  size="sm"
                  onClick={() => navigate("/user/empresas")}
                  className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Nova Auditoria
                </Button>
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => navigate("/minha-assinatura?upgrade=enterprise")}
                  className="gap-1.5"
                >
                  <Rocket className="w-4 h-4" /> Avançar meu negócio
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Inline ações rápidas */}
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/perfil")} className="gap-1.5">
            <UserIcon className="w-4 h-4" /> Perfil
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/user/empresas")} className="gap-1.5">
            <Building2 className="w-4 h-4" /> Visualizar Empresas
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/minha-assinatura")} className="gap-1.5">
            <Crown className="w-4 h-4" /> Minha Assinatura
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

        {/* Section header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Última Auditoria — Documentos & Relatório Correspondente</h2>
            <p className="text-xs text-muted-foreground">
              Exibimos apenas a auditoria mais recente. Para visualizar o histórico completo, acesse{" "}
              <button onClick={() => navigate("/user/empresas")} className="text-[hsl(217,91%,50%)] hover:underline font-medium">
                Empresas → Histórico de Relatórios
              </button>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasMoreHistory && (
              <Button variant="outline" size="sm" onClick={() => navigate("/user/empresas")} className="gap-1.5 text-xs">
                <Building2 className="w-3.5 h-3.5" /> Ver histórico completo
              </Button>
            )}
            {history.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground gap-1">
                <Trash2 className="w-3 h-3" /> Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Pares: Documentos Analisados ↔ Relatório Gerado */}
        {!hasGroups && unmatchedDocs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma auditoria encontrada. Clique em "Nova Auditoria" para começar.</p>
            </CardContent>
          </Card>
        ) : (
                          {`${docs.length}:1 (${docs.length > 1 ? "docs" : "doc"} → relatório)`}


            {groups.map(({ report, docs }) => {
              const rb = riskBadge[report.riskLevel] || riskBadge.moderado;
              return (
                <div key={report.id} className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
                  {/* Documentos analisados */}
                  <Card className="border-l-4 border-l-[hsl(217,91%,50%)]">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                        <CardTitle className="text-sm">Documentos Analisados</CardTitle>
                        <Badge variant="outline" className="text-[10px] ml-auto">
                          {docs.length} doc{docs.length > 1 ? "s" : ""} → 1 relatório
                        </Badge>
                      </div>
                      <CardDescription className="text-[11px]">
                        Arquivos carregados e processados nesta auditoria
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {docs.map((d: any, idx: number) => (
                        <div
                          key={(d.id || d.fileName) + idx}
                          onClick={() => navigate("/audit")}
                          className="p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer flex items-start gap-3"
                        >
                          <div className="w-6 h-6 rounded-full bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="text-xs font-medium text-foreground truncate flex-1 min-w-0">{d.fileName}</p>
                              <Badge variant="outline" className="text-[10px] shrink-0">{d.format}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                              <span>{d.date}</span>
                              <span>{formatFileSize(d.fileSize)}</span>
                              {d.periodos && d.periodos.length > 0 && (
                                <span className="flex items-center gap-1 text-[hsl(217,91%,50%)] font-medium">
                                  • {d.periodos.length} períodos: {d.periodos.join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Conector visual */}
                  <div className="hidden lg:flex items-center justify-center px-2">
                    <div className="flex flex-col items-center gap-1">
                      <ChevronsRight className="w-6 h-6 text-[hsl(217,91%,50%)]" />
                      <span className="text-[10px] text-muted-foreground font-medium">gera</span>
                    </div>
                  </div>

                  {/* Relatório gerado */}
                  <Card
                    className="border-l-4 border-l-[hsl(258,90%,66%)] cursor-pointer hover:bg-muted/20 transition-colors group"
                    onClick={() => navigate(`/user/report/${report.id}`)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                        <CardTitle className="text-sm">Relatório Gerado</CardTitle>
                        <Badge className={`text-[10px] border ml-auto ${statusConfig.completed.className}`}>Concluído</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="p-3 rounded-md bg-muted/30">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <p className="text-xs font-medium text-foreground truncate flex-1 min-w-0">{report.title}</p>
                          <Badge variant="outline" className="text-[10px] shrink-0">{report.format}</Badge>
                          <Badge className={`text-[10px] border shrink-0 ${rb.className}`}>Risco: {rb.label}</Badge>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span>{report.date}</span>
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" /> {report.conformidade}%
                            </span>
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {report.riscos} pendências
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-[hsl(258,90%,66%)] opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye className="w-3 h-3" /> Visualizar
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}

            {/* Documentos sem relatório gerado */}
            {unmatchedDocs.length > 0 && (
              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm">Documentos Analisados sem Relatório</CardTitle>
                    <Badge variant="outline" className="text-[10px] ml-auto">aguardando geração</Badge>
                  </div>
                  <CardDescription className="text-xs">Documentos analisados que ainda não originaram um relatório.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {unmatchedDocs.map(d => (
                    <div
                      key={d.id}
                      onClick={() => navigate("/audit")}
                      className="p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-xs font-medium text-foreground truncate flex-1 min-w-0">{d.fileName}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">{d.format}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{d.date}</span>
                        <span>{formatFileSize(d.fileSize)}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Resumo de Conformidade */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Resumo de Conformidade</CardTitle>
              <CardDescription>
                Conformidade IA consolidada da empresa (balancete → relatório BEx / Kanitz)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Conformidade IA", value: avgConformidade },
                        { name: "Restante", value: Math.max(0, 100 - avgConformidade) },
                      ]}
                      dataKey="value"
                      innerRadius={60}
                      outerRadius={90}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      <Cell fill="hsl(217,91%,50%)" />
                      <Cell fill="hsl(var(--muted))" />
                    </Pie>
                    <Tooltip
                      formatter={(v: number, n: string) => [`${v}%`, n]}
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-3xl font-bold text-[hsl(217,91%,50%)]">{avgConformidade}%</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Conformidade IA</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Conformidade por Documento */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[hsl(258,90%,66%)]" />
                <CardTitle className="text-base">Conformidade por Documento</CardTitle>
              </div>
              <CardDescription>Mesmo índice, específico por auditoria de documento realizada</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum documento analisado</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {history.slice(0, 6).map((d) => {
                    const conf = d.conformidade ?? 0;
                    return (
                      <div key={d.id} className="p-3 rounded-lg bg-muted/30 flex flex-col items-center">
                        <div className="relative w-[110px] h-[110px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: "Conformidade", value: conf },
                                  { name: "Restante", value: Math.max(0, 100 - conf) },
                                ]}
                                dataKey="value"
                                innerRadius={36}
                                outerRadius={52}
                                startAngle={90}
                                endAngle={-270}
                                stroke="none"
                              >
                                <Cell fill="hsl(258,90%,66%)" />
                                <Cell fill="hsl(var(--muted))" />
                              </Pie>
                              <Tooltip
                                formatter={(v: number, n: string) => [`${v}%`, n]}
                                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <p className="text-lg font-bold text-[hsl(258,90%,66%)]">{conf}%</p>
                          </div>
                        </div>
                        <p className="text-[11px] font-medium text-foreground truncate w-full text-center mt-2" title={d.fileName}>
                          {d.fileName}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{d.date}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </PlatformLayout>
  );
};

export default UserDashboard;
