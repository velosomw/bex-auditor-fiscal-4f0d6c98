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
  accuracyDistribution: AccuracySlice[];
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

  const [pipelineDocs, audits, prevAudits, prevPipeline, analysis, prevAnalysis] = await Promise.all([
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
      .select("id, conformidade, riscos, risk_level, status")
      .gte("created_at", prevSinceIso)
      .lt("created_at", sinceIso),
    supabase
      .from("pipeline_documents")
      .select("id, status")
      .gte("created_at", prevSinceIso)
      .lt("created_at", sinceIso),
    supabase
      .from("pipeline_analysis_results")
      .select("ocr_score, quality_score, validation_score, mapping_score, created_at, document_id, indicadores, pipeline_documents!inner(file_name)")
      .gte("created_at", sinceIso),
    supabase
      .from("pipeline_analysis_results")
      .select("ocr_score, quality_score, validation_score, mapping_score, indicadores, pipeline_documents!inner(file_name)")
      .gte("created_at", prevSinceIso)
      .lt("created_at", sinceIso),
  ]);

  // Loga erros de RLS/network — antes ficavam silenciosamente como [] e os KPIs zeravam
  for (const [name, res] of [
    ["pipelineDocs", pipelineDocs], ["audits", audits], ["prevAudits", prevAudits],
    ["prevPipeline", prevPipeline], ["analysis", analysis], ["prevAnalysis", prevAnalysis],
  ] as const) {
    if ((res as any).error) {
      console.warn(`[GestorIaIndicators] ${name} erro:`, (res as any).error.message);
    }
  }

  const docs = pipelineDocs.data || [];
  const reports = audits.data || [];
  const prevReports = prevAudits.data || [];
  const prevDocs = prevPipeline.data || [];
  const analyses = analysis.data || [];
  const prevAnalyses = prevAnalysis.data || [];

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

  // ── Disponibilidade do Agente IA: % de docs/auditorias não-falhos
  const totalOps = docs.length + reports.length;
  const failedOps = docs.filter(d => d.status === "failed" || d.status === "error").length
                  + reports.filter(r => r.status === "failed" || r.status === "error").length;
  const agenteIaDisponibilidade = totalOps
    ? Number((((totalOps - failedOps) / totalOps) * 100).toFixed(1))
    : 100;
  const prevTotalOps = prevDocs.length + prevReports.length;
  const prevFailedOps = prevDocs.filter((d: any) => d.status === "failed" || d.status === "error").length
                      + prevReports.filter((r: any) => r.status === "failed" || r.status === "error").length;
  const prevAgenteIa = prevTotalOps
    ? ((prevTotalOps - prevFailedOps) / prevTotalOps) * 100
    : 100;

  // ── Acurácia IA/OCR: média ponderada das pontuações de extração
  // Filtra runs falhos (quality_score < 0.5 = teste antigo / extração quebrada)
  // para refletir a performance real do motor v4 (parser estrutural).
  // ── Acurácia IA/OCR: média PONDERADA por nº de contas extraídas ──
  // Filtros aplicados:
  //   1. quality_score ≥ 0.7  (runs falhos/parciais ficam fora)
  //   2. nº contas ≥ 20       (mocks/diagnósticos < 20 linhas ficam fora)
  //   3. file_name não começa com "DIAG-" (runs do painel de diagnóstico)
  // Ponderação: documento de 500 contas pesa 25× mais que mock de 20 contas.
  const isValidRun = (r: any) => {
    if (Number(r.quality_score || 0) < 0.7) return false;
    const contas = Number(r.indicadores?.contas_total || 0);
    if (contas < 20) return false;
    const fname = String(r.pipeline_documents?.file_name || "");
    if (/^DIAG[-_]/i.test(fname)) return false;
    return true;
  };
  const validAnalyses = analyses.filter(isValidRun);
  const validPrev = prevAnalyses.filter(isValidRun);

  // Acurácia da IA = capacidade de EXTRAIR e MAPEAR dados.
  // validation_score fica fora (saúde contábil ≠ acurácia da IA).
  // Pesos métricas: OCR 30% · Quality 30% · Mapping 40%.
  // Peso por run: nº de contas extraídas (máx 1000 para não distorcer).
  const avgScore = (rows: any[]) => {
    if (!rows.length) return 0;
    let weightedSum = 0, totalWeight = 0;
    for (const r of rows) {
      const ocr  = Number(r.ocr_score || 0);
      const qual = Number(r.quality_score || 0);
      const map  = Number(r.mapping_score || 0);
      const parts: Array<[number, number]> = [];
      if (ocr  > 0) parts.push([ocr,  0.30]);
      if (qual > 0) parts.push([qual, 0.30]);
      if (map  > 0) parts.push([map,  0.40]);
      if (!parts.length) continue;
      const wsum = parts.reduce((a,[,w]) => a + w, 0);
      const score = parts.reduce((a,[v,w]) => a + v * w, 0) / wsum;
      const runWeight = Math.min(1000, Math.max(20, Number(r.indicadores?.contas_total || 20)));
      weightedSum += score * runWeight;
      totalWeight += runWeight;
    }
    return totalWeight ? (weightedSum / totalWeight) : 0;
  };
  // scores podem vir em escala 0-1 ou 0-100 — normaliza
  const normalize = (v: number) => v <= 1 ? v * 100 : v;
  const acuraciaIA = Number(normalize(avgScore(validAnalyses)).toFixed(1));
  const prevAcuracia = normalize(avgScore(validPrev));

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
    agenteIaDisponibilidade,
    agenteIaVariacao: Number((agenteIaDisponibilidade - prevAgenteIa).toFixed(1)),
    acuraciaIA,
    acuraciaVariacao: Number((acuraciaIA - prevAcuracia).toFixed(1)),
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

  // ── Distribuição de Acurácia IA (faixas) — só runs válidos
  const accBuckets = { excelente: 0, bom: 0, regular: 0, baixo: 0 };
  for (const r of validAnalyses) {
    const ocr  = Number(r.ocr_score || 0);
    const qual = Number(r.quality_score || 0);
    const map  = Number(r.mapping_score || 0);
    const parts: Array<[number, number]> = [];
    if (ocr  > 0) parts.push([ocr,  0.30]);
    if (qual > 0) parts.push([qual, 0.30]);
    if (map  > 0) parts.push([map,  0.40]);
    if (!parts.length) continue;
    const wsum = parts.reduce((a,[,w]) => a + w, 0);
    const score = normalize(parts.reduce((a,[v,w]) => a + v * w, 0) / wsum);
    if (score >= 90) accBuckets.excelente++;
    else if (score >= 75) accBuckets.bom++;
    else if (score >= 50) accBuckets.regular++;
    else accBuckets.baixo++;
  }
  const accTotal = Math.max(1, validAnalyses.length);
  const accuracyDistribution: AccuracySlice[] = [
    { name: "Excelente (≥90%)", value: Math.round((accBuckets.excelente / accTotal) * 100), color: "hsl(152,70%,45%)" },
    { name: "Bom (75-90%)",     value: Math.round((accBuckets.bom       / accTotal) * 100), color: "hsl(200,80%,55%)" },
    { name: "Regular (50-75%)", value: Math.round((accBuckets.regular   / accTotal) * 100), color: "hsl(38,90%,55%)" },
    { name: "Baixo (<50%)",     value: Math.round((accBuckets.baixo     / accTotal) * 100), color: "hsl(0,80%,55%)" },
  ];

  return { kpis, trend, riskDistribution, auditTypes, accuracyDistribution, context };
}
