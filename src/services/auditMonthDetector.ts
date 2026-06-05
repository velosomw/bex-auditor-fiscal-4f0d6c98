/**
 * Detecção e consolidação de períodos mensais em balancetes.
 * Estratégia:
 *  1) Tenta extrair YYYY-MM do nome do arquivo (formatos comuns BR).
 *  2) Tenta detectar colunas mensais (JAN/24, 01/2024, etc.) no XLSX.
 *  3) Fallback: usa "atual" + assume mês corrente.
 *
 * Os meses são representados como labels "YYYY-MM" (ordem cronológica natural).
 */

import type { ParsedFinancialData } from "./auditAIService";

export interface MonthRef {
  key: string;       // "2024-03"
  label: string;     // "Mar/2024"
  source: "filename" | "header" | "fallback";
  confidence: number; // 0..1
}

export interface MultiMonthParsed {
  // mesmo shape de ParsedFinancialData, mas garantindo que `years` são meses YYYY-MM
  balanco: ParsedFinancialData["balanco"];
  dre: ParsedFinancialData["dre"];
  years: string[]; // ["2024-01","2024-02","2024-03"] — sempre cronológico
  months: MonthRef[];
  documentInfo?: ParsedFinancialData["documentInfo"];
  documentType?: string;
  ocrScore?: number;
  perFileMonths: Array<{ fileName: string; months: MonthRef[] }>;
}

const MONTH_NAMES_PT: Record<string, string> = {
  jan: "01", janeiro: "01",
  fev: "02", fevereiro: "02",
  mar: "03", marco: "03", "março": "03",
  abr: "04", abril: "04",
  mai: "05", maio: "05",
  jun: "06", junho: "06",
  jul: "07", julho: "07",
  ago: "08", agosto: "08",
  set: "09", setembro: "09",
  out: "10", outubro: "10",
  nov: "11", novembro: "11",
  dez: "12", dezembro: "12",
};

