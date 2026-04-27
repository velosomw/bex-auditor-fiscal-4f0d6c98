import { supabase } from "@/integrations/supabase/client";

export interface KpiCardData {
  documentosAuditados: number;
  documentosVariacao: number; // % vs período anterior
  auditoriasRealizadas: number;
  auditoriasConcluidas: number;
  auditoriasVariacao: number;
  conformidadeGeral: number; // % (mantido para blocos de contexto)
  conformidadeVariacao: number;
  riscosIdentificados: number;
  riscosCriticos: number;
  riscosVariacao: number;
  // Novos KPIs
  agenteIaDisponibilidade: number; // % uptime do agente IA
  agenteIaVariacao: number;
  acuraciaIA: number; // % média OCR/extração
  acuraciaVariacao: number;
}

export interface TrendPoint { month: string; value: number; }
export interface RiskSlice { name: string; value: number; color: string; }
export interface AuditTypeSlice { name: string; value: number; }
export interface AccuracySlice { name: string; value: number; color: string; }

export interface ContextBlocks {
  conformidade: { geral: number; total: number; comDesvios: number };
  riscos: { pontos: number; altos: number; criticos: number };
  parecer: { ressalva: number; enfase: number; modificacao: number };
  ajustes: { sugeridas: number; impacto: number; divulgacao: number };
}

export interface GestorIaIndicators {
  kpis: KpiCardData;
  trend: TrendPoint[];
  riskDistribution: RiskSlice[];
  auditTypes: AuditTypeSlice[];
  context: ContextBlocks;
}

const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const pct = (curr: number, prev: number): number => {
  if (!prev) return curr > 0 ? 100 : 0;
  return Number((((curr - prev) / prev) * 100).toFixed(1));
};

