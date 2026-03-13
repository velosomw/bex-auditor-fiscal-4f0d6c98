import * as XLSX from "xlsx";

export interface ParsedFinancialData {
  balanco: Array<{ conta: string; descricao: string; values: Record<string, number> }>;
  dre: Array<{ conta: string; descricao: string; values: Record<string, number> }>;
  years: string[];
  pdfType?: string;
  documentInfo?: { empresa?: string; periodo?: string; tipo?: string };
  documentType?: string; // balancete, balanço, dre, dfc, extrato
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
export async function parseDocumentAI(file: File): Promise<ParsedFinancialData> {
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

  return parseDocumentAI_internal(fileBase64, file.name, mimeType);
}

async function parseDocumentAI_internal(fileBase64: string, fileName: string, mimeType: string): Promise<ParsedFinancialData> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/audit-parse-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ fileBase64, fileName, mimeType }),
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
  };
}

/* ── Parse any supported file ── */
export async function parseFile(file: File): Promise<ParsedFinancialData> {
  if (isPDF(file) || isDocument(file)) {
    return parseDocumentAI(file);
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

/* ── Parse spreadsheet ── */
export async function parseSpreadsheet(file: File): Promise<ParsedFinancialData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const allRows: Array<{ conta: string; descricao: string; values: Record<string, number> }> = [];
  const years = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    if (jsonData.length < 2) continue;

    let headerRowIdx = -1;
    let yearColumns: { idx: number; year: string }[] = [];

    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i] as unknown[];
      if (!row) continue;

      const foundYears: { idx: number; year: string }[] = [];
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || "").trim();
        const yearMatch = cell.match(/20\d{2}/);
        if (yearMatch) {
          foundYears.push({ idx: j, year: yearMatch[0] });
        }
      }
      if (foundYears.length >= 1) {
        headerRowIdx = i;
        yearColumns = foundYears;
        break;
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

/* ── Call audit-analyze edge function ── */
export async function analyzeFinancialData(
  parsedData: ParsedFinancialData,
  config: { depth: string; purpose: string }
): Promise<any> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/audit-analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      balanco: parsedData.balanco,
      dre: parsedData.dre,
      documentInfo: parsedData.documentInfo,
      config,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.analysis;
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
