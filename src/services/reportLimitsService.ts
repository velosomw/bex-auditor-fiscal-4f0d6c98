import { getGeneratedReports } from "./auditHistoryService";

const GLOBAL_KEY = "bex_report_limit_global";
const PER_COMPANY_KEY = "bex_report_limits_per_company";

export interface PerCompanyLimit {
  companyId: string;
  companyName: string;
  extra: number; // quantidade ADICIONAL acima do limite global
}

export function getGlobalLimit(): number {
  const raw = localStorage.getItem(GLOBAL_KEY);
  const n = raw ? parseInt(raw, 10) : 10;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export function setGlobalLimit(value: number) {
  localStorage.setItem(GLOBAL_KEY, String(Math.max(1, Math.floor(value))));
}

export function getPerCompanyLimits(): PerCompanyLimit[] {
  try {
    const raw = localStorage.getItem(PER_COMPANY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setPerCompanyLimit(companyId: string, companyName: string, extra: number) {
  const list = getPerCompanyLimits();
  const idx = list.findIndex(l => l.companyId === companyId);
  const entry: PerCompanyLimit = {
    companyId,
    companyName,
    extra: Math.max(0, Math.min(10, Math.floor(extra))),
  };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  localStorage.setItem(PER_COMPANY_KEY, JSON.stringify(list));
}

export function removePerCompanyLimit(companyId: string) {
  const list = getPerCompanyLimits().filter(l => l.companyId !== companyId);
  localStorage.setItem(PER_COMPANY_KEY, JSON.stringify(list));
}

export function getCompanyLimit(companyId: string): number {
  const global = getGlobalLimit();
  const extra = getPerCompanyLimits().find(l => l.companyId === companyId)?.extra ?? 0;
  return global + extra;
}

export function getCompanyReportCount(companyId: string): number {
  return getGeneratedReports().filter(r => r.companyId === companyId).length;
}

export function canGenerateForCompany(companyId: string): { allowed: boolean; used: number; limit: number } {
  const used = getCompanyReportCount(companyId);
  const limit = getCompanyLimit(companyId);
  return { allowed: used < limit, used, limit };
}
