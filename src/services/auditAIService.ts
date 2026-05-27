import { readWorkbook } from "@/lib/excelReader";
import { extractColumnMonths, detectMonthFromYearLabel, detectMonthFromFilename, detectMonthRangeFromFilename, reconcileMonthsWithFilename } from "@/services/auditMonthDetector";
import { matchGrupoCanonico } from "@/services/grupoResultadoDictionary";

export interface ParsedFinancialData {
  balanco: Array<{ conta: string; descricao: string; values: Record<string, number>; ref1?: string; refCapital?: string }>;
  dre: Array<{ conta: string; descricao: string; values: Record<string, number>; ref1?: string; refCapital?: string }>;
  years: string[];
  pdfType?: string;
  documentInfo?: { empresa?: string; periodo?: string; tipo?: string };
  documentType?: string; // balancete, balanço, dre, dfc, extrato
  ocrScore?: number;     // 0..1 — qualidade da extração reportada pelo backend
  persisted?: boolean;   // true se ocr_results foi gravado para o documentId fornecido
}

export interface ConsolidatedFinancialData {
  empresa: string;
  periodo: string;
  documents: Array<{ fileName: string; type: string; format: string }>;
  contasConsolidadas: Array<{
    codigo: string;
    descricao: string;
    tipo: "ativo" | "passivo" | "receita" | "despesa" | "patrimonio";
    values: Record<string, number>;
  }>;
  estrutura: {
    ativo_circulante: number;
    ativo_nao_circulante: number;
    ativo_total: number;
    passivo_circulante: number;
    passivo_nao_circulante: number;
    passivo_total: number;
    patrimonio_liquido: number;
    receita_liquida: number;
    lucro_liquido: number;
    estoques: number;
    clientes: number;
    caixa: number;
    fornecedores: number;
    cmv: number;
  };
  balanco: Array<{ conta: string; descricao: string; values: Record<string, number> }>;
  dre: Array<{ conta: string; descricao: string; values: Record<string, number> }>;
  years: string[];
}

/* ── File Type Detection ── */
const SPREADSHEET_EXTENSIONS = [".xlsx", ".xls", ".csv", ".xlsm", ".xlsb", ".xltx", ".xltm"];
const PDF_EXTENSIONS = [".pdf"];
const DOCUMENT_EXTENSIONS = [".docx", ".doc", ".txt", ".rtf"];
const DATA_EXTENSIONS = [".json", ".xml", ".ofx", ".sped"];

function getFileExtension(file: File): string {
  return file.name.toLowerCase().substring(file.name.lastIndexOf("."));
}

export function isPDF(file: File): boolean {
  return file.type === "application/pdf" || PDF_EXTENSIONS.includes(getFileExtension(file));
}

export function isSpreadsheet(file: File): boolean {
  return SPREADSHEET_EXTENSIONS.includes(getFileExtension(file));
}

export function isDocument(file: File): boolean {
  return DOCUMENT_EXTENSIONS.includes(getFileExtension(file));
}

export function isDataFile(file: File): boolean {
  return DATA_EXTENSIONS.includes(getFileExtension(file));
}

export function getFileFormat(file: File): string {
  const ext = getFileExtension(file);
  const formatMap: Record<string, string> = {
    ".pdf": "PDF", ".xlsx": "Excel XLSX", ".xls": "Excel XLS", ".csv": "CSV",
    ".xlsm": "Excel XLSM", ".xlsb": "Excel XLSB", ".xltx": "Excel XLTX", ".xltm": "Excel XLTM",
    ".docx": "Word DOCX", ".doc": "Word DOC", ".txt": "Texto TXT", ".rtf": "RTF",
    ".json": "JSON", ".xml": "XML", ".ofx": "OFX", ".sped": "SPED",
  };
  return formatMap[ext] || ext.toUpperCase().replace(".", "");
}

/* ── File to Base64 ── */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/* ── Parse data files (JSON, XML, OFX, SPED) via AI ── */
export async function parseDataFileAI(file: File): Promise<ParsedFinancialData> {
  const ext = getFileExtension(file);
  const text = await file.text();
  
  // For JSON files, try to parse directly first
  if (ext === ".json") {
    try {
      const jsonData = JSON.parse(text);
      // If it has expected structure, return directly
      if (jsonData.balanco || jsonData.dre || jsonData.contas) {
        return {
          balanco: jsonData.balanco || [],
          dre: jsonData.dre || [],
          years: jsonData.years || jsonData.periodos || [],
          documentInfo: { empresa: jsonData.empresa, periodo: jsonData.periodo, tipo: "JSON Estruturado" },
          documentType: jsonData.tipo || "balancete",
        };
      }
    } catch { /* not valid JSON or not in expected format, send to AI */ }
  }

  // Send to AI for extraction
  const fileBase64 = btoa(unescape(encodeURIComponent(text)));
  const mimeMap: Record<string, string> = {
    ".json": "application/json",
    ".xml": "application/xml",
    ".ofx": "application/x-ofx",
    ".sped": "text/plain",
  };

  return parseDocumentAI_internal(fileBase64, file.name, mimeMap[ext] || "text/plain");
}

