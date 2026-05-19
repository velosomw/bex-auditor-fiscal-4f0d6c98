/**
 * Parser FIXO (não-genérico) para extração de séries de gráficos das abas:
 *   - "Dados para Graficos"  → Balanço (linhas 4..13, colunas 4..15 do Excel)
 *   - "Folha"                → Nº de funcionários (linha 3) e folha PJ
 *   - "FCP - 6 meses"        → Saldo acumulado (R2) + fluxo mensal (TOTAL_ANO)
 *   - "Fluxo de Caixa - Prev x Realiz" → Operacional/Não-Op Previsto vs Realizado
 *
 * Regras críticas (ver MD seção 5 e 7):
 *   - Indexação por POSIÇÃO, não por nome.
 *   - NÃO reordenar, NÃO inferir, NÃO normalizar valores.
 *   - Datas normalizadas para "Mmm/AA" pt-BR.
 *   - Valores nulos / #N/A → null (mantemos os pontos para Recharts).
 */
import { readWorkbook, type ReadWorkbookResult } from "@/lib/excelReader";

const MES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MES_FULL: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, março: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s.startsWith("#")) return null; // #N/A, #REF!
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return null;
};

const labelMes = (raw: unknown): string | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  // Date object (xlsx cellDates: true)
  if (raw instanceof Date) {
    return `${MES_ABREV[raw.getMonth()]}/${String(raw.getFullYear()).slice(-2)}`;
  }
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    // "Setembro 2023"
    const m = s.match(/^([a-zçãéê]+)\s+(\d{4})$/i);
    if (m && MES_FULL[m[1]] !== undefined) {
      return `${MES_ABREV[MES_FULL[m[1]]]}/${m[2].slice(-2)}`;
    }
    // "jul" "ago" etc
    const a = s.match(/^([a-zç]{3,})/);
    if (a) {
      const key = a[1];
      const idx = MES_ABREV.findIndex(m => m.toLowerCase() === key.slice(0, 3));
      if (idx >= 0) return MES_ABREV[idx];
    }
    return raw.toString();
  }
  return String(raw);
};

export interface BalancoSerie { nome: string; valores: (number | null)[] }
export interface BalancoChartData { meses: string[]; series: BalancoSerie[] }

export interface FolhaChartData {
  meses: string[];
  funcionarios: (number | null)[];
  folhaPagamento: (number | null)[];
  contratadosPJ: (number | null)[];
}

export interface FCPChartData {
  meses: string[];
  saldoAcumulado: (number | null)[];
  fluxoMensal: (number | null)[];
}

export interface FluxoPrevRealCategoria {
  tipo: string;
  previsto: (number | null)[];
  realizado: (number | null)[];
}
export interface FluxoPrevRealChartData {
  meses: string[];
  entradas: FluxoPrevRealCategoria[];
  saidas: FluxoPrevRealCategoria[];
}

export interface BalanceteChartsResult {
  hasData: boolean;
  fileName?: string;
  balanco?: BalancoChartData;
  folha?: FolhaChartData;
  fcp?: FCPChartData;
  prevReal?: FluxoPrevRealChartData;
}

// ─── ABA 1: Dados para Graficos ────────────────────────────────────────────────
// Layout fixo:
//   R3: meses em colunas D..O  (índices 3..14)
//   R4..R13: categorias na coluna C (índice 2), valores nas colunas D..O
function parseBalanco(rows: unknown[][]): BalancoChartData | undefined {
  if (rows.length < 14) return undefined;
  const headerRow = rows[2] || []; // linha 3
  const meses: string[] = [];
  const colIdx: number[] = [];
  for (let c = 3; c <= 14; c++) {
    const lbl = labelMes(headerRow[c]);
    if (lbl) { meses.push(lbl); colIdx.push(c); }
  }
  if (!meses.length) return undefined;

  const series: BalancoSerie[] = [];
  for (let r = 3; r <= 12; r++) {
    const row = rows[r] || [];
    const nome = (row[2] ?? "").toString().trim();
    if (!nome) continue;
    const valores = colIdx.map(c => toNum(row[c]));
    // só inclui série se ao menos 1 valor numérico
    if (valores.some(v => v !== null)) {
      series.push({ nome, valores });
    }
  }
  return series.length ? { meses, series } : undefined;
}

