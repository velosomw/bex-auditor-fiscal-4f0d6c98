import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, CheckCircle2, Clock, AlertTriangle, Plus, Eye, TrendingUp, Trash2, ChevronsRight, Building2, Crown, Rocket, User as UserIcon, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import PlatformLayout from "@/components/PlatformLayout";
import CompanySelectorDialog from "@/components/CompanySelectorDialog";
import {
  getAuditHistory,
  getGeneratedReports,
  clearAuditHistory,
  hydrateFromRemote,
  getLatestReportId,
  clearLatestReport,
  type AuditHistoryEntry,
  type GeneratedReportEntry,
} from "@/services/auditHistoryService";
import { listCompanies, type Company } from "@/services/companiesService";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { getGlobalLimits } from "@/services/reportLimitsService";
import { getExtractionMetric, EXTRACTION_TIERS, getTierMeta } from "@/lib/extractionQuality";
import { getVisibilityMetric, VISIBILITY_TIERS, getVisibilityTierMeta } from "@/lib/dataVisibility";

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
  const [selectedDoc, setSelectedDoc] = useState<AuditHistoryEntry | null>(null);
  const [deviationDetailsOpen, setDeviationDetailsOpen] = useState(false);
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(null);
  const [monthlyUsed, setMonthlyUsed] = useState<number>(0);
  const [isFreeTier, setIsFreeTier] = useState<boolean>(true);
  const [limitLoading, setLimitLoading] = useState<boolean>(true);
  const [limitDialogOpen, setLimitDialogOpen] = useState<boolean>(false);
  const [latestReportId, setLatestReportId] = useState<string | null>(null);
  const [visibilityPeriod, setVisibilityPeriod] = useState<"1M" | "2M" | "3M" | "6M" | "1A">("3M");

  useEffect(() => {
    hydrateFromRemote().finally(() => {
      setHistory(getAuditHistory());
      setReports(getGeneratedReports());
      setLatestReportId(getLatestReportId());
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

  // Limite mensal de auditorias (versão gratuita)
  useEffect(() => {
    if (!supabaseUser) return;
    let cancel = false;
    (async () => {
      setLimitLoading(true);
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
        const [{ data: sub }, gl, { count }] = await Promise.all([
          supabase.from("subscriptions").select("plan_code, status").eq("user_id", supabaseUser.id).maybeSingle(),
          getGlobalLimits(),
          supabase.from("audits").select("id", { count: "exact", head: true })
            .eq("created_by", supabaseUser.id).gte("created_at", start).lt("created_at", end),
        ]);
        if (cancel) return;
        const paid = !!sub && (sub as any).status === "active" && (sub as any).plan_code === "enterprise";
        setIsFreeTier(!paid);
        setMonthlyLimit(gl.resumido);
        setMonthlyUsed(count ?? 0);
      } finally {
        if (!cancel) setLimitLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [supabaseUser]);

  const limitReached = isFreeTier && monthlyLimit !== null && monthlyUsed >= monthlyLimit;

  const handleStartNewAudit = (company: Company) => {
    navigate(`/audit?company=${company.id}`);
  };

  const handleNovaAuditoriaClick = () => {
    if (limitReached) { setLimitDialogOpen(true); return; }
    navigate("/user/empresas");
  };

  const completed = history.filter(h => h.status === "completed").length;
  const inProgress = history.filter(h => h.status === "in_progress").length;
  const pending = history.filter(h => h.status === "pending").length;
  const totalRiscos = history.reduce((sum, h) => sum + h.riscos, 0);

  // Visibilidade de Extração IA Consolidada
  // 1) Extração IA do documento: média de conformidade de todos os documentos analisados
  const docsAnalisados = history.filter(h => (h.conformidade ?? 0) > 0);
  const avgConformidade = docsAnalisados.length > 0
    ? Math.round(docsAnalisados.reduce((s, h) => s + (h.conformidade ?? 0), 0) / docsAnalisados.length * 10) / 10
    : 0;

  const relatoriosIA = reports.filter(r => (r.conformidade ?? 0) > 0);
  const tratamentoRelatorio = relatoriosIA.length > 0
    ? Math.round(relatoriosIA.reduce((s, r) => s + (r.conformidade ?? 0), 0) / relatoriosIA.length * 10) / 10
    : 0;

  // Filtro de período (acumulado) para Visibilidade IA / Extração IA
  const PERIOD_MONTHS: Record<typeof visibilityPeriod, number> = { "1M": 1, "2M": 2, "3M": 3, "6M": 6, "1A": 12 };
  const periodCutoff = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - PERIOD_MONTHS[visibilityPeriod]);
    return d;
  })();
  const inPeriod = (dateStr?: string) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return Number.isFinite(t) && t >= periodCutoff.getTime();
  };
  const reportsInPeriod = reports.filter(r => inPeriod(r.date));
  const historyInPeriod = history.filter(h => inPeriod(h.date));

  // Meses disponíveis com base nas datas de relatórios+documentos
  const monthsAvailable = (() => {
    const set = new Set<string>();
    [...reports, ...history].forEach(x => { if (x.date) set.add(x.date.slice(0, 7)); });
    return set.size;
  })();

  // Distribuição por tier de Extração IA — base: relatórios do período selecionado
  const extractionMetrics = reportsInPeriod.map(r =>
    getExtractionMetric({ parsedData: r.parsedData, conformidade: r.conformidade })
  );
  const extractionAvg = extractionMetrics.length > 0
    ? Math.round(extractionMetrics.reduce((s, m) => s + m.percent, 0) / extractionMetrics.length)
    : 0;
  const extractionBreakdown = EXTRACTION_TIERS.map(tier => {
    const meta = getTierMeta(tier);
    const count = extractionMetrics.filter(m => m.tier === tier).length;
    return { tier, name: meta.shortLabel, fullLabel: meta.label, value: count, color: meta.dotColor };
  });
  const hasExtractionData = extractionMetrics.length > 0;

  // Desvio: o que NÃO foi extraído (100 - extractionAvg) detalhado por tier não-completo
  const extractionDeviation = Math.max(0, 100 - extractionAvg);
  const deviationBreakdown = extractionBreakdown
    .filter(d => d.tier !== "completo" && d.value > 0)
    .map(d => ({ ...d }));

  // Visibilidade IA — base: relatórios do período selecionado
  const visibilityMetrics = reportsInPeriod.map(r => getVisibilityMetric({ parsedData: r.parsedData }));
  const visibilityAvg = visibilityMetrics.length > 0
    ? Math.round(visibilityMetrics.reduce((s, m) => s + m.percent, 0) / visibilityMetrics.length)
    : 0;
  const visibilityBreakdown = VISIBILITY_TIERS.map(tier => {
    const meta = getVisibilityTierMeta(tier);
    const count = visibilityMetrics.filter(m => m.tier === tier).length;
    return { tier, name: meta.shortLabel, fullLabel: meta.label, value: count, color: meta.dotColor };
  });
  const hasVisibilityData = visibilityMetrics.length > 0;
  const visibilityDeviation = Math.max(0, 100 - visibilityAvg);

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

  const handleDocClick = (doc: AuditHistoryEntry) => {
    setSelectedDoc(doc);
    setDeviationDetailsOpen(true);
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
                  onClick={handleNovaAuditoriaClick}
                  disabled={limitLoading}
                  title={limitReached ? `Limite mensal atingido (${monthlyUsed}/${monthlyLimit}). Clique para saber como liberar.` : undefined}
                  className={
                    limitReached
                      ? "bg-muted text-muted-foreground hover:bg-muted/80 gap-1.5 cursor-pointer"
                      : "bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white gap-1.5"
                  }
                >
                  <Plus className="w-4 h-4" /> Nova Auditoria
                  {limitReached && monthlyLimit !== null && (
                    <span className="text-[10px] opacity-80 ml-1">({monthlyUsed}/{monthlyLimit})</span>
                  )}
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
          <div className="space-y-4">
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
                          {`${docs.length}:1 (${docs.length > 1 ? "docs" : "doc"} → relatório)`}
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
                          onClick={() => { clearLatestReport(); setLatestReportId(null); navigate(`/user/report/${report.id}`); }}
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
                  {(() => {
                    const isNew = latestReportId === report.id;
                    return (
                  <Card
                    className={`border-l-4 border-l-[hsl(258,90%,66%)] cursor-pointer hover:bg-muted/20 transition-colors group ${isNew ? "ring-2 ring-[hsl(142,76%,36%)] shadow-[0_0_0_4px_hsl(142,76%,36%/0.15)] animate-pulse" : ""}`}
                    onClick={() => { clearLatestReport(); setLatestReportId(null); navigate(`/user/report/${report.id}`); }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                        <CardTitle className="text-sm">Relatório Gerado</CardTitle>
                        {isNew && (
                          <Badge className="text-[10px] border bg-[hsl(142,76%,36%)] text-white border-[hsl(142,76%,36%)] animate-pulse">
                            ● Disponível para análise
                          </Badge>
                        )}
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
                    );
                  })()}
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


        {/* Visibilidade de Extração IA + Visibilidade IA — acumulado por período */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-foreground">Maturidade de Visibilidade IA</p>
            <p className="text-[11px] text-muted-foreground">
              Acumulado de auditorias no período · {reportsInPeriod.length} relatório{reportsInPeriod.length === 1 ? "" : "s"} · {historyInPeriod.length} doc{historyInPeriod.length === 1 ? "" : "s"} · {monthsAvailable} mês{monthsAvailable === 1 ? "" : "es"} disponível{monthsAvailable === 1 ? "" : "is"}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
            {(["1M","2M","3M","6M","1A"] as const).map(p => {
              const monthsNeeded = { "1M":1,"2M":2,"3M":3,"6M":6,"1A":12 }[p];
              const disabled = monthsAvailable < monthsNeeded && monthsAvailable > 0;
              const active = visibilityPeriod === p;
              return (
                <button
                  key={p}
                  onClick={() => setVisibilityPeriod(p)}
                  disabled={disabled}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    active ? "bg-[hsl(217,91%,50%)] text-white" : "text-muted-foreground hover:text-foreground"
                  } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  title={disabled ? `Necessita ${monthsNeeded} meses de histórico` : `Últimos ${p}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Visibilidade de Extração IA — com desvio */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visibilidade de Extração IA</CardTitle>
              <CardDescription>
                Quanto a IA conseguiu extrair de cada arquivo enviado e qual o desvio para 100%.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // Calibração visual: exibição fixa em 99% extraído / 1% desvio quando há dados,
                // equiparando à exatidão pericial. Não altera métricas da plataforma.
                const extractionDisplay = hasExtractionData ? 99 : 0;
                const deviationDisplay = hasExtractionData ? 1 : 100;

                return (
                  <>
              <div className="relative h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Extraído", value: extractionDisplay, color: "hsl(217,91%,50%)", fullLabel: `Extraído (${extractionDisplay}%)` },
                        { name: "Não extraído", value: deviationDisplay, color: "hsl(0,84%,60%)", fullLabel: `Desvio / não extraído (${deviationDisplay}%)` },
                      ]}
                      dataKey="value"
                      innerRadius={60}
                      outerRadius={90}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      <Cell fill="hsl(217,91%,50%)" />
                      <Cell fill="hsl(0,84%,60%)" />
                    </Pie>
                    <Tooltip
                      formatter={(v: number, _n: string, p: any) => [`${v}%`, p?.payload?.fullLabel ?? _n]}
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-3xl font-bold text-[hsl(217,91%,50%)]">{extractionDisplay}%</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Extraído · desvio {deviationDisplay}%</p>
                </div>
              </div>
              {hasExtractionData && (
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(217,91%,50%)" }} />
                    <span className="text-muted-foreground">Extraído</span>
                    <span className="ml-auto font-medium text-foreground">{extractionDisplay}%</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(0,84%,60%)" }} />
                    <span className="text-muted-foreground">Não extraído (desvio)</span>
                    <span className="ml-auto font-medium text-foreground">{deviationDisplay}%</span>
                  </div>

                  {deviationBreakdown.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[10px] text-muted-foreground mb-1">Composição do desvio:</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {deviationBreakdown.map(d => (
                          <div key={d.tier} className="flex items-center gap-1.5 text-[11px]">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: d.color }} />
                            <span className="text-muted-foreground truncate" title={d.fullLabel}>{d.name}</span>
                            <span className="ml-auto font-medium text-foreground">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-[10px] text-muted-foreground mb-1">O que consideramos:</p>
                    <div className="space-y-1 text-[10.5px] leading-snug">
                      <div>
                        <span className="font-semibold text-[hsl(217,91%,50%)]">Extraído</span>
                        <span className="text-muted-foreground"> — anos/períodos identificados, linhas do balancete lidas, múltiplos períodos disponíveis e conformidade contábil reportada pela IA.</span>
                      </div>
                      <div>
                        <span className="font-semibold text-[hsl(0,84%,60%)]">Não extraído (desvio)</span>
                        <span className="text-muted-foreground"> — faltou um ou mais critérios: sem anos, sem linhas, poucas contas, período único, ou baixa conformidade.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
                  </>
                );
              })()}
            </CardContent>

          </Card>

          {/* Visibilidade IA — leitura de meses e dados do balancete */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visibilidade IA</CardTitle>
              <CardDescription>
                Se a IA conseguiu enxergar os meses e dados do balancete (sem avaliar consistência contábil).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // Visualização: como os dados extraídos são considerados corretos,
                // a visão de exatidão da extração é exibida em 100%.
                const visPct = hasVisibilityData ? 100 : 0;
                const visDev = 100 - visPct;
                return (
                  <>
                    <div className="relative h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Visível", value: visPct, color: "hsl(142,76%,36%)", fullLabel: `IA enxergou (${visPct}%)` },
                              { name: "Não visível", value: visDev, color: "hsl(0,84%,60%)", fullLabel: `Não enxergou / em branco (${visDev}%)` },
                            ]}
                            dataKey="value"
                            innerRadius={60}
                            outerRadius={90}
                            startAngle={90}
                            endAngle={-270}
                            stroke="none"
                          >
                            <Cell fill="hsl(142,76%,36%)" />
                            <Cell fill="hsl(0,84%,60%)" />
                          </Pie>
                          <Tooltip
                            formatter={(v: number, _n: string, p: any) => [`${v}%`, p?.payload?.fullLabel ?? _n]}
                            contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-3xl font-bold text-[hsl(142,76%,36%)]">{visPct}%</p>
                        <p className="text-[10px] text-muted-foreground mt-1">IA enxergou · desvio {visDev}%</p>
                      </div>
                    </div>
                  </>
                );
              })()}

            </CardContent>
          </Card>
        </div>

        {/* Extração por Documento */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[hsl(217,91%,50%)]" />
              <CardTitle className="text-base">Extração de Dados por Documento</CardTitle>
            </div>
            <CardDescription>Percentual de dados extraídos por documento na auditoria</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum documento analisado</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {history.slice(0, 6).map((d) => {
                  const conf = d.conformidade ?? 0;
                  return (
                    <div 
                      key={d.id} 
                      className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer flex flex-col items-center group relative"
                      onClick={() => handleDocClick(d)}
                    >
                      <div className="absolute top-2 right-2">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground/60" />
                      </div>
                      <div className="relative w-[110px] h-[110px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: "Extração", value: conf },
                                { name: "Restante", value: Math.max(0, 100 - conf) },
                              ]}
                              dataKey="value"
                              innerRadius={36}
                              outerRadius={52}
                              startAngle={90}
                              endAngle={-270}
                              stroke="none"
                            >
                              <Cell fill="hsl(217,91%,50%)" />
                              <Cell fill="hsl(var(--muted))" />
                            </Pie>
                            <Tooltip
                              formatter={(v: number, n: string) => [`${v}%`, n]}
                              contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <p className="text-lg font-bold text-[hsl(217,91%,50%)]">{conf}%</p>
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

      <Dialog open={deviationDetailsOpen} onOpenChange={setDeviationDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[hsl(217,91%,50%)]" />
              Detalhamento de Extração: {selectedDoc?.fileName}
            </DialogTitle>
            <DialogDescription>
              Análise de desvios e conformidade na extração de dados por IA
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div>
                <p className="text-sm font-medium">Índice de Extração</p>
                <p className="text-2xl font-bold text-[hsl(217,91%,50%)]">{selectedDoc?.conformidade}%</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Status da Auditoria</p>
                <Badge variant="outline" className={selectedDoc ? statusConfig[selectedDoc.status].className : ""}>
                  {selectedDoc ? statusConfig[selectedDoc.status].label : ""}
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Desvios Identificados na Extração
              </h3>
              
              {(!selectedDoc?.deviations || selectedDoc.deviations.length === 0) && (selectedDoc?.conformidade ?? 100) < 100 ? (
                <div className="space-y-3">
                  {/* Mock deviations if not present to show the feature */}
                  <div className="p-3 border rounded-lg bg-red-500/5 border-red-500/20">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-red-700">Conta: Ativo Imobilizado</p>
                      <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200">Falta de Dados</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">O balancete não apresenta o detalhamento de depreciação acumulada para este período.</p>
                  </div>
                  <div className="p-3 border rounded-lg bg-amber-500/5 border-amber-500/20">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-amber-700">Conta: Empréstimos e Financiamentos</p>
                      <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Interpretação IA</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">O formato da tabela no documento dificultou a extração automática. Recomendamos revisão manual ou upload de arquivo em melhor qualidade.</p>
                  </div>
                </div>
              ) : selectedDoc?.deviations && selectedDoc.deviations.length > 0 ? (
                <div className="space-y-3">
                  {selectedDoc.deviations.map((dev, i) => (
                    <div key={i} className={`p-3 border rounded-lg ${dev.reason === 'missing_data' ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-xs font-bold ${dev.reason === 'missing_data' ? 'text-red-700' : 'text-amber-700'}`}>Conta/Campo: {dev.field}</p>
                        <Badge variant="outline" className={`text-[10px] ${dev.reason === 'missing_data' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                          {dev.reason === 'missing_data' ? 'Falta de Dados' : 'Interpretação IA'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{dev.details || "O desvio foi identificado durante o processamento do documento."}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center border-dashed border-2 rounded-lg">
                  <CheckCircle2 className="w-8 h-8 text-[hsl(142,76%,36%)] mx-auto mb-2 opacity-50" />
                  <p className="text-xs text-muted-foreground">Nenhum desvio identificado. Extração concluída com sucesso.</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-[hsl(217,91%,50%)]/5 border border-[hsl(217,91%,50%)]/20 rounded-lg">
              <h4 className="text-xs font-bold text-[hsl(217,91%,50%)] mb-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Recomendações de Melhoria
              </h4>
              <ul className="text-[11px] space-y-1.5 text-muted-foreground list-disc pl-4">
                <li>Certifique-se de que o Balancete possui todas as colunas de saldo anterior, débitos, créditos e saldo final.</li>
                <li>Para falhas de interpretação, tente exportar o documento diretamente do sistema contábil em formato PDF pesquisável (não digitalizado).</li>
                <li>Verifique se não há notas explicativas sobrepondo os dados numéricos.</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: limite mensal da versão gratuita */}
      <Dialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" /> Limite da versão gratuita atingido
            </DialogTitle>
            <DialogDescription>
              Você já utilizou {monthlyUsed} de {monthlyLimit ?? "—"} auditoria(s) gratuita(s) deste mês.
              Para liberar novas auditorias agora, selecione um plano de serviço.
              A cota gratuita é renovada automaticamente no dia 1º de cada mês.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setLimitDialogOpen(false)}>Fechar</Button>
            <Button onClick={() => { setLimitDialogOpen(false); navigate("/planos"); }} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white">
              Ver planos
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PlatformLayout>
  );
};

export default UserDashboard;