const norm = (s: string) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const padMonth = (m: string | number) => String(m).padStart(2, "0");
const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  const names = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(m)] || m}/${y}`;
};

/** Detecta YYYY-MM a partir do nome do arquivo. */
export function detectMonthFromFilename(fileName: string): MonthRef | null {
  const n = norm(fileName.replace(/\.(xlsx|xls|csv|pdf)$/i, ""));

  // 1) "balancete 03 2024", "balancete 03-2024", "03/2024", "03-24"
  let m = n.match(/(?:^|\s)(0?[1-9]|1[0-2])[\s/\-](20\d{2}|\d{2})(?:\s|$)/);
  if (m) {
    let yy = m[2];
    if (yy.length === 2) yy = `20${yy}`;
    const key = `${yy}-${padMonth(m[1])}`;
    return { key, label: monthLabel(key), source: "filename", confidence: 0.9 };
  }

  // 2) "2024 03", "2024-03"
  m = n.match(/(20\d{2})[\s/\-](0?[1-9]|1[0-2])(?:\s|$)/);
  if (m) {
    const key = `${m[1]}-${padMonth(m[2])}`;
    return { key, label: monthLabel(key), source: "filename", confidence: 0.9 };
  }

  // 3) "balancete jan 2024", "fev/24", "setembro-25"
  const monthRe = Object.keys(MONTH_NAMES_PT).join("|");
  m = n.match(new RegExp(`(${monthRe})[\\s/\\-.]?(20\\d{2}|\\d{2})`));
  if (m) {
    const mm = MONTH_NAMES_PT[m[1]];
    let yy = m[2];
    if (yy.length === 2) yy = `20${yy}`;
    const key = `${yy}-${mm}`;
    return { key, label: monthLabel(key), source: "filename", confidence: 0.85 };
  }

  return null;
}

/**
 * Detecta intervalo "MM.YYYY a MM.YYYY" / "MM-YYYY até MM-YYYY" no nome do arquivo
 * e expande para a lista cronológica de meses (YYYY-MM).
 * Ex: "Balancetes 08.2025 a 01.2026 (6 meses).xlsx" → ["2025-08","2025-09",...,"2026-01"]
 */
export function detectMonthRangeFromFilename(fileName: string): MonthRef[] {
  const n = norm(fileName.replace(/\.(xlsx|xls|csv|pdf)$/i, ""));
  // padrões: "08 2025 a 01 2026" / "08/2025 ate 01/2026" / "ago 2025 a jan 2026" / "set-25 a mar-26"
  const numPat = /(0?[1-9]|1[0-2])[\s/\-.](20\d{2}|\d{2})\s*(?:a|ate|até|-|—|to|—|\.\.)\s*(0?[1-9]|1[0-2])[\s/\-.](20\d{2}|\d{2})/;
  let mm1: number | null = null, yy1: number | null = null, mm2: number | null = null, yy2: number | null = null;
  let m = n.match(numPat);
  if (m) {
    mm1 = Number(m[1]); yy1 = Number(m[2]); mm2 = Number(m[3]); yy2 = Number(m[4]);
    if (yy1 < 100) yy1 += 2000;
    if (yy2 < 100) yy2 += 2000;
  } else {
    const monthRe = Object.keys(MONTH_NAMES_PT).join("|");
    const namePat = new RegExp(`(${monthRe})[\\s/\\-.]?(20\\d{2}|\\d{2})\\s*(?:a|ate|até|-|—|to)\\s*(${monthRe})[\\s/\\-.]?(20\\d{2}|\\d{2})`);
    m = n.match(namePat);
    if (m) {
      mm1 = Number(MONTH_NAMES_PT[m[1]]); yy1 = Number(m[2]);
      mm2 = Number(MONTH_NAMES_PT[m[3]]); yy2 = Number(m[4]);
      if (yy1 < 100) yy1 += 2000;
      if (yy2 < 100) yy2 += 2000;
    }
  }
  if (!mm1 || !yy1 || !mm2 || !yy2) return [];
  const out: MonthRef[] = [];
  let y = yy1, mo = mm1, guard = 0;
  while ((y < yy2 || (y === yy2 && mo <= mm2)) && guard < 60) {
    const key = `${y}-${padMonth(mo)}`;
    out.push({ key, label: monthLabel(key), source: "filename", confidence: 0.85 });
    mo += 1; if (mo > 12) { mo = 1; y += 1; }
    guard++;
  }
  return out;
}

/**
 * Detecta colunas mensais em headers de planilha BEX (cenário B do MD).
 * Aceita variações: "Saldo Atual JAN/2024", "JAN/24", "01/2024", "Jan 2024",
 * "Saldo 03-2024", "Saldo Final Mar/2024".
 * Retorna lista ordenada cronologicamente; ignora colunas que não casam um mês.
 */
export function extractColumnMonths(
  headers: unknown[],
  opts?: { fileName?: string },
): Array<{ idx: number; mesKey: string; label: string }> {
  const out: Array<{ idx: number; mesKey: string; label: string }> = [];
  const seen = new Set<string>();

  // Tenta detectar um ano no cabeçalho inteiro para fallback de meses sem ano.
  // ⚠️ Só considera células CURTAS (≤ 20 chars) para evitar confundir códigos
  // contábeis longos (ex: "2110102026") com ano.
  let inferredYear: number | null = null;
  for (const cell of headers) {
    const s = String(cell || "").trim();
    if (!s || s.length > 20) continue;
    const m = s.match(/\b(20\d{2})\b/);
    if (m) { inferredYear = Number(m[1]); break; }
  }
  // Se não há ano no header, tenta extrair do nome do arquivo (range tem prioridade)
  if (inferredYear === null && opts?.fileName) {
    const range = detectMonthRangeFromFilename(opts.fileName);
    if (range.length > 0) {
      inferredYear = Number(range[0].key.split("-")[0]);
    } else {
      const single = detectMonthFromFilename(opts.fileName);
      if (single) inferredYear = Number(single.key.split("-")[0]);
    }
  }
  // Último recurso (mantém comportamento antigo)
  if (inferredYear === null) inferredYear = new Date().getFullYear();

  headers.forEach((cell, idx) => {
    const raw = String(cell ?? "").trim();
    if (!raw) return;

    let ref = detectMonthFromYearLabel(raw);

    if (!ref || ref.confidence < 0.8) {
      const lower = norm(raw);
      const monthRe = Object.keys(MONTH_NAMES_PT).join("|");
      const m = lower.match(new RegExp(`^(${monthRe})$`));
      if (m) {
        const mm = MONTH_NAMES_PT[m[1]];
        const key = `${inferredYear}-${padMonth(mm)}`;
        ref = { key, label: monthLabel(key), source: "header", confidence: 0.8 };
      }
    }

    if (!ref || ref.confidence < 0.8) return;
    const k = `${idx}::${ref.key}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ idx, mesKey: ref.key, label: ref.label });
  });
  return out.sort((a, b) => a.mesKey.localeCompare(b.mesKey));
}