// ─── ABA 2: Folha ──────────────────────────────────────────────────────────────
// R2: header com pares [data, "Variação"] em colunas B,C,D,E... → meses em B,D,F,H,J,L,N,P (idx 1,3,5,7,9,11,13,15)
// R3: Nº funcionários
// R11: Folha de pagamento
// R12: Contratados PJ
function parseFolha(rows: unknown[][]): FolhaChartData | undefined {
  if (rows.length < 12) return undefined;
  const header = rows[1] || [];
  const colIdx: number[] = [];
  const meses: string[] = [];
  for (let c = 1; c < header.length; c += 2) {
    const lbl = labelMes(header[c]);
    if (lbl) { colIdx.push(c); meses.push(lbl); }
  }
  if (!meses.length) return undefined;
  const pickRow = (r: number) => colIdx.map(c => toNum((rows[r] || [])[c]));
  return {
    meses,
    funcionarios: pickRow(2),       // R3
    folhaPagamento: pickRow(10),    // R11
    contratadosPJ: pickRow(11),     // R12
  };
}

// ─── ABA 3: FCP - 6 meses ──────────────────────────────────────────────────────
// R2: "SALDO ACUMULADO =>" e valores em colunas F..L (índices 5..11), 7 períodos
// R6: header de meses em colunas F..L (idx 5..11)  (jul..dez + 2025-01)
// R21: TOTAL_ANO → fluxo mensal nas mesmas colunas
function parseFCP(rows: unknown[][]): FCPChartData | undefined {
  if (rows.length < 22) return undefined;
  const r2 = rows[1] || [];
  const r6 = rows[5] || [];
  const r21 = rows[20] || [];
  const meses: string[] = [];
  const colIdx: number[] = [];
  for (let c = 5; c <= 11; c++) {
    const lbl = labelMes(r6[c]);
    if (lbl) { meses.push(lbl); colIdx.push(c); }
  }
  if (!meses.length) return undefined;
  const saldoAcumulado = colIdx.map(c => toNum(r2[c]));
  const fluxoMensal = colIdx.map(c => toNum(r21[c]));
  return { meses, saldoAcumulado, fluxoMensal };
}

// ─── ABA 4: Fluxo de Caixa - Prev x Realiz ─────────────────────────────────────
// R3: meses em colunas C,E,G,I,K,M,O (idx 2,4,6,8,10,12,14) — cada mês ocupa 2 cols
// R4: header "Previsto/Realizado" repete
// R5: Operacional ENTRADAS;  R6: Não Operacional ENTRADAS
// R10: Operacional SAÍDAS;   R11: Não Operacional SAÍDAS
function parsePrevReal(rows: unknown[][]): FluxoPrevRealChartData | undefined {
  if (rows.length < 12) return undefined;
  const r3 = rows[2] || [];
  const meses: string[] = [];
  const prevCols: number[] = [];
  const realCols: number[] = [];
  for (let c = 2; c < r3.length; c += 2) {
    const lbl = labelMes(r3[c]);
    if (lbl) {
      meses.push(lbl);
      prevCols.push(c);
      realCols.push(c + 1);
    }
  }
  if (!meses.length) return undefined;

  const buildCat = (rowIdx: number, tipo: string): FluxoPrevRealCategoria => {
    const row = rows[rowIdx] || [];
    return {
      tipo,
      previsto: prevCols.map(c => toNum(row[c])),
      realizado: realCols.map(c => toNum(row[c])),
    };
  };

  const entradas: FluxoPrevRealCategoria[] = [];
  const saidas: FluxoPrevRealCategoria[] = [];

  // Linhas fixas conforme layout do template
  const opEnt = buildCat(4, "Operacional");
  const naoOpEnt = buildCat(5, "Não Operacional");
  const opSai = buildCat(9, "Operacional");
  const naoOpSai = buildCat(10, "Não Operacional");

  if (opEnt.previsto.some(isNum) || opEnt.realizado.some(isNum)) entradas.push(opEnt);
  if (naoOpEnt.previsto.some(isNum) || naoOpEnt.realizado.some(isNum)) entradas.push(naoOpEnt);
  if (opSai.previsto.some(isNum) || opSai.realizado.some(isNum)) saidas.push(opSai);
  if (naoOpSai.previsto.some(isNum) || naoOpSai.realizado.some(isNum)) saidas.push(naoOpSai);

  if (!entradas.length && !saidas.length) return undefined;
  return { meses, entradas, saidas };
}

