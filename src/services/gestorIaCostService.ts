import { supabase } from "@/integrations/supabase/client";

// ─── Tipos ─────────────────────────────────────────────────────
export interface CostConfigRow {
  id: string;
  provider: string;
  service: string;
  label: string;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  cost_per_request: number;
  cost_per_page: number;
  cost_fixed: number;
  currency?: string;
  active: boolean;
  notes?: string | null;
  updated_at: string;
}

export interface UsageLogRow {
  id: string;
  type: string;
  provider: string;
  service: string;
  document_id?: string | null;
  tokens_input: number;
  tokens_output: number;
  requests: number;
  pages: number;
  cost_calculated: number;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface CostBreakdown {
  service: string;
  label: string;
  cost: number;
  pct: number;
  tokens_input: number;
  tokens_output: number;
  requests: number;
  pages: number;
}

export interface CostInsight {
  level: "info" | "warning" | "critical";
  alerta: string;
  causa: string;
  acao: string;
}

export interface CostIndicators {
  custoTotal: number;
  custoBalancete: number;
  custoRelatorio: number;
  custoMedioExecucao: number;
  totalBalancetes: number;
  totalRelatorios: number;
  breakdown: CostBreakdown[];
  monthlySeries: { mes: string; custo: number }[];
  byService: { service: string; label: string; custo: number }[];
  insights: CostInsight[];
}

// ─── Cálculo central ──────────────────────────────────────────
export function calculateCost(
  usage: { tokens_input?: number; tokens_output?: number; requests?: number; pages?: number },
  config: Pick<CostConfigRow, "cost_per_1k_input" | "cost_per_1k_output" | "cost_per_request" | "cost_per_page" | "cost_fixed">,
): number {
  const ti = Number(usage.tokens_input || 0);
  const to = Number(usage.tokens_output || 0);
  const rq = Number(usage.requests || 0);
  const pg = Number(usage.pages || 0);
  return (
    (ti / 1000) * Number(config.cost_per_1k_input || 0) +
    (to / 1000) * Number(config.cost_per_1k_output || 0) +
    rq * Number(config.cost_per_request || 0) +
    pg * Number(config.cost_per_page || 0) +
    Number(config.cost_fixed || 0)
  );
}

// ─── Loaders ──────────────────────────────────────────────────
export async function fetchCostConfig(): Promise<CostConfigRow[]> {
  const { data, error } = await supabase
    .from("ai_cost_config" as any)
    .select("*")
    .order("provider", { ascending: true })
    .order("service", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CostConfigRow[];
}

export async function upsertCostConfig(row: Partial<CostConfigRow> & { service: string }): Promise<void> {
  const { error } = await supabase
    .from("ai_cost_config" as any)
    .upsert(row as any, { onConflict: "service" });
  if (error) throw error;
}

export async function fetchUsageLogs(limit = 1000): Promise<UsageLogRow[]> {
  const { data, error } = await supabase
    .from("ai_usage_logs" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as UsageLogRow[];
}

// ─── Agregadores ──────────────────────────────────────────────
export async function fetchCostIndicators(): Promise<CostIndicators> {
  const [logs, config] = await Promise.all([fetchUsageLogs(2000), fetchCostConfig()]);
  const cfgByService = new Map(config.map((c) => [c.service, c]));

  const totalCost = logs.reduce((s, l) => s + Number(l.cost_calculated || 0), 0);

  const balanceteLogs = logs.filter((l) =>
    l.type === "balancete" || l.type === "ocr" || l.type === "mapping" ||
    l.service === "gemini_2_5_flash" || l.service === "gemini_flash" || l.service === "document_ai" || l.service === "embedding"
  );
  const relatorioLogs = logs.filter((l) =>
    l.type === "relatorio" || l.type === "insight" ||
    l.service === "gemini_2_5_pro" || l.service === "gemini_pro"
  );

  const docsBalancete = new Set(balanceteLogs.map((l) => l.document_id).filter(Boolean)).size || 1;
  const docsRelatorio = new Set(relatorioLogs.map((l) => l.document_id).filter(Boolean)).size || 1;

  const sumBal = balanceteLogs.reduce((s, l) => s + Number(l.cost_calculated || 0), 0);
  const sumRel = relatorioLogs.reduce((s, l) => s + Number(l.cost_calculated || 0), 0);

  const totalDocs = new Set(logs.map((l) => l.document_id).filter(Boolean)).size || 1;
  const custoMedioExecucao = totalCost / totalDocs;

  // Breakdown por service
  const grouped = new Map<string, CostBreakdown>();
  for (const l of logs) {
    const key = l.service;
    const cfg = cfgByService.get(key);
    const label = cfg?.label || key;
    const prev = grouped.get(key) ?? {
      service: key, label, cost: 0, pct: 0, tokens_input: 0, tokens_output: 0, requests: 0, pages: 0,
    };
    prev.cost += Number(l.cost_calculated || 0);
    prev.tokens_input += Number(l.tokens_input || 0);
    prev.tokens_output += Number(l.tokens_output || 0);
    prev.requests += Number(l.requests || 0);
    prev.pages += Number(l.pages || 0);
    grouped.set(key, prev);
  }
  const breakdown = Array.from(grouped.values())
    .map((b) => ({ ...b, pct: totalCost > 0 ? (b.cost / totalCost) * 100 : 0 }))
    .sort((a, b) => b.cost - a.cost);

  // Série mensal
  const monthMap = new Map<string, number>();
  for (const l of logs) {
    const d = new Date(l.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + Number(l.cost_calculated || 0));
  }
  const monthlySeries = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([mes, custo]) => ({ mes, custo }));

  const byService = breakdown.map((b) => ({ service: b.service, label: b.label, custo: b.cost }));

  // Insights automáticos
  const insights: CostInsight[] = [];
  if (breakdown.length) {
    const top = breakdown[0];
    if (top.pct > 60) {
      insights.push({
        level: "warning",
        alerta: `Custo concentrado em ${top.label}`,
        causa: `${top.label} representa ${top.pct.toFixed(1)}% do custo total.`,
      acao: (top.service === "gemini_pro" || top.service === "gemini_2_5_pro")
          ? "Avaliar mover etapas de mapping para Gemini 2.5 Flash."
          : "Revisar volume de uso e amostragem deste serviço.",
      });
    }
    const proCfg = cfgByService.get("gemini_2_5_pro") ?? cfgByService.get("gemini_pro");
    const flashCfg = cfgByService.get("gemini_2_5_flash") ?? cfgByService.get("gemini_flash");
    const proLogs = breakdown.find((b) => b.service === "gemini_2_5_pro" || b.service === "gemini_pro");
    if (proCfg && flashCfg && proLogs && proLogs.cost > 0) {
      const projFlash = calculateCost(
        { tokens_input: proLogs.tokens_input, tokens_output: proLogs.tokens_output, requests: proLogs.requests, pages: proLogs.pages },
        flashCfg,
      );
      if (proLogs.cost - projFlash > proLogs.cost * 0.3) {
        insights.push({
          level: "info",
          alerta: "Oportunidade de otimização",
          causa: `Migrar parte do uso de Gemini Pro para Flash economizaria ~$${(proLogs.cost - projFlash).toFixed(4)}.`,
          acao: "Use Pro só em insights finais; Flash para mapping/normalização.",
        });
      }
    }
  }
  // Anomalias: custo zero com uso > 0
  const zeroCostWithUsage = logs.filter((l) => l.cost_calculated === 0 && (l.tokens_input + l.tokens_output + l.requests) > 0);
  if (zeroCostWithUsage.length > 5) {
    insights.push({
      level: "critical",
      alerta: "Logs sem custo calculado",
      causa: `${zeroCostWithUsage.length} registros têm uso > 0 mas custo = 0.`,
      acao: "Execute o Diagnóstico para recalcular com a tabela de preços atual.",
    });
  }

  return {
    custoTotal: totalCost,
    custoBalancete: sumBal / docsBalancete,
    custoRelatorio: sumRel / docsRelatorio,
    custoMedioExecucao,
    totalBalancetes: docsBalancete,
    totalRelatorios: docsRelatorio,
    breakdown,
    monthlySeries,
    byService,
    insights,
  };
}

// ─── Diagnóstico (recalcula custos com tabela atual) ──────────
export async function runCostDiagnostics(): Promise<{ updated: number; total: number }> {
  const [logs, config] = await Promise.all([fetchUsageLogs(5000), fetchCostConfig()]);
  const cfgByService = new Map(config.map((c) => [c.service, c]));

  let updated = 0;
  // Recalcula em lote, mas sem permissão de UPDATE em logs → registramos uma "correção" via insert do delta
  // Estratégia: como logs são imutáveis, geramos um log de ajuste (type=adjustment) com a diferença
  for (const l of logs) {
    const cfg = cfgByService.get(l.service);
    if (!cfg) continue;
    const recalculated = calculateCost(
      { tokens_input: l.tokens_input, tokens_output: l.tokens_output, requests: l.requests, pages: l.pages },
      cfg,
    );
    const delta = Number((recalculated - Number(l.cost_calculated || 0)).toFixed(6));
    if (Math.abs(delta) > 0.0000001) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("ai_usage_logs" as any).insert({
        type: "adjustment",
        provider: l.provider,
        service: l.service,
        document_id: l.document_id ?? null,
        tokens_input: 0,
        tokens_output: 0,
        requests: 0,
        pages: 0,
        cost_calculated: delta,
        metadata: { source_log_id: l.id, reason: "diagnostic_recalc", original: l.cost_calculated, recalculated },
        created_by: user?.id ?? null,
      } as any);
      if (!error) updated += 1;
    }
  }
  return { updated, total: logs.length };
}

// ─── Helper para Edge Functions / Frontend logarem uso ────────
export async function logAiUsage(input: {
  type: string;
  provider: string;
  service: string;
  document_id?: string | null;
  tokens_input?: number;
  tokens_output?: number;
  requests?: number;
  pages?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const config = await fetchCostConfig();
  const cfg = config.find((c) => c.service === input.service);
  const cost = cfg
    ? calculateCost(
        { tokens_input: input.tokens_input, tokens_output: input.tokens_output, requests: input.requests, pages: input.pages },
        cfg,
      )
    : 0;
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("ai_usage_logs" as any).insert({
    type: input.type,
    provider: input.provider,
    service: input.service,
    document_id: input.document_id ?? null,
    tokens_input: input.tokens_input ?? 0,
    tokens_output: input.tokens_output ?? 0,
    requests: input.requests ?? 0,
    pages: input.pages ?? 0,
    cost_calculated: cost,
    metadata: input.metadata ?? null,
    created_by: user?.id ?? null,
  } as any);
}