export async function fetchGestorIaIndicators(monthsWindow = 12): Promise<GestorIaIndicators> {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsWindow);
  const sinceIso = since.toISOString();

  const prevSince = new Date(since);
  prevSince.setMonth(prevSince.getMonth() - monthsWindow);
  const prevSinceIso = prevSince.toISOString();

  const [pipelineDocs, audits, prevAudits, prevPipeline] = await Promise.all([
    supabase
      .from("pipeline_documents")
      .select("id, status, created_at")
      .gte("created_at", sinceIso),
    supabase
      .from("audit_reports")
      .select("id, variant, conformidade, riscos, risk_level, status, created_at, ai_analysis")
      .gte("created_at", sinceIso),
    supabase
      .from("audit_reports")
      .select("id, conformidade, riscos, risk_level")
      .gte("created_at", prevSinceIso)
      .lt("created_at", sinceIso),
    supabase
      .from("pipeline_documents")
      .select("id")
      .gte("created_at", prevSinceIso)
      .lt("created_at", sinceIso),
  ]);

  const docs = pipelineDocs.data || [];
  const reports = audits.data || [];
  const prevReports = prevAudits.data || [];
  const prevDocs = prevPipeline.data || [];

  // ── KPIs ───────────────────────────────────────────────────
  const documentosAuditados = docs.length;
  const auditoriasRealizadas = reports.length;
  const auditoriasConcluidas = reports.filter(r => r.status === "completed").length;

  const conformidadeGeral = reports.length
    ? Number((reports.reduce((s, r) => s + (r.conformidade || 0), 0) / reports.length).toFixed(1))
    : 0;
  const prevConformidade = prevReports.length
    ? prevReports.reduce((s, r) => s + (r.conformidade || 0), 0) / prevReports.length
    : 0;

  const riscosIdentificados = reports.reduce((s, r) => s + (r.riscos || 0), 0);
  const riscosCriticos = reports.filter(r => r.risk_level === "critico").length;
  const prevRiscos = prevReports.reduce((s, r) => s + (r.riscos || 0), 0);

  const kpis: KpiCardData = {
    documentosAuditados,
    documentosVariacao: pct(documentosAuditados, prevDocs.length),
    auditoriasRealizadas,
    auditoriasConcluidas,
    auditoriasVariacao: pct(auditoriasRealizadas, prevReports.length),
    conformidadeGeral,
    conformidadeVariacao: Number((conformidadeGeral - prevConformidade).toFixed(1)),
    riscosIdentificados,
    riscosCriticos,
    riscosVariacao: pct(riscosIdentificados, prevRiscos),
  };

  // ── Tendência mensal de conformidade ───────────────────────
  const buckets = new Map<string, { sum: number; count: number; date: Date }>();
  for (let i = monthsWindow - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets.set(key, { sum: 0, count: 0, date: d });
  }
  for (const r of reports) {
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = buckets.get(key);
    if (b) { b.sum += r.conformidade || 0; b.count += 1; }
  }
  const trend: TrendPoint[] = Array.from(buckets.values()).map(b => ({
    month: MONTH_LABELS[b.date.getMonth()],
    value: b.count ? Number((b.sum / b.count).toFixed(1)) : 0,
  }));

  // ── Distribuição de riscos ────────────────────────────────
  const riskCounts = { baixo: 0, medio: 0, alto: 0, critico: 0 };
  for (const r of reports) {
    const lvl = (r.risk_level || "baixo").toLowerCase();
    if (lvl in riskCounts) (riskCounts as any)[lvl]++;
    else riskCounts.baixo++;
  }
  const riskTotal = Math.max(1, reports.length);
  const riskDistribution: RiskSlice[] = [
    { name: "Baixo",   value: Math.round((riskCounts.baixo   / riskTotal) * 100), color: "hsl(152,70%,45%)" },
    { name: "Médio",   value: Math.round((riskCounts.medio   / riskTotal) * 100), color: "hsl(38,90%,55%)" },
    { name: "Alto",    value: Math.round((riskCounts.alto    / riskTotal) * 100), color: "hsl(0,80%,55%)" },
    { name: "Crítico", value: Math.round((riskCounts.critico / riskTotal) * 100), color: "hsl(0,70%,40%)" },
  ];

  // ── Auditorias por tipo (variant) ─────────────────────────
  const variantCounts: Record<string, number> = {};
  for (const r of reports) {
    const v = r.variant || "outro";
    variantCounts[v] = (variantCounts[v] || 0) + 1;
  }
  const auditTypes: AuditTypeSlice[] = Object.entries(variantCounts).map(([k, v]) => ({
    name: k.charAt(0).toUpperCase() + k.slice(1),
    value: v,
  }));

  // ── Blocos de Contexto ────────────────────────────────────
  // Extrai métricas de ai_analysis quando disponível
  let pontosRessalva = 0, pontosEnfase = 0, modificacoes = 0;
  let correcoesSugeridas = 0, impactoFin = 0, apenasDivulgacao = 0;
  let normasAplicadas = 0;

  for (const r of reports) {
    const a = (r.ai_analysis || {}) as any;
    pontosRessalva    += Number(a?.pontos_ressalva || a?.ressalvas || 0);
    pontosEnfase      += Number(a?.pontos_enfase   || a?.enfases   || 0);
    modificacoes      += Number(a?.modificacoes    || 0);
    correcoesSugeridas+= Number(a?.correcoes_sugeridas || a?.ajustes?.length || 0);
    impactoFin        += Number(a?.impacto_financeiro  || 0);
    apenasDivulgacao  += Number(a?.apenas_divulgacao   || 0);
    if (Array.isArray(a?.normas)) normasAplicadas = Math.max(normasAplicadas, a.normas.length);
  }

  const comDesvios = reports.filter(r => (r.conformidade || 100) < 80).length;

  const context: ContextBlocks = {
    conformidade: {
      geral: conformidadeGeral,
      total: normasAplicadas,
      comDesvios,
    },
    riscos: {
      pontos: riscosIdentificados,
      altos: riskCounts.alto,
      criticos: riskCounts.critico,
    },
    parecer: {
      ressalva: pontosRessalva,
      enfase: pontosEnfase,
      modificacao: modificacoes,
    },
    ajustes: {
      sugeridas: correcoesSugeridas,
      impacto: impactoFin,
      divulgacao: apenasDivulgacao,
    },
  };

  return { kpis, trend, riskDistribution, auditTypes, context };
}
