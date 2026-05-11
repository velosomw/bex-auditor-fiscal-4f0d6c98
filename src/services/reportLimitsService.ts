import { getGeneratedReports } from "./auditHistoryService";

/**
 * Cotas mensais de relatórios por variante (resumido / completo).
 *
 * Regras:
 *  - Limite GLOBAL definido pelo Gestor IA (padrão 50 resumidos / 10 completos por mês).
 *  - Cada empresa pode receber uma cota EXTRA pontual (resumido + completo) que se soma ao global.
 *  - Selecionar "Relatório Completo" consome 1 completo + 1 resumido (gera os dois documentos).
 *  - Selecionar "Relatório Resumido" consome apenas 1 resumido.
 *  - Renovação mensal: contagens consideram somente relatórios emitidos no mês corrente.
 */

export type ReportVariant = "resumido" | "completo";

const GLOBAL_KEY = "bex_report_limits_global_v2";
const PER_COMPANY_KEY = "bex_report_limits_per_company_v2";
// Compat antigos
const LEGACY_GLOBAL_KEY = "bex_report_limit_global";
const LEGACY_PER_COMPANY_KEY = "bex_report_limits_per_company";

export interface GlobalLimits {
  resumido: number;
  completo: number;
}

export interface PerCompanyExtra {
  companyId: string;
  companyName: string;
  resumido: number;
  completo: number;
}

const DEFAULT_GLOBAL: GlobalLimits = { resumido: 50, completo: 10 };

/* ────────────────── Global ────────────────── */
export function getGlobalLimits(): GlobalLimits {
  try {
    const raw = localStorage.getItem(GLOBAL_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return {
        resumido: Math.max(0, parseInt(v.resumido, 10) || DEFAULT_GLOBAL.resumido),
        completo: Math.max(0, parseInt(v.completo, 10) || DEFAULT_GLOBAL.completo),
      };
    }
    // migra valor único antigo (era “relatórios totais por empresa”)
    const legacy = localStorage.getItem(LEGACY_GLOBAL_KEY);
    if (legacy) {
      const n = parseInt(legacy, 10);
      if (Number.isFinite(n) && n > 0) {
        return { resumido: n, completo: Math.max(1, Math.floor(n / 5)) };
      }
    }
  } catch {}
  return { ...DEFAULT_GLOBAL };
}

export function setGlobalLimits(value: GlobalLimits) {
  const safe: GlobalLimits = {
    resumido: Math.max(0, Math.floor(value.resumido)),
    completo: Math.max(0, Math.floor(value.completo)),
  };
  localStorage.setItem(GLOBAL_KEY, JSON.stringify(safe));
}

/* ────────────────── Por empresa (extras) ────────────────── */
export function getPerCompanyExtras(): PerCompanyExtra[] {
  try {
    const raw = localStorage.getItem(PER_COMPANY_KEY);
    if (raw) return JSON.parse(raw);
    // migra estrutura antiga {companyId, companyName, extra}
    const legacy = localStorage.getItem(LEGACY_PER_COMPANY_KEY);
    if (legacy) {
      const old: { companyId: string; companyName: string; extra: number }[] = JSON.parse(legacy);
      return old.map(o => ({
        companyId: o.companyId,
        companyName: o.companyName,
        resumido: o.extra,
        completo: Math.max(0, Math.floor(o.extra / 5)),
      }));
    }
  } catch {}
  return [];
}

export function setPerCompanyExtra(companyId: string, companyName: string, extras: { resumido: number; completo: number }) {
  const list = getPerCompanyExtras();
  const idx = list.findIndex(l => l.companyId === companyId);
  const entry: PerCompanyExtra = {
    companyId,
    companyName,
    resumido: Math.max(0, Math.min(99, Math.floor(extras.resumido))),
    completo: Math.max(0, Math.min(99, Math.floor(extras.completo))),
  };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  localStorage.setItem(PER_COMPANY_KEY, JSON.stringify(list));
}

export function removePerCompanyExtra(companyId: string) {
  const list = getPerCompanyExtras().filter(l => l.companyId !== companyId);
  localStorage.setItem(PER_COMPANY_KEY, JSON.stringify(list));
}

/* ────────────────── Cálculo de cotas ────────────────── */
export interface CompanyQuota {
  resumido: { used: number; limit: number; remaining: number };
  completo: { used: number; limit: number; remaining: number };
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function getCompanyMonthlyUsage(companyId: string): { resumido: number; completo: number } {
  const reports = getGeneratedReports().filter(r => r.companyId === companyId && isThisMonth(r.date));
  return {
    resumido: reports.filter(r => r.variant === "resumido").length,
    completo: reports.filter(r => r.variant === "completo").length,
  };
}

export function getCompanyQuota(companyId: string): CompanyQuota {
  const global = getGlobalLimits();
  const extras = getPerCompanyExtras().find(l => l.companyId === companyId);
  const used = getCompanyMonthlyUsage(companyId);
  const limR = global.resumido + (extras?.resumido ?? 0);
  const limC = global.completo + (extras?.completo ?? 0);
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
export function canGenerateForCompany(
  companyId: string,
  variant: ReportVariant = "resumido",
): { allowed: boolean; reason?: string; quota: CompanyQuota } {
  const quota = getCompanyQuota(companyId);
  if (variant === "completo") {
    if (quota.completo.remaining <= 0) {
      return { allowed: false, reason: `Cota mensal de Completos esgotada (${quota.completo.used}/${quota.completo.limit}).`, quota };
    }
    if (quota.resumido.remaining <= 0) {
      return { allowed: false, reason: `Cota mensal de Resumidos esgotada — o Completo gera também 1 Resumido (${quota.resumido.used}/${quota.resumido.limit}).`, quota };
    }
    return { allowed: true, quota };
  }
  // resumido
  if (quota.resumido.remaining <= 0) {
    return { allowed: false, reason: `Cota mensal de Resumidos esgotada (${quota.resumido.used}/${quota.resumido.limit}).`, quota };
  }
  return { allowed: true, quota };
}

/* ────────────────── Compat (API antiga) ────────────────── */
/** @deprecated use getGlobalLimits */
export function getGlobalLimit(): number {
  return getGlobalLimits().resumido;
}
/** @deprecated use setGlobalLimits */
export function setGlobalLimit(value: number) {
  const cur = getGlobalLimits();
  setGlobalLimits({ ...cur, resumido: value });
}
/** @deprecated use getPerCompanyExtras */
export function getPerCompanyLimits() {
  return getPerCompanyExtras().map(e => ({ companyId: e.companyId, companyName: e.companyName, extra: e.resumido }));
}
/** @deprecated use setPerCompanyExtra */
export function setPerCompanyLimit(companyId: string, companyName: string, extra: number) {
  const cur = getPerCompanyExtras().find(l => l.companyId === companyId);
  setPerCompanyExtra(companyId, companyName, { resumido: extra, completo: cur?.completo ?? 0 });
}
/** @deprecated use removePerCompanyExtra */
export function removePerCompanyLimit(companyId: string) {
  removePerCompanyExtra(companyId);
}
/** @deprecated use getCompanyQuota */
export function getCompanyLimit(companyId: string): number {
  return getCompanyQuota(companyId).resumido.limit;
}
/** @deprecated use getCompanyMonthlyUsage */
export function getCompanyReportCount(companyId: string): number {
  return getCompanyMonthlyUsage(companyId).resumido;
}
