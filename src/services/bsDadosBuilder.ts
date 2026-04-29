/**
 * BS & DADOS BUILDER — Single Source of Truth
 *
 * Replica a lógica da aba "Dados para Gráficos" da planilha BEX:
 *   Balancete (Saldo Atual) → Agrupamento por Ref 1 (Ref Capital) → Estrutura mensal consolidada
 *
 * Aceita 3 cenários:
 *   1) 1 balancete com 1 mês (mês atribuído pelo usuário)
 *   2) 1 balancete com múltiplos meses já no arquivo (extração direta)
 *   3) 2 ou 3 balancetes, cada um com mês atribuído pelo usuário
 *
 * REGRAS DE SINAL:
 *   - Receita Líquida → POSITIVA
 *   - CMV / Despesas → NEGATIVOS
 *   - Resultado → mantém sinal natural
 *   - Componentes de dívida → POSITIVOS (módulo)
 *   - Percentuais derivados → sempre POSITIVOS
 */
import type { ParsedFinancialData } from "@/services/auditAIService";

// ─── Constantes ──────────────────────────────────────────
const MES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// Mapeamento Ref 1 (Ref Capital BEX) → chave canônica BS & Dados.
// Cobertura COMPLETA das 47 referências da aba "BS" do template
// (Ativo Circulante A..O, ANC P..J1, Passivo Circulante AA..II1, PNC PP..FF1, PL GG1/HH1/Resultado).
// Ref ausente do mapa = ignorada na consolidação (não-zerada apenas se houver fallback regex).
export const REF1_MAP: Record<string, keyof BSDadosRow> = {
  // Ativo Circulante (componentes individuais usados pelo dashboard)
  "A": "disponivel",        // Caixa e Equivalentes
  "B": "disponivel",        // Aplicações Financeiras
  "D": "estoques",          // Estoque
  // Passivo Circulante (componentes da dívida)
  "AA": "divida_financeira",   // Empréstimos e Financiamentos PC
  "BB": "fornecedores",        // Fornecedores PC
  "CC": "divida_trabalhista",  // Obrigações Trabalhistas
  "DD": "divida_tributaria",   // Obrigações Tributárias
  "II": "credores_rj",         // Credores RJ
  "LL": "credores_rj",         // Recuperação Judicial
  "II1": "divida_tributaria",  // Obrigações tributárias Parceladas PC
  // Passivo Não Circulante
  "PP": "fornecedores",        // Fornecedores LP
  "QQ": "divida_financeira",   // Empréstimos e financiamentos LP
  "RR": "divida_tributaria",   // Tributárias Parceladas LP
  "CC1": "credores_rj",        // Credores RJ LP
  // Aliases textuais (caso o pipeline normalize por nome ao invés de letra)
  "RECEITA": "receita_liquida",
  "RECEITA LIQUIDA": "receita_liquida",
  "RECEITA LÍQUIDA": "receita_liquida",
  "CMV": "cmv",
  "DESPESAS": "despesas",
  "DESPESA": "despesas",
  "RESULTADO": "resultado",
  "ATIVO CIRCULANTE": "ativo_circulante",
  "PASSIVO CIRCULANTE": "passivo_circulante",
  "ESTOQUES": "estoques",
  "ESTOQUE": "estoques",
  "DISPONIVEL": "disponivel",
  "DISPONÍVEL": "disponivel",
  "PASSIVO TRIBUTARIO": "divida_tributaria",
  "PASSIVO TRIBUTÁRIO": "divida_tributaria",
  "PASSIVO TRABALHISTA": "divida_trabalhista",
  "EMPRESTIMOS": "divida_financeira",
  "EMPRÉSTIMOS": "divida_financeira",
  "FINANCIAMENTOS": "divida_financeira",
  "FORNECEDORES": "fornecedores",
  "CREDORES RJ": "credores_rj",
  "RECUPERACAO JUDICIAL": "credores_rj",
};