/* ── Parse PDF/Document via AI ── */
export async function parseDocumentAI(file: File, documentId?: string): Promise<ParsedFinancialData> {
  let fileBase64: string;
  let mimeType = file.type;
  const ext = getFileExtension(file);

  if (ext === ".txt") {
    const text = await file.text();
    fileBase64 = btoa(unescape(encodeURIComponent(text)));
    mimeType = "text/plain";
  } else {
    fileBase64 = await fileToBase64(file);
    if (!mimeType) {
      const mimeMap: Record<string, string> = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
        ".rtf": "application/rtf",
      };
      mimeType = mimeMap[ext] || "application/octet-stream";
    }
  }

  return parseDocumentAI_internal(fileBase64, file.name, mimeType, documentId);
}

async function parseDocumentAI_internal(fileBase64: string, fileName: string, mimeType: string, documentId?: string): Promise<ParsedFinancialData> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/audit-parse-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ fileBase64, fileName, mimeType, documentId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const extracted = data.extracted;

  return {
    balanco: extracted.balanco || [],
    dre: extracted.dre || [],
    years: extracted.years || [],
    pdfType: extracted.pdfType,
    documentInfo: extracted.documentInfo,
    documentType: extracted.documentInfo?.tipo,
    ocrScore: typeof data.ocr_score === "number" ? data.ocr_score : undefined,
    persisted: data.persisted === true,
  };
}

/* ── Parse any supported file ── */
export async function parseFile(file: File, documentId?: string): Promise<ParsedFinancialData> {
  if (isPDF(file) || isDocument(file)) {
    return parseDocumentAI(file, documentId);
  }
  if (isDataFile(file)) {
    return parseDataFileAI(file);
  }
  return parseSpreadsheet(file);
}

