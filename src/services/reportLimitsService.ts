import { supabase } from "@/integrations/supabase/client";

/**
 * Cotas mensais de relatórios por variante (resumido / completo).
 *
 * PERSISTÊNCIA: 100% em banco (tabelas report_global_quotas e report_company_quota_extras).
 * Antes ficava em localStorage do gestor — por isso outros usuários nunca recebiam
 * a configuração. CONTAGEM mensal vem de audit_reports (DB), não mais do histórico local.
 *
 * Regras:
 *  - Cota GLOBAL definida pelo Gestor IA (padrão 50 resumidos / 10 completos por mês).
 *  - Cada empresa pode receber cota EXTRA pontual que se soma à global.
 *  - "Relatório Completo" consome 1 completo + 1 resumido.
 *  - "Relatório Resumido" consome 1 resumido.
 *  - Renovação mensal: contagens consideram apenas o mês corrente.
 */

export type ReportVariant = "resumido" | "completo";

export interface GlobalLimits {
  resumido: number;
  completo: number;
  empresas: number;
  arquivos_por_auditoria: number;
  meses_extracao_gratuito: number;
  meses_extracao_pago: number;
}
export interface PerCompanyExtra {
  companyId: string;
  companyName: string;
  resumido: number;
  completo: number;
}
export interface CompanyQuota {
  resumido: { used: number; limit: number; remaining: number };
  completo: { used: number; limit: number; remaining: number };
}

const DEFAULT_GLOBAL: GlobalLimits = {
  resumido: 1, completo: 10, empresas: 3, arquivos_por_auditoria: 3,
  meses_extracao_gratuito: 3, meses_extracao_pago: 12,
};

/* ────────────────── Global (DB) ────────────────── */
export async function getGlobalLimits(): Promise<GlobalLimits> {
  const { data, error } = await supabase
    .from("report_global_quotas")
    .select("resumido, completo, empresas, arquivos_por_auditoria, meses_extracao_gratuito, meses_extracao_pago")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_GLOBAL };
  const d: any = data;
  const num = (v: any, def: number) => Number.isFinite(Number(v)) ? Number(v) : def;
  return {
    resumido: num(d.resumido, DEFAULT_GLOBAL.resumido),
    completo: num(d.completo, DEFAULT_GLOBAL.completo),
    empresas: num(d.empresas, DEFAULT_GLOBAL.empresas),
    arquivos_por_auditoria: num(d.arquivos_por_auditoria, DEFAULT_GLOBAL.arquivos_por_auditoria),
    meses_extracao_gratuito: num(d.meses_extracao_gratuito, DEFAULT_GLOBAL.meses_extracao_gratuito),
    meses_extracao_pago: num(d.meses_extracao_pago, DEFAULT_GLOBAL.meses_extracao_pago),
  };
}

export async function setGlobalLimits(value: GlobalLimits): Promise<void> {
  const safe = {
    resumido: Math.max(0, Math.floor(Number(value.resumido) || 0)),
    completo: Math.max(0, Math.floor(Number(value.completo) || 0)),
    empresas: Math.max(0, Math.floor(Number(value.empresas) || 0)),
    arquivos_por_auditoria: Math.max(1, Math.floor(Number(value.arquivos_por_auditoria) || 1)),
    meses_extracao_gratuito: Math.max(1, Math.min(60, Math.floor(Number(value.meses_extracao_gratuito) || 1))),
    meses_extracao_pago: Math.max(1, Math.min(120, Math.floor(Number(value.meses_extracao_pago) || 1))),
  };
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("report_global_quotas")
    .update({ ...safe, updated_at: new Date().toISOString(), updated_by: userRes?.user?.id ?? null })
    .eq("id", true);
  if (error) throw error;
}

/* ────────────────── Por empresa (extras DB) ────────────────── */
export async function getPerCompanyExtras(): Promise<PerCompanyExtra[]> {
  const { data, error } = await supabase
    .from("report_company_quota_extras")
    .select("company_id, company_name, resumido_extra, completo_extra")
    .order("company_name");
  if (error || !data) return [];
  return data.map(r => ({
    companyId: r.company_id,
    companyName: r.company_name,
    resumido: Number(r.resumido_extra) || 0,
    completo: Number(r.completo_extra) || 0,
  }));
}

