import * as XLSX from "xlsx";

export interface ParsedFinancialData {
  balanco: Array<{ conta: string; descricao: string; values: Record<string, number> }>;
  dre: Array<{ conta: string; descricao: string; values: Record<string, number> }>;
  years: string[];
  pdfType?: string;
  documentInfo?: { empresa?: string; periodo?: string; tipo?: string };
}

/**
 * Check if a file is a PDF
 */
const SPREADSHEET_EXTENSIONS = [".xlsx", ".xls", ".csv", ".xlsm", ".xlsb", ".xltx", ".xltm"];
const PDF_EXTENSIONS = [".pdf"];
const DOCUMENT_EXTENSIONS = [".docx", ".doc", ".txt", ".rtf"];

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

/**
 * Convert a File to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Parse a PDF or document file by sending it to the audit-parse-pdf edge function.
 * Supports PDF (all types), Word (.docx/.doc), and text files (.txt/.rtf).
 */
export async function parseDocumentAI(file: File): Promise<ParsedFinancialData> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let fileBase64: string;
  let mimeType = file.type;

  // For .txt files, read as text and encode
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

  const response = await fetch(`${SUPABASE_URL}/functions/v1/audit-parse-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      fileBase64,
      fileName: file.name,
      mimeType,
    }),
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
  };
}

/**
 * Parse any supported file (spreadsheet, PDF, Word, or text)
 */
export async function parseFile(file: File): Promise<ParsedFinancialData> {
  if (isPDF(file) || isDocument(file)) {
    return parseDocumentAI(file);
  }
  return parseSpreadsheet(file);
}

/**
 * Parse an uploaded spreadsheet file (xlsx, xls, csv) and extract financial data.
 * Attempts to identify balance sheet and income statement rows.
 */
export async function parseSpreadsheet(file: File): Promise<ParsedFinancialData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const allRows: Array<{ conta: string; descricao: string; values: Record<string, number> }> = [];
  const years = new Set<string>();

  // Process each sheet
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    if (jsonData.length < 2) continue;

    // Find header row (look for year-like columns)
    let headerRowIdx = -1;
    let yearColumns: { idx: number; year: string }[] = [];

    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i] as unknown[];
      if (!row) continue;

      const foundYears: { idx: number; year: string }[] = [];
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || "").trim();
        // Match year patterns: 2020, 2021, 2022, 2023, 2024, 31/12/2023, etc.
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

    // Find account code and description columns
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

    // If no explicit columns found, try first two columns
    if (contaColIdx === -1) contaColIdx = 0;
    if (descColIdx === -1) descColIdx = contaColIdx === 0 ? 1 : 0;

    // Parse data rows
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

    // DRE accounts typically start with 3, or have revenue/cost keywords
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

/**
 * Call the audit-analyze edge function with parsed financial data.
 */
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

/**
 * Stream chat with the AI auditor.
 */
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
