/**
 * Substituto seguro do `xlsx` (vulnerabilidade High SheetJS) usando ExcelJS.
 * Import dinâmico para que ~600KB de exceljs só entrem no bundle quando
 * o usuário realmente abrir/parsear uma planilha.
 */
import type ExcelJSNS from "exceljs";

export type Matrix = unknown[][];

export interface ReadWorkbookResult {
  workbook: ExcelJSNS.Workbook;
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

function worksheetToMatrix(ws: ExcelJSNS.Worksheet): Matrix {
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
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetNames: string[] = [];
  workbook.eachSheet((ws) => sheetNames.push(ws.name));
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