/* ── Parse multiple files and consolidate ── */
export async function parseMultipleFiles(files: File[]): Promise<{ parsed: ParsedFinancialData; fileResults: Array<{ fileName: string; format: string; type: string; rows: number; success: boolean; error?: string }> }> {
  const consolidated: ParsedFinancialData = {
    balanco: [],
    dre: [],
    years: [],
    documentInfo: {},
  };

  const fileResults: Array<{ fileName: string; format: string; type: string; rows: number; success: boolean; error?: string }> = [];

  for (const file of files) {
    try {
      const result = await parseFile(file);
      
      // Merge data
      consolidated.balanco.push(...result.balanco);
      consolidated.dre.push(...result.dre);
      result.years.forEach(y => {
        if (!consolidated.years.includes(y)) consolidated.years.push(y);
      });

      // Merge document info
      if (result.documentInfo?.empresa && !consolidated.documentInfo?.empresa) {
        consolidated.documentInfo!.empresa = result.documentInfo.empresa;
      }

      fileResults.push({
        fileName: file.name,
        format: getFileFormat(file),
        type: result.documentType || result.documentInfo?.tipo || "documento",
        rows: result.balanco.length + result.dre.length,
        success: true,
      });
    } catch (err) {
      fileResults.push({
        fileName: file.name,
        format: getFileFormat(file),
        type: "erro",
        rows: 0,
        success: false,
        error: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  consolidated.years.sort();
  return { parsed: consolidated, fileResults };
}

/* ── Template: Balancete Mensal BR ──
 * Reconhece cabeçalhos do tipo:
 *   Extenso | (Reduzido) | Descrição | Saldo Anterior | Débito | Crédito | Saldo Mês | Saldo Atual
 * Extrai apenas contas analíticas (folha) — códigos de 8+ dígitos OU sem filhos hierárquicos.
 * Retorna null se o template não bater.
 */
type BalanceteRowParsed = { conta: string; descricao: string; ref1?: string; values: Record<string, number> };

/**
 * REF_BY_PREFIX — Classificador GENÉRICO por grupo contábil brasileiro.
 *
 * Princípio: 1º dígito = natureza (1 Ativo, 2 Passivo, 3-8 DRE).
 *            2º dígito = grupo (11 AC, 12 ANC, 13 Permanente, 21 PC,
 *            22 PNC, 23 PL, 4/5 Custos, 6 Desp.Op, 7 Desp.Fin, 8 Não Op).
 *            3º+ dígitos = subgrupo. Para Passivo Circulante (21X) e PNC (22X)
 *            a sub-classificação é resolvida combinando código + DESCRIÇÃO,
 *            porque planos diferentes usam 211/212/215 com significados distintos
 *            (testado contra plano padrão BEx e plano Giannini).
 *
 * Ordem importa: padrões mais específicos primeiro.
 */
const REF_BY_PREFIX: Array<[RegExp, string]> = [
  // ── ATIVO CIRCULANTE — subgrupos canônicos ───
  [/^111/,   "A"],   // Bens e Numerários / Caixa / Disponível
  [/^1111/,  "C"],   // Clientes (planos onde 111x = clientes)
  [/^112/,   "C"],   // Clientes / Contas a Receber (padrão Giannini)
  [/^113/,   "D"],   // Estoques
  [/^114/,   "E"],   // Tributos a Recuperar / Outros Valores a Receber
  [/^115/,   "F"],   // Adiantamentos / Valores a Recuperar
  [/^116/,   "G"],   [/^117/, "G"], [/^118/, "G"], [/^119/, "G"],
  [/^11/,    "AC_TOTAL"],  // Linha-totalizadora Ativo Circulante
  // ── ATIVO NÃO CIRCULANTE ─────────────────────
  [/^121/,   "P"],   // Realizável a Longo Prazo / Outros Créditos LP
  [/^122/,   "Q"],   // Investimentos
  [/^123/,   "R"],   // Imobilizado
  [/^124/,   "S"],   // Intangível
  [/^12/,    "ANC_TOTAL"],
  [/^131/,   "R"],   // Imobilizado (planos com 13X = Permanente)
  [/^132/,   "S"],   // Intangível
  [/^13/,    "ANC_TOTAL"], // Permanente integra ANC
  // ── PASSIVO CIRCULANTE — sub-classificação via descrição ─
  // FIX (B): 211 = Fornecedores EXPLÍCITO. Outros 21X resolvem por descrição,
  // mas NUNCA podem cair em "BB" (fornecedores) — apenas 211 alimenta esse bucket.
  [/^211/,   "BB"],
  [/^21[2-9]/, "PC_COMPONENT"],
  [/^21/,    "PC_TOTAL"],
  // ── PASSIVO NÃO CIRCULANTE ───────────────────
  // FIX (Giannini): 221 NÃO é universalmente Fornecedores LP — em vários planos
  // (ex. Giannini) é o agrupador inteiro do PNC. Resolvemos por descrição.
  [/^22[1-9]/, "PNC_COMPONENT"],
  [/^22/,    "PNC_TOTAL"],
  // ── PATRIMÔNIO LÍQUIDO ───────────────────────
  [/^231/,   "GG1"], [/^232/, "HH1"], [/^233/, "HH1"], [/^234/, "HH1"],
  [/^23/,    "PL_TOTAL"],
  [/^24/,    "GG1"],
  // ── DRE ──────────────────────────────────────
  // FIX (A): Receita Líquida = 31 − 32 − 33 (NÃO grupo 3 agregado).
  // Códigos DRE bare (1 dígito: "3"…"8") são totalizadores macro que
  // duplicariam soma se aceitos. Marcamos como IGNORE para impedir o
  // fallback regex de roteá-los a receita_liquida/cmv/despesas.
  [/^3$/,    "DRE_ROOT_IGNORE"],
  [/^4$/,    "DRE_ROOT_IGNORE"],
  [/^5$/,    "DRE_ROOT_IGNORE"],
  [/^6$/,    "DRE_ROOT_IGNORE"],
  [/^7$/,    "DRE_ROOT_IGNORE"],
  [/^8$/,    "DRE_ROOT_IGNORE"],
  [/^31/,    "RECEITA"],
  [/^32/,    "DEDUCOES_RECEITA"],
  [/^33/,    "DEDUCOES_RECEITA"],
  [/^4/,     "CMV"],
  [/^5/,     "CMV"],          // Custo Industrial → CMV
  [/^6/,     "DESPESAS"],     // Despesas Operacionais
  [/^7/,     "DESPESAS_FIN"], // Despesas/Receitas FINANCEIRAS
  [/^8/,     "DESPESAS_NOP"], // Despesas/Receitas NÃO Operacionais
];

const stripAccents = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Sub-classifica componentes de Passivo Circulante (21X exceto 211) pela descrição. */
function classifyPCByDescription(desc: string): string {
  const d = stripAccents(desc);
  if (/credores?\s+rj|recuperacao\s+judic/.test(d)) return "II";
  // FIX (B): "Fornecedores" só via código 211; NÃO casamos por descrição aqui.
  if (/emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?|leasing|arrendament/.test(d)) return "AA";
  if (/sal[aá]ri|f[eé]rias|13[ºo°]|d[eé]cimo\s+terceiro|inss|fgts|trabalhi|encargos\s+soci|provis[aã]o.*f[eé]ria/.test(d)) return "CC";
  if (/tribut|imposto|icms|iss|pis|cofins|irpj|csll|simples|parcelament|refis/.test(d)) return "DD";
  return "JJ"; // Outras Obrigações (resíduo do PC)
}

/** Sub-classifica componentes de Passivo Não Circulante (22X exceto 221) pela descrição. */
function classifyPNCByDescription(desc: string): string {
  const d = stripAccents(desc);
  if (/credores?\s+rj|recuperacao\s+judic/.test(d)) return "CC1";
  // FIX (B): Fornecedores LP só via 221; sem fallback por descrição.
  if (/emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?|leasing|arrendament/.test(d)) return "QQ";
  if (/tribut|imposto|parcelament|refis/.test(d)) return "RR";
  return "DD1";
}

/** Resolve Ref 1 a partir do código contábil + descrição (determinístico, sem IA). */
export function inferRefByCode(code: string, descricao?: string): string | undefined {
  if (!code) return undefined;
  const c = String(code).replace(/\s+/g, "");
  for (const [pattern, ref] of REF_BY_PREFIX) {
    if (pattern.test(c)) {
      if (ref === "PC_COMPONENT") return classifyPCByDescription(descricao || "");
      if (ref === "PNC_COMPONENT") return classifyPNCByDescription(descricao || "");
      // FIX (A): bare "3".."8" são raízes DRE — descartar sem cair em fallback.
      if (ref === "DRE_ROOT_IGNORE") return "__IGNORE__";
      return ref;
    }
  }
  return undefined;
}

function tryParseBalanceteMensalBR(jsonData: unknown[][], fileName?: string): { rows: BalanceteRowParsed[]; periodLabel: string; multiMonth?: boolean } | null {
  // Procura linha de cabeçalho com "saldo atual" + ("extenso" OU "descri")
  let headerIdx = -1;
  let cols: Record<string, number> = {};
  for (let i = 0; i < Math.min(15, jsonData.length); i++) {
    const row = jsonData[i] || [];
    const norm = row.map(c => String(c || "").toLowerCase().trim());
    const hasSaldoAtual = norm.some(c => c.includes("saldo atual") || c === "saldo final");
    const hasDescricao = norm.some(c => c.startsWith("descri") || c === "extenso");
    if (!hasSaldoAtual || !hasDescricao) continue;
    headerIdx = i;
    norm.forEach((c, j) => {
      if (c === "extenso" || c === "código" || c === "codigo" || c === "conta") cols.conta = j;
      else if (c === "reduzido") cols.reduzido = j;
      else if (c.startsWith("descri")) cols.descricao = j;
      else if (c.includes("saldo anterior")) cols.saldoAnterior = j;
      else if (c === "débito" || c === "debito") cols.debito = j;
      else if (c === "crédito" || c === "credito") cols.credito = j;
      else if (c.includes("saldo mês") || c.includes("saldo mes") || c.includes("movimento")) cols.saldoMes = j;
      else if (c.includes("saldo atual") || c === "saldo final") cols.saldoAtual = j;
    });
    if (cols.conta === undefined) cols.conta = 0;
    if (cols.descricao === undefined) cols.descricao = 1;
    if (cols.saldoAtual === undefined) return null;
    break;
  }
  if (headerIdx === -1) return null;

  // ── MULTI-MÊS (cenário B do MD): detecta múltiplas colunas com headers de mês ──
  // Verifica o header atual e a linha imediatamente acima (templates BEX costumam
  // ter "Saldo Atual" na linha N e "JAN/2024 | FEV/2024 | ..." em N-1 ou N+1).
  const monthCols: Array<{ idx: number; mesKey: string; label: string }> = [];
  const addMonthCol = (col: { idx: number; mesKey: string; label: string }) => {
    if (!monthCols.find(m => m.idx === col.idx || m.mesKey === col.mesKey)) monthCols.push(col);
  };
  const searchMonthNear = (colIdx: number): { mesKey: string; label: string } | null => {
    const rowsToSearch = [jsonData[headerIdx] || [], headerIdx > 0 ? (jsonData[headerIdx - 1] || []) : [], headerIdx > 1 ? (jsonData[headerIdx - 2] || []) : []];
    for (const r of rowsToSearch) {
      for (let j = colIdx; j >= Math.max(0, colIdx - 8); j--) {
        const ref = detectMonthFromYearLabel(String(r[j] || ""));
        if (ref && ref.confidence >= 0.8) return { mesKey: ref.key, label: ref.label };
      }
    }
    return null;
  };
  const headerNorm = (jsonData[headerIdx] || []).map(c => String(c || "").toLowerCase().trim());
  headerNorm.forEach((c, idx) => {
    if (!(c.includes("saldo atual") || c === "saldo final")) return;
    const ref = searchMonthNear(idx);
    if (ref) addMonthCol({ idx, mesKey: ref.mesKey, label: ref.label });
  });
  const candidateRows: unknown[][] = [
    jsonData[headerIdx] || [],
    headerIdx > 0 ? (jsonData[headerIdx - 1] || []) : [],
    jsonData[headerIdx + 1] || [],
  ];
  for (const r of candidateRows) {
    const found = extractColumnMonths(r, { fileName });
    for (const f of found) {
      addMonthCol(f);
    }
  }
  // Reconcilia com o range do nome do arquivo (corrige anos espúrios inferidos)
  if (fileName && monthCols.length > 0) {
    const reconciled = reconcileMonthsWithFilename(monthCols, fileName);
    monthCols.length = 0;
    reconciled.forEach(m => monthCols.push(m));
  }
  // Só ativa multi-mês se houver ≥2 meses distintos detectados
  const useMultiMonth = monthCols.length >= 2;

  // Coleta todos os códigos para identificar quais são analíticos (folha)
  const allCodes = new Set<string>();
  for (let i = headerIdx + 1; i < jsonData.length; i++) {
    const c = String(jsonData[i]?.[cols.conta] ?? "").trim();
    if (c) allCodes.add(c);
  }
  const isLeaf = (code: string): boolean => {
    if (!code) return false;
    // Regra estrita BEx: códigos analíticos têm 10 dígitos no "Extenso"
    const onlyDigits = code.replace(/\D/g, "");
    if (onlyDigits.length === 10) return true;
    // Heurística complementar: se nenhum outro código começa com este + dígito, é folha
    for (const other of allCodes) {
      if (other !== code && other.startsWith(code) && other.length > code.length) return false;
    }
    return true;
  };

  const parseNumCell = (raw: unknown): number => {
    if (typeof raw === "number") return raw;
    return parseFloat(String(raw ?? "0").replace(/[^\d.,-]/g, "").replace(",", "."));
  };

  const periodLabel = "atual";
  const rows: BalanceteRowParsed[] = [];
  for (let i = headerIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    const conta = String(row[cols.conta] ?? "").trim();
    const desc = String(row[cols.descricao] ?? "").trim();
    if (!conta && !desc) continue;
    // GRUPO-FIRST TEXTUAL: preserva linhas-totalizadoras de Grupo de Resultado
    // (Ativo Circulante, Passivo Circulante, Receita Bruta…) mesmo quando não
    // são folhas. Sub-totais sem rótulo canônico continuam pulados para evitar
    // dupla contagem. Cobre planos não-padrão (Giannini, etc.).
    const grupoCanonico = matchGrupoCanonico(desc);
    if (!isLeaf(conta) && !grupoCanonico) continue;
    const ref1 = grupoCanonico ?? inferRefByCode(conta, desc);

    if (useMultiMonth) {
      // Emite uma entrada por mês detectado nas colunas
      const values: Record<string, number> = {};
      let anyValid = false;
      for (const mc of monthCols) {
        const v = parseNumCell(row[mc.idx]);
        if (isFinite(v) && v !== 0) { values[mc.mesKey] = v; anyValid = true; }
        else if (isFinite(v)) { values[mc.mesKey] = 0; }
      }
      if (anyValid) rows.push({ conta, descricao: desc || conta, ref1, values });
    } else {
      const saldoNum = parseNumCell(row[cols.saldoAtual]);
      if (!isFinite(saldoNum)) continue;
      rows.push({ conta, descricao: desc || conta, ref1, values: { [periodLabel]: saldoNum } });
    }
  }
  return rows.length > 0
    ? { rows, periodLabel: useMultiMonth ? monthCols[0].mesKey : periodLabel, multiMonth: useMultiMonth }
    : null;
}

/* ── Parse spreadsheet ── */
export async function parseSpreadsheet(file: File): Promise<ParsedFinancialData> {
  const buffer = await file.arrayBuffer();
  const workbook = await readWorkbook(buffer);

  const allRows: Array<{ conta: string; descricao: string; values: Record<string, number>; ref1?: string }> = [];
  const years = new Set<string>();

  // ── 1) Template "Balancete Mensal BR" — itera TODAS as sheets ──
  // Cada sheet pode ser um mês distinto (multi-arquivo em 1 workbook).
  // Atribuição de mês por sheet:
  //   (a) cenário B (multi-mês interno por colunas) — mantém o que vier
  //   (b) sheetName via detectMonthFromYearLabel (ex: "Ago/2025", "08-2025")
  //   (c) intervalo no nome do arquivo "08.2025 a 01.2026" — sequencial
  //   (d) detectMonthFromFilename — para a única sheet
  type SheetParse = { sheetName: string; rows: BalanceteRowParsed[]; multiMonth: boolean; assignedMes: string | null };
  const sheetParses: SheetParse[] = [];

  for (const sheetName of workbook.sheetNames) {
    const jsonData = workbook.sheetToMatrix(sheetName);
    const tpl = tryParseBalanceteMensalBR(jsonData, file.name);
    if (!tpl || tpl.rows.length === 0) continue;
    const fromName = detectMonthFromYearLabel(sheetName);
    sheetParses.push({
      sheetName,
      rows: tpl.rows,
      multiMonth: !!tpl.multiMonth,
      assignedMes: fromName && fromName.confidence >= 0.8 ? fromName.key : null,
    });
  }

  // Deduplica sheets idênticas sem mês (evita dupla contagem de cópias)
  const dedupedSheets: SheetParse[] = [];
  const seenSig = new Set<string>();
  for (const sp of sheetParses) {
    const sig = `${sp.rows.length}::${sp.rows[0]?.conta || ""}::${sp.rows[sp.rows.length - 1]?.conta || ""}`;
    if (seenSig.has(sig) && !sp.assignedMes) continue;
    seenSig.add(sig);
    dedupedSheets.push(sp);
  }

  if (dedupedSheets.length > 0) {
    const noneAssigned = dedupedSheets.every(s => !s.assignedMes && !s.multiMonth);
    if (noneAssigned) {
      const range = detectMonthRangeFromFilename(file.name);
      if (range.length > 0) {
        const assignCount = Math.min(dedupedSheets.length, range.length);
        for (let i = 0; i < assignCount; i++) dedupedSheets[i].assignedMes = range[i].key;
      } else {
        const fname = detectMonthFromFilename(file.name);
        if (fname && dedupedSheets.length === 1) dedupedSheets[0].assignedMes = fname.key;
      }
    }

    for (const sp of dedupedSheets) {
      if (sp.multiMonth) {
        for (const r of sp.rows) {
          Object.keys(r.values).forEach(k => years.add(k));
          allRows.push(r);
        }
      } else if (sp.assignedMes) {
        years.add(sp.assignedMes);
        for (const r of sp.rows) {
          const saldo = r.values["atual"] ?? Object.values(r.values)[0] ?? 0;
          allRows.push({ ...r, values: { [sp.assignedMes]: saldo } });
        }
      } else {
        years.add("atual");
        for (const r of sp.rows) allRows.push(r);
      }
    }
  }
  if (allRows.length > 0) {
    // Mescla linhas do mesmo código (sheets diferentes) somando values por mês
    const merged = new Map<string, { conta: string; descricao: string; values: Record<string, number>; ref1?: string }>();
    for (const r of allRows) {
      const k = `${r.conta}::${r.descricao}`;
      const cur = merged.get(k);
      if (!cur) merged.set(k, { conta: r.conta, descricao: r.descricao, ref1: r.ref1, values: { ...r.values } });
      else {
        if (!cur.ref1 && r.ref1) cur.ref1 = r.ref1;
        for (const [mk, v] of Object.entries(r.values)) cur.values[mk] = (cur.values[mk] || 0) + v;
      }
    }
    const allRowsMerged = Array.from(merged.values());
    const balanco: typeof allRows = [];
    const dre: typeof allRows = [];
    for (const r of allRowsMerged) {
      const p = (r.conta || "").charAt(0);
      // Grupos 3 a 8 são contas de resultado (DRE/Custo/Despesa/Resultado)
      if (["3", "4", "5", "6", "7", "8"].includes(p)) dre.push(r);
      else balanco.push(r);
    }
    return {
      balanco: balanco.length > 0 ? balanco : allRowsMerged,
      dre,
      years: Array.from(years).sort(),
      documentType: "balancete",
      ocrScore: 0.99,
    };
  }

  // 2) Fallback: parser anterior — agora reconhece colunas mês/ano (MM/YYYY, Ago/2025…)
  for (const sheetName of workbook.sheetNames) {
    const jsonData = workbook.sheetToMatrix(sheetName);

    if (jsonData.length < 2) continue;

    let headerRowIdx = -1;
    let yearColumns: { idx: number; year: string }[] = [];

    // Tenta primeiro detectar colunas com mês+ano (preferido)
    for (let i = 0; i < Math.min(15, jsonData.length); i++) {
      const row = jsonData[i] as unknown[];
      if (!row) continue;
      // Combina a linha atual com adjacentes para casos de cabeçalho em duas linhas
      const combined = row.map((c, j) => {
        const above = (jsonData[i - 1]?.[j] ?? "") as unknown;
        const below = (jsonData[i + 1]?.[j] ?? "") as unknown;
        return `${String(above)} ${String(c)} ${String(below)}`.trim();
      });
      const monthCols0 = extractColumnMonths(combined, { fileName: file.name });
      const monthCols = file.name ? reconcileMonthsWithFilename(monthCols0, file.name) : monthCols0;
      if (monthCols.length >= 1) {
        headerRowIdx = i;
        yearColumns = monthCols.map(mc => ({ idx: mc.idx, year: mc.mesKey })); // year aqui já é YYYY-MM
        break;
      }
    }

    // Se não achou meses, usa fallback antigo (apenas ano)
    if (headerRowIdx === -1) {
      for (let i = 0; i < Math.min(10, jsonData.length); i++) {
        const row = jsonData[i] as unknown[];
        if (!row) continue;
        const foundYears: { idx: number; year: string }[] = [];
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || "").trim();
          const yearMatch = cell.match(/20\d{2}/);
          if (yearMatch) foundYears.push({ idx: j, year: yearMatch[0] });
        }
        if (foundYears.length >= 1) {
          headerRowIdx = i;
          yearColumns = foundYears;
          break;
        }
      }
    }

    if (headerRowIdx === -1 || yearColumns.length === 0) continue;

    yearColumns.forEach(yc => years.add(yc.year));

    const headerRow = jsonData[headerRowIdx];
    let contaColIdx = -1;
    let descColIdx = -1;

    for (let j = 0; j < (headerRow?.length || 0); j++) {
      const cell = String(headerRow?.[j] || "").toLowerCase().trim();
      if (contaColIdx === -1 && (cell.includes("conta") || cell.includes("código") || cell.includes("cod"))) {
        contaColIdx = j;
      }
      if (descColIdx === -1 && (cell.includes("descri") || cell.includes("nome") || cell.includes("label"))) {
        descColIdx = j;
      }
    }

    if (contaColIdx === -1) contaColIdx = 0;
    if (descColIdx === -1) descColIdx = contaColIdx === 0 ? 1 : 0;

    for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;

      const contaRaw = String(row[contaColIdx] || "").trim();
      const descRaw = String(row[descColIdx] || "").trim();

      if (!contaRaw && !descRaw) continue;

      const values: Record<string, number> = {};
      for (const yc of yearColumns) {
        const cellValue = row[yc.idx];
        const numValue = typeof cellValue === "number"
          ? cellValue
          : parseFloat(String(cellValue || "0").replace(/[^\d.,-]/g, "").replace(",", "."));
        values[yc.year] = isNaN(numValue) ? 0 : numValue;
      }

      allRows.push({
        conta: contaRaw,
        descricao: descRaw || contaRaw,
        ref1: inferRefByCode(contaRaw, descRaw),
        values,
      });
    }
  }

  // Separate balance sheet from income statement
  const balanco: typeof allRows = [];
  const dre: typeof allRows = [];

  for (const row of allRows) {
    const conta = row.conta.toLowerCase();
    const desc = row.descricao.toLowerCase();

    if (
      conta.startsWith("3") ||
      desc.includes("receita") ||
      desc.includes("custo") ||
      desc.includes("despesa") ||
      desc.includes("lucro") ||
      desc.includes("resultado") ||
      desc.includes("lajir") ||
      desc.includes("ebitda") ||
      desc.includes("lair") ||
      desc.includes("ir/csll") ||
      desc.includes("imposto")
    ) {
      dre.push(row);
    } else {
      balanco.push(row);
    }
  }

  return {
    balanco: balanco.length > 0 ? balanco : allRows,
    dre,
    years: Array.from(years).sort(),
  };
}

/* ── Pipeline pré-processamento (normalização + few-shot + score) ── */
export interface PipelineResult {
  document_id: string;
  normalized: Array<{ conta_original: string; conta_normalizada: string; valor: number; tipo: string; categoria: string; matched: boolean }>;
  few_shot_examples: Array<{ input: any; output: any }>;
  validation: { valid: boolean; ativo: number; passivo: number; pl: number; diff: number; alertas: string[] };
  scores: { ocr: number; mapping: number; validation: number; quality: number };
}

export type DedupDataKind = "balanco" | "dre" | "indice" | "unidade" | "auto";
export interface DedupOptions {
  dataKind?: DedupDataKind;
  eps?: number;
  decimals?: number;
  proxWindow?: number;
  relTol?: number;
}
export interface DedupConfig {
  balanco?: DedupOptions;
  dre?: DedupOptions;
}

export interface PipelineProgressEvent {
  status: string;
  progress: string | null;
  documentId: string;
}

export async function runAuditPipeline(
  parsedData: ParsedFinancialData,
  fileName: string,
  companyId?: string,
  existingDocumentId?: string,
  dedup?: DedupConfig,
  onProgress?: (ev: PipelineProgressEvent) => void,
  forceReprocess?: boolean,
): Promise<PipelineResult | null> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  try {
    // 1. Dispara pipeline (resposta 202 imediata, processamento em background)
    const response = await fetch(`${SUPABASE_URL}/functions/v1/audit-pipeline-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        company_id: companyId,
        document_id: existingDocumentId,
        file_name: fileName,
        balanco: parsedData.balanco,
        dre: parsedData.dre,
        documentInfo: parsedData.documentInfo,
        ocr_score: parsedData.ocrScore,
        ...(dedup ? { dedup } : {}),
        ...(forceReprocess ? { force_reprocess: true } : {}),
      }),
    });
    if (!response.ok) {
      // 409 = pipeline em uso para a mesma empresa (lock por company_id)
      if (response.status === 409) {
        try {
          const body = await response.json();
          onProgress?.({
            status: "error",
            progress: body?.message || "Já existe um processamento em andamento para esta empresa.",
            documentId: body?.active_document_id,
          });
        } catch { /* ignore */ }
        return null;
      }
      console.warn("Pipeline enqueue falhou:", response.status);
      return null;
    }
    const enqueue = await response.json();
    const documentId: string | undefined = enqueue?.document_id;
    if (!documentId) return null;

    onProgress?.({ status: "queued", progress: "Iniciando pipeline...", documentId });

    // 2a. Realtime subscription para receber updates de progress imediatos
    const channel = supabase
      .channel(`pipeline-doc-${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pipeline_documents",
          filter: `id=eq.${documentId}`,
        },
        (payload) => {
          const row: any = payload.new;
          if (row) {
            onProgress?.({
              status: row.status ?? "processing",
              progress: row.progress ?? null,
              documentId,
            });
          }
        },
      )
      .subscribe();

    // 2b. Polling como fallback (caso realtime perca um evento) até status final — até 8min
    const MAX_WAIT_MS = 8 * 60 * 1000;
    const POLL_MS = 3000;
    const t0 = Date.now();
    let finalStatus: string | null = null;
    try {
      while (Date.now() - t0 < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const { data: doc } = await supabase
          .from("pipeline_documents")
          .select("status, error_message, progress")
          .eq("id", documentId)
          .maybeSingle();
        const st = (doc as any)?.status;
        const pg = (doc as any)?.progress ?? null;
        if (st) onProgress?.({ status: st, progress: pg, documentId });
        if (st === "completed" || st === "failed") {
          finalStatus = st;
          if (st === "failed") {
            console.warn("Pipeline failed:", (doc as any)?.error_message);
            return null;
          }
          break;
        }
      }
    } finally {
      supabase.removeChannel(channel);
    }
    if (finalStatus !== "completed") {
      console.warn("Pipeline timeout aguardando processamento");
      return null;
    }

    // 3. Reconstrói PipelineResult a partir das tabelas finais
    const [{ data: balRows }, { data: parRows }, { data: fsRows }] = await Promise.all([
      supabase
        .from("balancete_data")
        .select("conta_original, conta_normalizada, valor, tipo, categoria")
        .eq("document_id", documentId),
      supabase
        .from("pipeline_analysis_results")
        .select("indicadores, alertas, ocr_score, mapping_score, validation_score, quality_score")
        .eq("document_id", documentId)
        .maybeSingle(),
      supabase
        .from("dataset_validated")
        .select("input_json, output_corrected")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const par = (parRows as any) || {};
    const indic = par.indicadores || {};
    const ativo = Number(indic.ativo_total || 0);
    const passivo = Number(indic.passivo_total || 0);
    const pl = Number(indic.pl || 0);
    const diff = Math.abs(ativo - (passivo + pl));

    return {
      document_id: documentId,
      normalized: (balRows || []).map((r: any) => ({
        conta_original: r.conta_original,
        conta_normalizada: r.conta_normalizada,
        valor: Number(r.valor),
        tipo: r.tipo,
        categoria: r.categoria,
        matched: false,
      })),
      few_shot_examples: (fsRows || []).map((r: any) => ({
        input: r.input_json,
        output: r.output_corrected,
      })),
      validation: {
        valid: (par.validation_score || 0) >= 0.98,
        ativo,
        passivo,
        pl,
        diff,
        alertas: par.alertas || [],
      },
      scores: {
        ocr: Number(par.ocr_score || 0),
        mapping: Number(par.mapping_score || 0),
        validation: Number(par.validation_score || 0),
        quality: Number(par.quality_score || 0),
      },
    };
  } catch (e) {
    console.warn("Pipeline pré-processamento erro:", e);
    return null;
  }
}

/* ── Call audit-analyze edge function (com pipeline opcional) ── */
export async function analyzeFinancialData(
  parsedData: ParsedFinancialData,
  config: { depth: string; purpose: string },
  pipeline?: PipelineResult | null,
  ctx?: { companyId?: string | null; periodo?: string | null; deterministicFacts?: any | null }
): Promise<any> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Enriquecer documentInfo com contexto para ativar L0 cache (audit_account_cache)
  const docInfo: any = { ...(parsedData.documentInfo || {}) };
  if (ctx?.companyId && !docInfo.companyId) docInfo.companyId = ctx.companyId;
  if (ctx?.periodo && !docInfo.periodo) docInfo.periodo = ctx.periodo;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/audit-analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      balanco: parsedData.balanco,
      dre: parsedData.dre,
      documentInfo: docInfo,
      config,
      pipeline: pipeline
        ? {
            normalized: pipeline.normalized,
            few_shot_examples: pipeline.few_shot_examples,
            validation: pipeline.validation,
            quality_score: pipeline.scores.quality,
          }
        : undefined,
      deterministicFacts: ctx?.deterministicFacts ?? null,
    }),
  });


  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return { ...data.analysis, _pipeline: pipeline || null };
}

/* ── Stream chat with AI auditor ── */
export async function streamAuditChat({
  messages,
  context,
  onDelta,
  onDone,
  onError,
}: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  context?: any;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError?: (error: string) => void;
}) {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/audit-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ messages, context }),
  });

  if (!resp.ok || !resp.body) {
    const err = await resp.json().catch(() => ({ error: "Erro ao conectar com o agente IA" }));
    onError?.(err.error || `HTTP ${resp.status}`);
    onDone();
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  // Flush remaining
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}