// ─── Entrypoint ────────────────────────────────────────────────────────────────
const SHEET_ALIASES = {
  balanco: ["Dados para Graficos", "Dados para Gráficos", "Dados Graficos"],
  folha: ["Folha"],
  fcp: ["FCP - 6 meses", "FCP-6 meses", "FCP 6 meses"],
  prevReal: ["Fluxo de Caixa - Prev x Realiz", "Fluxo de Caixa Prev x Realiz", "Prev x Realiz"],
};

const findSheet = (wb: ReadWorkbookResult, aliases: string[]): string | undefined => {
  const names = wb.sheetNames;
  for (const a of aliases) {
    const exact = names.find(n => n === a);
    if (exact) return exact;
  }
  for (const a of aliases) {
    const norm = a.toLowerCase().replace(/\s+/g, "");
    const fuzzy = names.find(n => n.toLowerCase().replace(/\s+/g, "") === norm);
    if (fuzzy) return fuzzy;
  }
  return undefined;
};

export async function parseBalanceteCharts(file: File): Promise<BalanceteChartsResult> {
  const buf = await file.arrayBuffer();
  let wb: ReadWorkbookResult;
  try {
    wb = await readWorkbook(buf);
  } catch {
    return { hasData: false, fileName: file.name };
  }

  const result: BalanceteChartsResult = { hasData: false, fileName: file.name };

  const balancoName = findSheet(wb, SHEET_ALIASES.balanco);
  if (balancoName) result.balanco = parseBalanco(wb.sheetToMatrix(balancoName));

  const folhaName = findSheet(wb, SHEET_ALIASES.folha);
  if (folhaName) result.folha = parseFolha(wb.sheetToMatrix(folhaName));

  const fcpName = findSheet(wb, SHEET_ALIASES.fcp);
  if (fcpName) result.fcp = parseFCP(wb.sheetToMatrix(fcpName));

  const prName = findSheet(wb, SHEET_ALIASES.prevReal);
  if (prName) result.prevReal = parsePrevReal(wb.sheetToMatrix(prName));

  result.hasData = !!(result.balanco || result.folha || result.fcp || result.prevReal);
  return result;
}

