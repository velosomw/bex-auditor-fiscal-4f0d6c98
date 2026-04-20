export type ReportSource = "auditor_chefe" | "usuario" | "empresa";

export interface AuditHistoryEntry {
  id: string;
  fileName: string;
  fileSize: number;
  format: string;
  date: string;
  status: "completed" | "in_progress" | "pending";
  conformidade: number;
  riscos: number;
  riskLevel: string;
  batchId?: string;
  companyId?: string;
  companyName?: string;
  source?: ReportSource;
}

export interface SourceDocumentRef {
  fileName: string;
  fileSize: number;
  format: string;
}

export interface GeneratedReportEntry {
  id: string;
  title: string;
  variant: "resumido" | "completo";
  date: string;
  fileName: string;
  fileSize: number;
  format: string;
  status: "completed";
  conformidade: number;
  riscos: number;
  riskLevel: string;
  aiAnalysis: any;
  parsedData: any;
  batchId?: string;
  sourceDocuments?: SourceDocumentRef[];
  companyId?: string;
  companyName?: string;
  source?: ReportSource;
}

export function getReportsByCompany(companyId: string): GeneratedReportEntry[] {
  return getGeneratedReports().filter(r => r.companyId === companyId);
}

export function getDocsByCompany(companyId: string): AuditHistoryEntry[] {
  return getAuditHistory().filter(d => d.companyId === companyId);
}

const STORAGE_KEY = "bex_audit_history";
const REPORTS_KEY = "bex_generated_reports";

export function getAuditHistory(): AuditHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAuditEntry(entry: AuditHistoryEntry) {
  const history = getAuditHistory();
  const existing = history.findIndex(h => h.id === entry.id);
  if (existing >= 0) history[existing] = entry;
  else history.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
}

export function saveAuditBatch(entries: AuditHistoryEntry[]) {
  entries.forEach(saveAuditEntry);
}

export function clearAuditHistory() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(REPORTS_KEY);
}

/* ========= Generated Reports ========= */
export function getGeneratedReports(): GeneratedReportEntry[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGeneratedReport(entry: GeneratedReportEntry) {
  const list = getGeneratedReports();
  const existing = list.findIndex(r => r.id === entry.id);
  if (existing >= 0) list[existing] = entry;
  else list.unshift(entry);
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(list.slice(0, 20)));
  } catch (e) {
    // Storage may overflow with parsedData; trim further
    localStorage.setItem(REPORTS_KEY, JSON.stringify(list.slice(0, 5)));
  }
}

export function getGeneratedReport(id: string): GeneratedReportEntry | null {
  return getGeneratedReports().find(r => r.id === id) || null;
}