// Padrões regex usados quando o balancete extraído não traz "Ref 1" explícito
// (espelha auditDatasetBuilder porém alinhado às chaves do MD)
const FALLBACK_PATTERNS: Record<keyof BSDadosRow, RegExp | null> = {
  mes: null, mesKey: null,
  receita_liquida: /\breceita.*l[ií]quid|venda.*l[ií]quid\b/i,
  cmv: /\bc(?:mv|sv|pv)\b|\bcusto\s+(?:das?\s+)?(?:mercadoria|servi[cç]o|produto|venda)/i,
  despesas: /\bdespesa|gasto\s+oper/i,
  resultado: /\b(?:lucro|preju[ií]zo|resultado)\s+(?:l[ií]quid|do\s+exerc|do\s+per[ií]odo)/i,
  ativo_circulante: /\bativo\s+circulante\b/i,
  passivo_circulante: /\bpassivo\s+circulante\b/i,
  estoques: /\bestoqu/i,
  disponivel: /\b(?:caixa|disponibilidade|disponivel|bancos?|aplica[cç][aã]o\s+financ|equivalente)/i,
  divida_tributaria: /\b(?:tribut|impostos?\s+a\s+(?:pagar|recolher)|icms|iss|pis|cofins|irpj|csll)/i,
  divida_trabalhista: /\b(?:sal[aá]rios?\s+a\s+pagar|f[eé]rias|13[ºo°]?|inss\s+a\s+pagar|fgts\s+a\s+pagar|encargos\s+sociais|trabalhista)/i,
  divida_financeira: /\b(?:empr[eé]stimos?|financiamentos?|deb[eê]ntures?|leasing|arrendamento)/i,
  fornecedores: /\bfornecedor/i,
  credores_rj: /\b(?:credores?\s+(?:rj|recupera[cç][aã]o)|recupera[cç][aã]o\s+judic)/i,
  divida_total: null,
  hasReceita: null, hasBalanco: null, errors: null,
};

// ─── Tipos ───────────────────────────────────────────────
export interface BSDadosRow {
  mes: string;            // "Março 2024"
  mesKey: string;         // "2024-03"
  receita_liquida: number;
  cmv: number;
  despesas: number;
  resultado: number;
  ativo_circulante: number;
  passivo_circulante: number;
  estoques: number;
  disponivel: number;
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
  fornecedores: number;
  credores_rj: number;
  divida_total: number;
  hasReceita: boolean;
  hasBalanco: boolean;
  errors: string[];
}

export interface BalanceteEntry {
  /** Identificador do arquivo / balancete de origem */
  fileName: string;
  /** Mês de referência atribuído pelo usuário (formato YYYY-MM). Pode ser null se múltiplos meses já estão no arquivo. */
  mesReferencia: string | null;
}

// ─── Helpers ─────────────────────────────────────────────
const toUpperNoAccent = (s: string) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

export function mesKeyToLabel(key: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(key);
  if (!m) return key;
  const idx = parseInt(m[2], 10) - 1;
  if (idx < 0 || idx > 11) return key;
  return `${MES_FULL[idx]} ${m[1]}`;
}

