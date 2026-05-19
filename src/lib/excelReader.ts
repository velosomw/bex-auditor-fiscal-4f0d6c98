/**
 * Substituto seguro do `xlsx` (vulnerabilidade High SheetJS) usando ExcelJS.
 * Mantém a API mínima usada no projeto: ler workbook a partir de ArrayBuffer
 * e converter uma worksheet em matriz 0-indexada (`unknown[][]`) equivalente a
 * `XLSX.utils.sheet_to_json(sheet, { header: 1 })`.
 */
import ExcelJS from "exceljs";

export type Matrix = unknown[][];

export interface ReadWorkbookResult {
  workbook: ExcelJS.Workbook;
  sheetNames: string[];
  /** Converte a worksheet de nome `name` para matriz 0-indexada. */
  sheetToMatrix: (name: string) => Matrix;
}

/** Resolve o valor "bruto" de uma célula ExcelJS para tipos primitivos. */
function unwrapCell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Formula cells: { formula, result }
    if ("result" in v) return unwrapCell(v.result);
    // Rich text: { richText: [{text}] }
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map(r => r.text || "").join("");
    }
    // Hyperlink: { text, hyperlink }
    if ("text" in v) return v.text as unknown;
    // Shared formula / others — fall back to string
    if ("sharedFormula" in v && "result" in v) return unwrapCell(v.result);
  }
  return value;
}

function worksheetToMatrix(ws: ExcelJS.Worksheet): Matrix {
  const out: Matrix = [];
  const rowCount = ws.actualRowCount || ws.rowCount || 0;
  const colCount = ws.actualColumnCount || ws.columnCount || 0;
  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    const arr: unknown[] = [];
    for (let c = 1; c <= colCount; c++) {
      arr.push(unwrapCell(row.getCell(c).value));
    }
    out.push(arr);
  }
  return out;
}

export async function readWorkbook(buffer: ArrayBuffer): Promise<ReadWorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetNames: string[] = [];
  workbook.eachSheet(ws => sheetNames.push(ws.name));
  return {
    workbook,
    sheetNames,
    sheetToMatrix: (name: string) => {
      const ws = workbook.getWorksheet(name);
      if (!ws) return [];
      return worksheetToMatrix(ws);
    },
  };
}
