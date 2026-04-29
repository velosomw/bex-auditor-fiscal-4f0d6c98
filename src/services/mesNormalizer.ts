/**
 * MES NORMALIZER — Single source of truth para normalização de período mensal.
 *
 * Aceita os formatos comuns de balancete brasileiro e devolve sempre `YYYY-MM`:
 *   • "2024-03", "2024/03", "2024.03"
 *   • "03/2024", "03-2024", "3/24", "03.2024"
 *   • "Março 2024", "março/2024", "MARÇO-2024", "marco 24"
 *   • "Mar 2024", "mar/24", "MAR-24"
 *   • "2024" → assume fechamento "2024-12"
 *   • "atual", "saldo atual" → null (caller decide fallback)
 *
 * Também expõe regras determinísticas de mescla quando o mesmo mês aparece
 * em mais de um balancete (duplicidade).
 */

export const MES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MES_ABREV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const MES_LONG: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const stripAccents = (s: string) =>
  (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const norm = (s: string) =>
  stripAccents(s).toLowerCase().trim().replace(/\s+/g, " ");

const pad2 = (n: number | string) => String(n).padStart(2, "0");

/** Expande ano de 2 dígitos: 00-79 → 2000-2079, 80-99 → 1980-1999. */
function expandYear(y: string | number): number | null {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n >= 1900 && n <= 2100) return n;
  if (n >= 0 && n <= 79) return 2000 + n;
  if (n >= 80 && n <= 99) return 1900 + n;
  return null;
}

function buildKey(year: number, month: number): string | null {
  if (month < 1 || month > 12) return null;
  if (year < 1900 || year > 2100) return null;
  return `${year}-${pad2(month)}`;
}

/**
 * Normaliza qualquer rótulo de período para "YYYY-MM".
 * Retorna null se não for possível inferir um mês válido.
 */
export function normalizeMesKey(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // Já normalizado
  const direct = raw.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (direct) return `${direct[1]}-${direct[2]}`;

  const s = norm(raw);

  // YYYY[sep]MM
  let m = s.match(/^(\d{4})[\s/\-.](\d{1,2})$/);
  if (m) {
    const y = expandYear(m[1]); const mm = Number(m[2]);
    if (y) return buildKey(y, mm);
  }
  // MM[sep]YYYY  ou  M[sep]YY
  m = s.match(/^(\d{1,2})[\s/\-.](\d{2,4})$/);
  if (m) {
    const mm = Number(m[1]); const y = expandYear(m[2]);
    if (y) return buildKey(y, mm);
  }
  // "março 2024", "março/2024", "marco-2024"
  m = s.match(/^([a-z]+)[\s/\-.]+(\d{2,4})$/);
  if (m) {
    const name = m[1];
    const mm = MES_LONG[name] ?? MES_ABREV[name.slice(0, 3)];
    const y = expandYear(m[2]);
    if (mm && y) return buildKey(y, mm);
  }
  // "2024 março"
  m = s.match(/^(\d{2,4})[\s/\-.]+([a-z]+)$/);
  if (m) {
    const y = expandYear(m[1]);
    const name = m[2];
    const mm = MES_LONG[name] ?? MES_ABREV[name.slice(0, 3)];
    if (mm && y) return buildKey(y, mm);
  }
  // Apenas YYYY → assume fechamento (dezembro)
  m = s.match(/^(\d{4})$/);
  if (m) {
    const y = expandYear(m[1]);
    if (y) return buildKey(y, 12);
  }
  return null;
}

export function mesKeyToLabel(key: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(key || "");
  if (!m) return key;
  const idx = parseInt(m[2], 10) - 1;
  if (idx < 0 || idx > 11) return key;
  return `${MES_FULL[idx]} ${m[1]}`;
}

/**
 * Versão tolerante: se não conseguir normalizar, devolve a entrada original
 * (para preservar comportamento dos callers que querem "passar adiante").
 */
export function periodToMesKey(period: string): string {
  const k = normalizeMesKey(period);
  return k ?? (period || "").trim();
}

// ─── Regras determinísticas de mescla ────────────────────
export type DupStrategy = "sum" | "max-abs" | "last" | "first";

/**
 * Mescla dois valores numéricos do mesmo mês conforme estratégia:
 *   • sum      → soma (default — assume balancetes complementares)
 *   • max-abs  → mantém o de maior magnitude (assume um é completo, outro parcial)
 *   • last     → mantém o segundo (último carregado)
 *   • first    → mantém o primeiro (ignora duplicata)
 */
export function mergeNumeric(a: number, b: number, strategy: DupStrategy = "sum"): number {
  const av = Number.isFinite(a) ? a : 0;
  const bv = Number.isFinite(b) ? b : 0;
  switch (strategy) {
    case "sum": return av + bv;
    case "max-abs": return Math.abs(av) >= Math.abs(bv) ? av : bv;
    case "last": return bv;
    case "first": return av;
  }
}

/**
 * Detecta duplicatas em uma lista de chaves YYYY-MM e devolve um relatório
 * determinístico (ordenado por mesKey).
 */
export function detectDuplicates(mesKeys: string[]): {
  duplicates: Array<{ mesKey: string; count: number }>;
  hasDuplicates: boolean;
} {
  const counts = new Map<string, number>();
  for (const k of mesKeys) counts.set(k, (counts.get(k) || 0) + 1);
  const duplicates = Array.from(counts.entries())
    .filter(([, n]) => n > 1)
    .map(([mesKey, count]) => ({ mesKey, count }))
    .sort((a, b) => a.mesKey.localeCompare(b.mesKey));
  return { duplicates, hasDuplicates: duplicates.length > 0 };
}