export async function parseBalanceteChartsFromFiles(files: File[]): Promise<BalanceteChartsResult | null> {
  const SPREAD = /\.(xlsx|xls|xlsm|xlsb|xltx|xltm)$/i;
  // Prioriza arquivos cujo nome sugere "balancete" ou "base"
  const candidates = files.filter(f => SPREAD.test(f.name));
  if (!candidates.length) return null;
  const ordered = [
    ...candidates.filter(f => /balancete|base|relat/i.test(f.name)),
    ...candidates.filter(f => !/balancete|base|relat/i.test(f.name)),
  ];
  for (const f of ordered) {
    const r = await parseBalanceteCharts(f);
    if (r.hasData) return r;
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * FALLBACK — Deriva os gráficos a partir do balancete já analisado pela IA.
 * Usado quando o arquivo carregado NÃO é o template .xlsm (PDF, CSV, balancete
 * contábil genérico). A IA extrai contas + valores por período → reconstruímos
 * o "Balanço — Evolução Mensal" com as principais contas de liquidez/operação.
 * ────────────────────────────────────────────────────────────────────────────── */
interface ParsedLike {
  balanco: Array<{ conta: string; descricao: string; values: Record<string, number> }>;
  dre?: Array<{ conta: string; descricao: string; values: Record<string, number> }>;
  years: string[];
  fileName?: string;
  documentInfo?: { empresa?: string; periodo?: string };
}

// Mapeamento de palavras-chave → série do gráfico do balanço
const ACCOUNT_PATTERNS: Array<{ nome: string; rx: RegExp }> = [
  { nome: "Caixa e Equivalentes", rx: /\b(caixa|disponibilidade|equivalente|bancos?|aplica[cç][aã]o financeira)\b/i },
  { nome: "Estoque",              rx: /\bestoqu/i },
  { nome: "Clientes a Receber",   rx: /\b(clientes|duplicatas? a receber|contas? a receber)\b/i },
  { nome: "Ativo Circulante",     rx: /\bativo circulante\b/i },
  { nome: "Ativo Total",          rx: /\b(ativo total|total do ativo|total ativo)\b/i },
  { nome: "Fornecedores",         rx: /\bfornecedor/i },
  { nome: "Passivo Circulante",   rx: /\bpassivo circulante\b/i },
  { nome: "Patrimônio Líquido",   rx: /\b(patrim[oô]nio l[ií]quido|patrimonio liquido)\b/i },
];

const sortPeriods = (years: string[]): string[] => {
  // Tenta detectar formato "YYYY-MM" / "YYYY/MM" / "YYYY" e ordenar cronologicamente
  return [...years].sort((a, b) => {
    const na = a.replace(/\D/g, "");
    const nb = b.replace(/\D/g, "");
    return na.localeCompare(nb);
  });
};

const periodLabel = (p: string): string => {
  // "2024-01" → "Jan/24"; "2024" → "2024"
  const m = p.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    const idx = parseInt(m[2], 10) - 1;
    if (idx >= 0 && idx < 12) return `${MES_ABREV[idx]}/${m[1].slice(-2)}`;
  }
  return p;
};

export function deriveChartsFromParsedData(parsed: ParsedLike | null | undefined): BalanceteChartsResult | null {
  if (!parsed || !parsed.balanco?.length || !parsed.years?.length) return null;
  const periods = sortPeriods(parsed.years);
  if (!periods.length) return null;

  const meses = periods.map(periodLabel);
  const series: BalancoSerie[] = [];
  const seenNomes = new Set<string>();

  for (const pat of ACCOUNT_PATTERNS) {
    // Procura primeira conta do balanço cuja descrição/conta combina com o padrão
    const match = parsed.balanco.find(r => {
      const txt = `${r.descricao || ""} ${r.conta || ""}`;
      return pat.rx.test(txt);
    });
    if (!match) continue;
    const valores = periods.map(p => {
      const v = match.values?.[p];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    });
    if (valores.some(v => v !== null) && !seenNomes.has(pat.nome)) {
      series.push({ nome: pat.nome, valores });
      seenNomes.add(pat.nome);
    }
  }

  if (!series.length) return null;
  return {
    hasData: true,
    fileName: parsed.fileName || parsed.documentInfo?.empresa,
    balanco: { meses, series },
    // Folha / FCP / Prev x Realiz são abas específicas do template — não derivamos.
  };
}

/**
 * Resolve a fonte dos gráficos: tenta primeiro o template .xlsm; se não houver,
 * faz fallback para os dados extraídos pela IA durante a análise do balancete.
 */
export async function resolveBalanceteCharts(
  files: File[] | undefined,
  parsed: ParsedLike | null | undefined,
): Promise<BalanceteChartsResult | null> {
  if (files?.length) {
    const fromFile = await parseBalanceteChartsFromFiles(files);
    if (fromFile?.hasData) return fromFile;
  }
  return deriveChartsFromParsedData(parsed);
}