/**
 * Pós-processa colunas mensais detectadas reconciliando com o range presente
 * no nome do arquivo. Útil quando os headers só dão "AGO/SET/.../JAN" sem ano
 * e a detecção volta com anos espúrios. Se o número de colunas distintas bate
 * com o range, reatribui sequencialmente.
 */
export function reconcileMonthsWithFilename(
  monthCols: Array<{ idx: number; mesKey: string; label: string }>,
  fileName: string,
): Array<{ idx: number; mesKey: string; label: string }> {
  if (!monthCols.length) return monthCols;
  const range = detectMonthRangeFromFilename(fileName);
  if (range.length === 0) return monthCols;
  // Se todos os meses já caem dentro do range → mantém
  const inRange = new Set(range.map(r => r.key));
  if (monthCols.every(c => inRange.has(c.mesKey))) return monthCols;
  // Caso contrário: reordena por idx e remapeia sequencialmente para os primeiros N do range
  const sorted = [...monthCols].sort((a, b) => a.idx - b.idx);
  const n = Math.min(sorted.length, range.length);
  return sorted.slice(0, n).map((c, i) => ({ idx: c.idx, mesKey: range[i].key, label: range[i].label }));
}


/** Converte rótulos "atual"/"saldo atual"/"YYYY"/"jan/24" em chaves YYYY-MM. */
export function detectMonthFromYearLabel(label: string, fallbackMonth?: MonthRef): MonthRef | null {
  if (!label) return null;
  const n = norm(label);

  // YYYY-MM ou YYYY/MM
  let m = n.match(/(20\d{2})[\s/\-](0?[1-9]|1[0-2])/);
  if (m) {
    const key = `${m[1]}-${padMonth(m[2])}`;
    return { key, label: monthLabel(key), source: "header", confidence: 0.95 };
  }

  // MM/YYYY ou MM/YY
  m = n.match(/(0?[1-9]|1[0-2])[\s/\-](20\d{2}|\d{2})/);
  if (m) {
    let yy = m[2];
    if (yy.length === 2) yy = `20${yy}`;
    const key = `${yy}-${padMonth(m[1])}`;
    return { key, label: monthLabel(key), source: "header", confidence: 0.95 };
  }

  // "jan/24", "fev 2024"
  const monthRe = Object.keys(MONTH_NAMES_PT).join("|");
  m = n.match(new RegExp(`(${monthRe})[\\s/\\-]?(20\\d{2}|\\d{2})`));
  if (m) {
    const mm = MONTH_NAMES_PT[m[1]];
    let yy = m[2];
    if (yy.length === 2) yy = `20${yy}`;
    const key = `${yy}-${mm}`;
    return { key, label: monthLabel(key), source: "header", confidence: 0.9 };
  }

  // Apenas YYYY → assume dezembro daquele ano (fechamento).
  // ⚠️ GUARD ANTI-ALUCINAÇÃO: a string INTEIRA precisa ser um ano (eventualmente
  // com contexto explícito). Códigos contábeis como "2110102026" NÃO devem ser
  // interpretados como ano 2026 → Dez/2026 (bug histórico que poluía gráficos).
  m = n.match(/^(?:ano\s+|exerc[ií]cio\s+|per[ií]odo\s+)?(20\d{2})(?:\s*(?:anual|fechamento|dez|dezembro))?$/);
  if (m) {
    const key = `${m[1]}-12`;
    return { key, label: monthLabel(key), source: "header", confidence: 0.55 };
  }

  // "atual"/"saldo atual" → herda do nome do arquivo se disponível
  if (n.includes("atual") || n.includes("saldo final")) {
    if (fallbackMonth) return fallbackMonth;
    const now = new Date();
    const key = `${now.getFullYear()}-${padMonth(now.getMonth() + 1)}`;
    return { key, label: monthLabel(key), source: "fallback", confidence: 0.4 };
  }

  return null;
}

/**
 * Re-rotula `parsedData.years` (e os values) para YYYY-MM.
 * Se o parsed só tem "atual", usa o mês detectado no nome do arquivo.
 */