export async function setPerCompanyExtra(
  companyId: string,
  companyName: string,
  extras: { resumido: number; completo: number },
): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const payload = {
    company_id: companyId,
    company_name: companyName,
    resumido_extra: Math.max(0, Math.min(999, Math.floor(Number(extras.resumido) || 0))),
    completo_extra: Math.max(0, Math.min(999, Math.floor(Number(extras.completo) || 0))),
    updated_at: new Date().toISOString(),
    updated_by: userRes?.user?.id ?? null,
  };
  const { error } = await supabase
    .from("report_company_quota_extras")
    .upsert(payload, { onConflict: "company_id" });
  if (error) throw error;
}

export async function removePerCompanyExtra(companyId: string): Promise<void> {
  const { error } = await supabase
    .from("report_company_quota_extras")
    .delete()
    .eq("company_id", companyId);
  if (error) throw error;
}

/* ────────────────── Uso mensal (DB: audit_reports) ────────────────── */
function monthBounds(d = new Date()): { start: string; end: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).toISOString();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).toISOString();
  return { start, end };
}

export async function getCompanyMonthlyUsage(companyId: string): Promise<{ resumido: number; completo: number }> {
  const { start, end } = monthBounds();
  const { data, error } = await supabase
    .from("audit_reports")
    .select("variant")
    .eq("company_id", companyId)
    .gte("created_at", start)
    .lt("created_at", end);
  if (error || !data) return { resumido: 0, completo: 0 };
  let resumido = 0, completo = 0;
  for (const r of data) {
    if (r.variant === "completo") completo += 1;
    else resumido += 1;
  }
  return { resumido, completo };
}

export async function getAllCompaniesMonthlyUsage(): Promise<Map<string, { resumido: number; completo: number }>> {
  const { start, end } = monthBounds();
  const { data, error } = await supabase
    .from("audit_reports")
    .select("company_id, variant")
    .gte("created_at", start)
    .lt("created_at", end);
  const map = new Map<string, { resumido: number; completo: number }>();
  if (error || !data) return map;
  for (const r of data) {
    if (!r.company_id) continue;
    const cur = map.get(r.company_id) || { resumido: 0, completo: 0 };
    if (r.variant === "completo") cur.completo += 1;
    else cur.resumido += 1;
    map.set(r.company_id, cur);
  }
  return map;
}

export async function getCompanyQuota(companyId: string): Promise<CompanyQuota> {
  const [global, extras, used] = await Promise.all([
    getGlobalLimits(),
    getPerCompanyExtras(),
    getCompanyMonthlyUsage(companyId),
  ]);
  const extra = extras.find(l => l.companyId === companyId);
  const limR = global.resumido + (extra?.resumido ?? 0);
  const limC = global.completo + (extra?.completo ?? 0);
  return {
    resumido: { used: used.resumido, limit: limR, remaining: Math.max(0, limR - used.resumido) },
    completo: { used: used.completo, limit: limC, remaining: Math.max(0, limC - used.completo) },
  };
}

/**
 * Verifica se a empresa pode gerar a variante solicitada.
 * - Resumido: precisa de 1 resumido disponível.
 * - Completo: precisa de 1 completo + 1 resumido disponíveis (gera os dois).
 */
export async function canGenerateForCompany(
  companyId: string,
  variant: ReportVariant = "resumido",
): Promise<{ allowed: boolean; reason?: string; quota: CompanyQuota }> {
  const quota = await getCompanyQuota(companyId);
  if (variant === "completo") {
    if (quota.completo.remaining <= 0) {
      return { allowed: false, reason: `Cota mensal de Completos esgotada (${quota.completo.used}/${quota.completo.limit}).`, quota };
    }
    if (quota.resumido.remaining <= 0) {
      return { allowed: false, reason: `Cota mensal de Resumidos esgotada — o Completo gera também 1 Resumido (${quota.resumido.used}/${quota.resumido.limit}).`, quota };
    }
    return { allowed: true, quota };
  }
  if (quota.resumido.remaining <= 0) {
    return { allowed: false, reason: `Cota mensal de Resumidos esgotada (${quota.resumido.used}/${quota.resumido.limit}).`, quota };
  }
  return { allowed: true, quota };
}
