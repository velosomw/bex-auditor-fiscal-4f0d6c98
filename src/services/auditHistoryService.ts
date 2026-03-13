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
}

const STORAGE_KEY = "bex_audit_history";

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
  // Avoid duplicates by id
  const existing = history.findIndex(h => h.id === entry.id);
  if (existing >= 0) {
    history[existing] = entry;
  } else {
    history.unshift(entry);
  }
  // Keep last 50
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
}

export function saveAuditBatch(entries: AuditHistoryEntry[]) {
  entries.forEach(saveAuditEntry);
}

export function clearAuditHistory() {
  localStorage.removeItem(STORAGE_KEY);
}