export function relabelYearsAsMonths(
  parsed: ParsedFinancialData,
  fileName: string,
  /** Mês "YYYY-MM" informado manualmente pelo usuário — prioridade máxima sobre detector. */
  userMonthOverride?: string | null,
): { parsed: ParsedFinancialData; months: MonthRef[] } {
  // Override do usuário: força TODOS os years para o mês informado.
  let overrideRef: MonthRef | null = null;
  if (userMonthOverride && /^\d{4}-(0[1-9]|1[0-2])$/.test(userMonthOverride)) {
    overrideRef = {
      key: userMonthOverride,
      label: monthLabel(userMonthOverride),
      source: "header",
      confidence: 1,
    };
  }

  const fnameMonth = detectMonthFromFilename(fileName);
  const map = new Map<string, MonthRef>(); // oldLabel -> month

  if (overrideRef) {
    // Se o usuário definiu um mês MANUALMENTE, aplicamos APENAS se o documento 
    // NÃO tiver múltiplos períodos internos detectados (cenário A do MD).
    // Se for um documento multi-mês (cenário B), o override do usuário é ignorado
    // em favor das colunas detectadas, a menos que só exista uma coluna "atual".
    const yrs = parsed.years && parsed.years.length ? parsed.years : ["atual"];
    const isSinglePeriod = yrs.length <= 1 || (yrs.length === 1 && yrs[0] === "atual");
    
    if (isSinglePeriod) {
      for (const y of yrs) map.set(y, overrideRef);
    } else {
      // É multi-mês interno. Tenta mapear os labels existentes.
      for (const y of yrs) {
        const m = detectMonthFromYearLabel(y, fnameMonth || undefined);
        if (m) map.set(y, m);
      }
    }
  } else {
    for (const y of parsed.years || []) {
      const m = detectMonthFromYearLabel(y, fnameMonth || undefined);
      if (m) map.set(y, m);
    }
    // Se nenhum year mapeou: tenta range completo do filename primeiro.
    if (map.size === 0) {
      const range = detectMonthRangeFromFilename(fileName);
      if (range.length > 0) {
        // Distribui cada mês do range em uma chave sintética (e também replica em
        // labels existentes, se houver, para os primeiros N).
        const yrs = parsed.years && parsed.years.length ? parsed.years : range.map((_, i) => `__rng_${i}__`);
        for (let i = 0; i < Math.max(range.length, yrs.length); i++) {
          map.set(yrs[i] ?? `__rng_${i}__`, range[Math.min(i, range.length - 1)]);
        }
      } else if (fnameMonth) {
        // Único mês detectado no filename — aplica a todos os labels existentes
        // (ou cria uma chave sintética se parsed.years estiver vazio).
        const yrs = parsed.years && parsed.years.length ? parsed.years : ["__fname__"];
        for (const y of yrs) map.set(y, fnameMonth);
      }
    }
    // Se ainda assim vazio, usa fallback (current month).
    if (map.size === 0) {
      const now = new Date();
      const key = `${now.getFullYear()}-${padMonth(now.getMonth() + 1)}`;
      const fb: MonthRef = { key, label: monthLabel(key), source: "fallback", confidence: 0.3 };
      for (const y of parsed.years || ["atual"]) map.set(y, fb);
    }
  }


  // RECONCILIAÇÃO COM RANGE DO NOME DO ARQUIVO
  // Ex: arquivo "Balancetes 08.2025 a 01.2026 (6 meses).xlsx" mas headers só dizem AGO/SET/OUT/NOV/DEZ/JAN.
  // Se o número de meses detectados bate com o range do filename, reatribui sequencialmente
  // para garantir que 2025 e 2026 apareçam corretamente.
  const range = detectMonthRangeFromFilename(fileName);
  if (range.length > 0 && map.size > 0) {
    const inRange = new Set(range.map(r => r.key));
    const currentKeys = Array.from(new Set(Array.from(map.values()).map(m => m.key)));
    const allInRange = currentKeys.every(k => inRange.has(k));
    if (!allInRange) {
      // Reordena os year-labels originais e remapeia sequencialmente para os primeiros N do range.
      const orderedLabels = (parsed.years || []).filter(y => map.has(y));
      const n = Math.min(orderedLabels.length, range.length);
      const newMap = new Map<string, MonthRef>();
      for (let i = 0; i < n; i++) {
        newMap.set(orderedLabels[i], range[i]);
      }
      // Mantém quaisquer labels extras com mapeamento antigo
      for (const [k, v] of map.entries()) {
        if (!newMap.has(k)) newMap.set(k, v);
      }
      map.clear();
      for (const [k, v] of newMap.entries()) map.set(k, v);
    }
  }

  const remap = (rows: ParsedFinancialData["balanco"]) =>
    rows.map((r) => {
      const newValues: Record<string, number> = {};
      for (const [k, v] of Object.entries(r.values || {})) {
        const m = map.get(k);
        newValues[m ? m.key : k] = v;
      }
      return { ...r, values: newValues };
    });

  const newYears = Array.from(new Set(Array.from(map.values()).map((m) => m.key))).sort();
  const months: MonthRef[] = newYears.map(
    (k) => Array.from(map.values()).find((m) => m.key === k)!,
  );

  return {
    parsed: {
      ...parsed,
      balanco: remap(parsed.balanco || []),
      dre: remap(parsed.dre || []),
      years: newYears,
    },
    months,
  };
}