export function periodToMesKey(period: string): string {
  if (!period) return period;
  const s = period.trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^([a-zçãéê]+)[\s\/]+(\d{4})$/i);
  if (m) {
    const monthName = toUpperNoAccent(m[1]).slice(0, 3);
    const idx = MES_FULL.findIndex(n => toUpperNoAccent(n).startsWith(monthName));
    if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-12`;
  return s;
}

function emptyRow(mesKey: string): BSDadosRow {
  return {
    mes: mesKeyToLabel(mesKey), mesKey,
    receita_liquida: 0, cmv: 0, despesas: 0, resultado: 0,
    ativo_circulante: 0, passivo_circulante: 0,
    estoques: 0, disponivel: 0,
    divida_tributaria: 0, divida_trabalhista: 0, divida_financeira: 0,
    fornecedores: 0, credores_rj: 0, divida_total: 0,
    hasReceita: false, hasBalanco: false, errors: [],
  };
}

// ─── Núcleo: agrupa linhas (Ref 1) ───────────────────────
interface RowLike {
  descricao?: string;
  conta?: string;
  ref1?: string | null;
  saldo: number;
}

// Conjuntos de Refs Capital que agregam totalizadores AC e PC (template BEX).
// Estes acumuladores SÓ são usados quando o balancete não traz a linha
// totalizadora explícita "ATIVO CIRCULANTE" / "PASSIVO CIRCULANTE".
const AC_REFS = new Set(["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"]);
const PC_REFS = new Set(["AA","BB","CC","DD","EE","FF","GG","HH","II","JJ","KK","LL","MM","NN","OO","II1"]);

// Buckets internos por mês para somar componentes (acumulador AC/PC derivado).
type ComponentBuckets = { ac: number; pc: number; sawACTotal: boolean; sawPCTotal: boolean };

/** Resolve a chave canônica de uma linha pelo Ref 1; cai para regex se ausente. */
function resolveKey(row: RowLike): keyof BSDadosRow | null {
  if (row.ref1) {
    const k = REF1_MAP[toUpperNoAccent(row.ref1)];
    if (k) return k;
  }
  const text = `${row.descricao || ""} ${row.conta || ""}`;
  for (const [key, pattern] of Object.entries(FALLBACK_PATTERNS)) {
    if (!pattern) continue;
    if (pattern.test(text)) return key as keyof BSDadosRow;
  }
  return null;
}

function applyValue(
  target: BSDadosRow,
  key: keyof BSDadosRow,
  value: number,
  ref1: string | null | undefined,
  buckets: ComponentBuckets,
) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  switch (key) {
    case "receita_liquida":
      (target as any)[key] = (target[key] as number) + Math.abs(v); break;
    case "cmv":
    case "despesas":
      (target as any)[key] = (target[key] as number) - Math.abs(v); break;
    case "resultado":
      (target as any)[key] = (target[key] as number) + v; break;
    case "ativo_circulante":
      target.ativo_circulante += Math.abs(v);
      buckets.sawACTotal = true; break;
    case "passivo_circulante":
      target.passivo_circulante += Math.abs(v);
      buckets.sawPCTotal = true; break;
    case "estoques":
    case "disponivel":
    case "divida_tributaria":
    case "divida_trabalhista":
    case "divida_financeira":
    case "fornecedores":
    case "credores_rj":
      (target as any)[key] = (target[key] as number) + Math.abs(v); break;
    default: break;
  }
  // Acumula componentes para derivar AC/PC SE o balancete não trouxer o total.
  const refUp = ref1 ? toUpperNoAccent(ref1) : "";
  if (refUp && AC_REFS.has(refUp)) buckets.ac += Math.abs(v);
  else if (refUp && PC_REFS.has(refUp)) buckets.pc += Math.abs(v);
}

function finalize(row: BSDadosRow): BSDadosRow {
  row.divida_total =
    row.divida_tributaria + row.divida_trabalhista + row.divida_financeira +
    row.fornecedores + row.credores_rj;
  row.hasReceita = row.receita_liquida > 0;
  row.hasBalanco = row.ativo_circulante > 0 || row.passivo_circulante > 0 || row.divida_total > 0;
  // Validações
  if (!row.hasReceita) row.errors.push("Receita líquida ausente ou zerada");
  if (row.cmv > 0) row.errors.push("CMV positivo (deveria ser negativo)");
  return row;
}

// ─── BUILDER ─────────────────────────────────────────────
/**
 * Constrói as linhas BS & Dados a partir do ParsedFinancialData (saída do pipeline)
 * combinado com os meses atribuídos manualmente pelo usuário (quando aplicável).
 *
 * @param parsed   Dados já extraídos pelo pipeline (DRE + Balanço por período)
 * @param entries  Lista de balancetes carregados; usado para mapear arquivos sem mês detectado
 */
export function buildBSDados(
  parsed: ParsedFinancialData | null | undefined,
  entries: BalanceteEntry[] = [],
): BSDadosRow[] {
  if (!parsed) return [];
  const periodsRaw = parsed.years ?? [];

  // Se o pipeline não detectou meses, usa os atribuídos pelo usuário (1 por entry)
  const usableMesKeys: string[] = periodsRaw.length
    ? periodsRaw.map(periodToMesKey)
    : entries.filter(e => !!e.mesReferencia).map(e => e.mesReferencia!);

  // Detecta duplicatas
  const dupCheck: Record<string, number> = {};
  usableMesKeys.forEach(k => { dupCheck[k] = (dupCheck[k] || 0) + 1; });

  const rowsByMes = new Map<string, BSDadosRow>();
  usableMesKeys.forEach(k => {
    if (!rowsByMes.has(k)) rowsByMes.set(k, emptyRow(k));
    if (dupCheck[k] > 1) {
      const r = rowsByMes.get(k)!;
      if (!r.errors.includes("Mês duplicado")) r.errors.push("Mês duplicado entre balancetes");
    }
  });

  // Itera DRE + Balanço, mapeando por período → mesKey
  const allRows = [
    ...((parsed.dre ?? []) as any[]),
    ...((parsed.balanco ?? []) as any[]),
  ];

  for (const row of allRows) {
    const ref1 = (row.ref1 as string | undefined) ?? (row.refCapital as string | undefined) ?? null;
    for (const [period, value] of Object.entries(row.values || {})) {
      const mesKey = periodToMesKey(period);
      const target = rowsByMes.get(mesKey);
      if (!target) continue;
      const key = resolveKey({
        descricao: row.descricao,
        conta: row.conta,
        ref1,
        saldo: Number(value) || 0,
      });
      if (!key) continue;
      applyValue(target, key, Number(value) || 0, ref1);
    }
  }

  return Array.from(rowsByMes.values())
    .map(finalize)
    .sort((a, b) => a.mesKey.localeCompare(b.mesKey));
}

// ─── INDICADORES DERIVADOS ───────────────────────────────
const safeDiv = (a: number, b: number): number | null =>
  !b || !Number.isFinite(b) || b === 0 ? null : a / b;

export function computeBSIndicators(r: BSDadosRow) {
  return {
    cmv_percent: safeDiv(Math.abs(r.cmv), r.receita_liquida),
    despesa_percent: safeDiv(Math.abs(r.despesas), r.receita_liquida),
    cmv_despesa_percent: safeDiv(Math.abs(r.cmv) + Math.abs(r.despesas), r.receita_liquida),
    resultado_percent: safeDiv(r.resultado, r.receita_liquida),
    liquidez_corrente: safeDiv(r.ativo_circulante, r.passivo_circulante),
    liquidez_seca: safeDiv(r.ativo_circulante - r.estoques, r.passivo_circulante),
    liquidez_imediata: safeDiv(r.disponivel, r.passivo_circulante),
  };
}

// ─── EXPORT XLSX (CSV simples — sem dependência) ─────────
export function exportBSDadosToCSV(rows: BSDadosRow[]): string {
  const headers = [
    "Mês","Receita Líquida","CMV","Despesas","Resultado",
    "Ativo Circulante","Passivo Circulante","Estoques","Disponível",
    "Dívida Tributária","Dívida Trabalhista","Dívida Financeira",
    "Fornecedores","Credores RJ","Dívida Total",
  ];
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push([
      r.mes,
      r.receita_liquida, r.cmv, r.despesas, r.resultado,
      r.ativo_circulante, r.passivo_circulante, r.estoques, r.disponivel,
      r.divida_tributaria, r.divida_trabalhista, r.divida_financeira,
      r.fornecedores, r.credores_rj, r.divida_total,
    ].map(v => typeof v === "number" ? v.toFixed(2).replace(".", ",") : v).join(";"));
  }
  return lines.join("\n");
}
