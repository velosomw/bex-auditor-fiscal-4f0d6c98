import { supabase } from "@/integrations/supabase/client";

export interface DashboardStats {
  totalDocuments: number;
  totalAudits: number;
  auditsInProgress: number;
  auditsCompleted: number;
  opinionsIssued: number;
  totalCompanies: number;
  // Compliance derivadas de pipeline_analysis_results / audit_documents
  overallCompliance: number;     // média de conformidade real (0 se não houver)
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  // Trend dos últimos 6 meses (vazio se não houver dados)
  trend: { month: string; compliance: number }[];
  // Distribuição por variant de relatório
  auditDistribution: { type: string; count: number; percentage: number }[];
  // Última auditoria real (null quando não houver)
  lastAudit: null | {
    empresa: string;
    periodo: string;
    statusFinanceiro: "Saudável" | "Atenção" | "Crítico";
    scoreRisco: number;
    indicadores: { liquidezCorrente: number | null; endividamento: number | null; kanitz: number | null };
    alertasIA: { titulo: string; descricao: string; severidade: "baixo" | "medio" | "alto" | "critico" }[];
  };
}

export const emptyStats: DashboardStats = {
  totalDocuments: 0,
  totalAudits: 0,
  auditsInProgress: 0,
  auditsCompleted: 0,
  opinionsIssued: 0,
  totalCompanies: 0,
  overallCompliance: 0,
  highRisk: 0,
  mediumRisk: 0,
  lowRisk: 0,
  trend: [],
  auditDistribution: [],
  lastAudit: null,
};

const monthLabel = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

export const loadDashboardStats = async (dateRange?: { from: string; to: string }): Promise<DashboardStats> => {
  const stats: DashboardStats = { ...emptyStats };

  let companiesQuery = supabase.from("companies").select("id", { count: "exact", head: true });
  let pipelineDocsQuery = supabase.from("pipeline_documents").select("id, status, created_at", { count: "exact" });
  let auditDocsQuery = supabase.from("audit_documents").select("id, status, conformidade, risk_level, created_at");
  let auditReportsQuery = supabase.from("audit_reports").select("id, variant, status, conformidade, risk_level, created_at, company_id, ai_analysis, parsed_data").order("created_at", { ascending: false });
  let analysisQuery = supabase.from("pipeline_analysis_results").select("quality_score, validation_score, mapping_score, alertas, indicadores, created_at");

  if (dateRange) {
    pipelineDocsQuery = pipelineDocsQuery.gte("created_at", dateRange.from).lte("created_at", dateRange.to);
    auditDocsQuery = auditDocsQuery.gte("created_at", dateRange.from).lte("created_at", dateRange.to);
    auditReportsQuery = auditReportsQuery.gte("created_at", dateRange.from).lte("created_at", dateRange.to);
    analysisQuery = analysisQuery.gte("created_at", dateRange.from).lte("created_at", dateRange.to);
  }

  const [companies, pipelineDocs, auditDocs, auditReports, analysis] = await Promise.all([
    companiesQuery,
    pipelineDocsQuery,
    auditDocsQuery,
    auditReportsQuery,
    analysisQuery,
  ]);

  stats.totalCompanies = companies.count ?? 0;
  stats.totalDocuments = (pipelineDocs.count ?? 0) + (auditDocs.data?.length ?? 0);

  const reports = auditReports.data ?? [];
  stats.totalAudits = reports.length;
  stats.auditsInProgress = reports.filter(r => r.status === "in_progress" || r.status === "pending").length;
  stats.auditsCompleted = reports.filter(r => r.status === "completed").length;
  stats.opinionsIssued = reports.filter(r => r.variant === "completo" && r.status === "completed").length;

  // Conformidade real
  const conformidades = [
    ...(auditDocs.data ?? []).map(d => d.conformidade ?? 0),
    ...reports.map(r => r.conformidade ?? 0),
  ].filter(v => v > 0);
  stats.overallCompliance = conformidades.length
    ? Math.round(conformidades.reduce((a, b) => a + b, 0) / conformidades.length)
    : 0;

  // Distribuição de risco
  const allRisks = [
    ...(auditDocs.data ?? []).map(d => d.risk_level),
    ...reports.map(r => r.risk_level),
  ].filter(Boolean);
  stats.highRisk = allRisks.filter(r => r === "alto").length;
  stats.mediumRisk = allRisks.filter(r => r === "medio").length;
  stats.lowRisk = allRisks.filter(r => r === "baixo").length;

  // Trend 6 meses (apenas se houver dados)
  if (analysis.data && analysis.data.length > 0) {
    const months: { key: string; label: string; vals: number[] }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: monthLabel(d),
        vals: [],
      });
    }
    analysis.data.forEach((a: any) => {
      const d = new Date(a.created_at);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const m = months.find(x => x.key === k);
      if (m && a.quality_score) m.vals.push(Math.round(a.quality_score * 100));
    });
    stats.trend = months
      .filter(m => m.vals.length > 0)
      .map(m => ({ month: m.label, compliance: Math.round(m.vals.reduce((a, b) => a + b, 0) / m.vals.length) }));
  }

  // Distribuição por variant
  if (reports.length > 0) {
    const byVariant = reports.reduce<Record<string, number>>((acc, r) => {
      const k = r.variant || "outro";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const total = reports.length;
    stats.auditDistribution = Object.entries(byVariant).map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / total) * 100),
    }));
  }

  // Última auditoria
  if (reports.length > 0) {
    const last = reports[0] as any;
    const company = last.company_id
      ? (await supabase.from("companies").select("name").eq("id", last.company_id).maybeSingle()).data?.name
      : null;
    const ai = last.ai_analysis ?? {};
    const ind = ai?.indicadores ?? {};
    const alertas = Array.isArray(ai?.alertas) ? ai.alertas : [];
    const score = last.conformidade ?? 0;
    const status: "Saudável" | "Atenção" | "Crítico" =
      score >= 70 ? "Saudável" : score >= 40 ? "Atenção" : "Crítico";
    stats.lastAudit = {
      empresa: company || "Empresa não identificada",
      periodo: new Date(last.created_at).toLocaleDateString("pt-BR"),
      statusFinanceiro: status,
      scoreRisco: score,
      indicadores: {
        liquidezCorrente: ind.liquidezCorrente ?? null,
        endividamento: ind.endividamento ?? null,
        kanitz: ind.kanitz ?? null,
      },
      alertasIA: alertas.slice(0, 4).map((a: any) => ({
        titulo: a.titulo || a.title || "Alerta",
        descricao: a.descricao || a.description || "",
        severidade: (a.severidade || a.severity || "medio") as any,
      })),
    };
  }

  return stats;
};