/**
 * Consolida múltiplos arquivos. Soma valores quando o mesmo mês aparece em mais de um arquivo
 * (ex: balancete dividido em 2 abas) — mas como cada arquivo tipicamente é 1 mês, o normal é só agregar.
 */
export function mergeMultiMonth(
  items: Array<{ fileName: string; parsed: ParsedFinancialData; userMonth?: string | null }>,
): MultiMonthParsed {
  const balancoMap = new Map<string, ParsedFinancialData["balanco"][number]>();
  const dreMap = new Map<string, ParsedFinancialData["dre"][number]>();
  const yearsSet = new Set<string>();
  const allMonths: MonthRef[] = [];
  const perFileMonths: MultiMonthParsed["perFileMonths"] = [];
  let docInfo: ParsedFinancialData["documentInfo"] = {};
  let docType: string | undefined;
  let ocrScore: number | undefined;

  for (const { fileName, parsed, userMonth } of items) {
    const { parsed: p2, months } = relabelYearsAsMonths(parsed, fileName, userMonth ?? null);
    perFileMonths.push({ fileName, months });
    months.forEach((m) => {
      if (!allMonths.find((x) => x.key === m.key)) allMonths.push(m);
    });
    p2.years.forEach((y) => yearsSet.add(y));
    if (!docType) docType = p2.documentType;
    if (ocrScore === undefined) ocrScore = p2.ocrScore;
    if (p2.documentInfo?.empresa && !docInfo?.empresa) docInfo = { ...docInfo, empresa: p2.documentInfo.empresa };

    const mergeRows = (
      target: Map<string, ParsedFinancialData["balanco"][number]>,
      rows: ParsedFinancialData["balanco"],
    ) => {
      for (const r of rows) {
        const k = `${r.conta}::${r.descricao}`;
        const ex = target.get(k);
        if (!ex) {
          target.set(k, { ...r, values: { ...r.values } });
        } else {
          for (const [yk, v] of Object.entries(r.values || {})) {
            ex.values[yk] = (ex.values[yk] || 0) + (v || 0);
          }
        }
      }
    };
    mergeRows(balancoMap, p2.balanco || []);
    mergeRows(dreMap, p2.dre || []);
  }

  const years = Array.from(yearsSet).sort();
  return {
    balanco: Array.from(balancoMap.values()),
    dre: Array.from(dreMap.values()),
    years,
    months: allMonths.sort((a, b) => a.key.localeCompare(b.key)),
    documentInfo: docInfo,
    documentType: docType,
    ocrScore,
    perFileMonths,
  };
}

/** Mantém apenas os 3 meses selecionados (default = últimos 3). */
export function pickMonths(data: MultiMonthParsed, keepKeys: string[]): MultiMonthParsed {
  const keep = new Set(keepKeys);
  const filterValues = (v: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const k of keepKeys) if (v[k] !== undefined) out[k] = v[k];
    return out;
  };
  return {
    ...data,
    years: keepKeys,
    months: data.months.filter((m) => keep.has(m.key)),
    balanco: data.balanco.map((r) => ({ ...r, values: filterValues(r.values) })),
    dre: data.dre.map((r) => ({ ...r, values: filterValues(r.values) })),
  };
}

export function defaultLast3(data: MultiMonthParsed): string[] {
  return data.years.slice(-3);
}
