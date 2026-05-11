import { supabase } from "@/integrations/supabase/client";

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
  /** Atribuição de mês por arquivo (necessário para reidratar gráficos BS & Dados) */
  balanceteEntries?: { fileName: string; mesReferencia: string | null }[];
}

const STORAGE_KEY = "bex_audit_history";
const REPORTS_KEY = "bex_generated_reports";

/* =================================================================
 * Local cache (mantém leituras síncronas para a UI atual + offline)
 * ================================================================= */
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
  // Sincroniza com banco em background (best-effort)
  void persistAuditEntry(entry);
}

export function saveAuditBatch(entries: AuditHistoryEntry[]) {
  entries.forEach(saveAuditEntry);
}

export function clearAuditHistory() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(REPORTS_KEY);
}

/* =================================================================
 * Generated Reports (cache local + sync)
 * ================================================================= */
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
  } catch {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(list.slice(0, 5)));
  }
  void persistGeneratedReport(entry);
}

export function getGeneratedReport(id: string): GeneratedReportEntry | null {
  return getGeneratedReports().find(r => r.id === id) || null;
}

/* =================================================================
 * Filtros por empresa (combinam cache local + dados remotos hidratados)
 * ================================================================= */
export function getReportsByCompany(companyId: string): GeneratedReportEntry[] {
  return getGeneratedReports().filter(r => r.companyId === companyId);
}

export function getDocsByCompany(companyId: string): AuditHistoryEntry[] {
  return getAuditHistory().filter(d => d.companyId === companyId);
}

/* =================================================================
 * Persistência remota (Supabase) — best-effort, não quebra UX se falhar
 * ================================================================= */
async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function persistAuditEntry(entry: AuditHistoryEntry): Promise<void> {
  if (!entry.companyId) return; // sem empresa vinculada não persiste
  const uid = await getCurrentUserId();
  if (!uid) return;
  try {
    await (supabase.from("audit_documents") as any).insert({
      company_id: entry.companyId,
      created_by: uid,
      file_name: entry.fileName,
      file_size: entry.fileSize,
      format: entry.format,
      status: entry.status,
      conformidade: entry.conformidade,
      riscos: entry.riscos,
      risk_level: entry.riskLevel,
      batch_id: entry.batchId ?? null,
      source: entry.source ?? "usuario",
    });
  } catch (e) {
    console.warn("[auditHistoryService] persistAuditEntry falhou:", e);
  }
}

async function persistGeneratedReport(entry: GeneratedReportEntry): Promise<void> {
  if (!entry.companyId) return;
  const uid = await getCurrentUserId();
  if (!uid) return;
  try {
    await (supabase.from("audit_reports") as any).insert({
      company_id: entry.companyId,
      created_by: uid,
      title: entry.title,
      variant: entry.variant,
      file_name: entry.fileName,
      file_size: entry.fileSize,
      format: entry.format,
      status: entry.status,
      conformidade: entry.conformidade,
      riscos: entry.riscos,
      risk_level: entry.riskLevel,
      batch_id: entry.batchId ?? null,
      source: entry.source ?? "usuario",
      ai_analysis: entry.aiAnalysis ?? null,
      parsed_data: entry.parsedData ?? null,
      source_documents: entry.sourceDocuments ?? null,
    });
  } catch (e) {
    console.warn("[auditHistoryService] persistGeneratedReport falhou:", e);
  }
}

/* =================================================================
 * Hidratação remota → cache local (multi-dispositivo)
 * Chame em telas que listam empresas/relatórios para garantir
 * que os dados de outros navegadores também apareçam.
 * ================================================================= */
export async function hydrateFromRemote(opts?: { companyId?: string }): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid) return;
  try {
    // Documentos
    let docsQuery: any = (supabase.from("audit_documents") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (opts?.companyId) docsQuery = docsQuery.eq("company_id", opts.companyId);
    const { data: docsData } = await docsQuery;

    // Relatórios
    let repQuery: any = (supabase.from("audit_reports") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (opts?.companyId) repQuery = repQuery.eq("company_id", opts.companyId);
    const { data: repData } = await repQuery;

    if (docsData) {
      const remoteDocs: AuditHistoryEntry[] = docsData.map((d: any) => ({
        id: d.id,
        fileName: d.file_name,
        fileSize: d.file_size,
        format: d.format,
        date: (d.created_at || "").split("T")[0],
        status: d.status,
        conformidade: d.conformidade,
        riscos: d.riscos,
        riskLevel: d.risk_level,
        batchId: d.batch_id ?? undefined,
        companyId: d.company_id,
        source: d.source,
      }));
      mergeLocal(STORAGE_KEY, remoteDocs, 200);
    }

    if (repData) {
      const remoteReports: GeneratedReportEntry[] = repData.map((r: any) => ({
        id: r.id,
        title: r.title,
        variant: r.variant,
        date: (r.created_at || "").split("T")[0],
        fileName: r.file_name,
        fileSize: r.file_size,
        format: r.format,
        status: "completed",
        conformidade: r.conformidade,
        riscos: r.riscos,
        riskLevel: r.risk_level,
        aiAnalysis: r.ai_analysis,
        parsedData: r.parsed_data,
        batchId: r.batch_id ?? undefined,
        sourceDocuments: r.source_documents ?? undefined,
        companyId: r.company_id,
        source: r.source,
      }));
      mergeLocal(REPORTS_KEY, remoteReports, 50);
    }
  } catch (e) {
    console.warn("[auditHistoryService] hydrateFromRemote falhou:", e);
  }
}

function mergeLocal<T extends { id: string }>(key: string, remote: T[], limit: number) {
  try {
    const raw = localStorage.getItem(key);
    const local: T[] = raw ? JSON.parse(raw) : [];
    const map = new Map<string, T>();
    // remote primeiro (fonte de verdade), depois local preenche o que faltar
    remote.forEach(r => map.set(r.id, r));
    local.forEach(l => { if (!map.has(l.id)) map.set(l.id, l); });
    const merged = Array.from(map.values()).slice(0, limit);
    try {
      localStorage.setItem(key, JSON.stringify(merged));
    } catch {
      localStorage.setItem(key, JSON.stringify(merged.slice(0, Math.floor(limit / 4))));
    }
  } catch (e) {
    console.warn("[auditHistoryService] mergeLocal falhou:", e);
  }
}
