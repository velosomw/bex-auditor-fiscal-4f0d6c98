/**
 * Edge Function: audit-bs-dados
 *
 * Backend authoritative implementation of the BS & Dados consolidation engine.
 * Mirrors the client-side `bsDadosBuilder.ts` so that the same single source of
 * truth is available for: PDF reports, server exports, audit history snapshots
 * and any third party integration. Persists the consolidated snapshot into
 * `pipeline_analysis_results.indicadores` when `document_id` is provided.
 *
 * INPUT (POST JSON):
 * {
 *   document_id?: string,                  // optional — persists snapshot
 *   balancetes: Array<{
 *     mes: string,                         // "YYYY-MM" or "Março 2024"
 *     linhas: Array<{
 *       conta?: string,
 *       descricao?: string,
 *       ref1?: string | null,              // Ref Capital BEX (A, B, AA…)
 *       saldo: number
 *     }>
 *   }>
 * }
 *
 * OUTPUT:
 * {
 *   bsDados: BSDadosRow[],                 // consolidated rows
 *   indicadores: BSIndicators[],           // derived metrics per month
 *   summary: { meses: number, total_linhas: number, errors: number },
 *   persisted?: boolean
 * }
 */
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";

// ─── Tipos ───────────────────────────────────────────────
interface InputLinha {
  conta?: string;
  descricao?: string;
  ref1?: string | null;
  saldo: number;
}
interface InputBalancete {
  mes: string;
  linhas: InputLinha[];
  /** Usuário marcou este balancete como YTD (saldo acumulado desde Jan). */
  is_ytd?: boolean;
}
interface BSDadosRow {
  mes: string;
  mesKey: string;
  receita_liquida: number;
  cmv: number;
  despesas: number;                 // grupo 6 — operacionais
  despesas_financeiras: number;     // grupo 7 — separado (alinhado com client)
  receitas_financeiras: number;     // grupo 7+ / juros ativos / rendimentos — usado em EBITDA (subtrai)
  depreciacao: number;
  amortizacao: number;
  resultado: number;
  ativo_circulante: number;
  passivo_circulante: number;
  ativo_nao_circulante: number;
  passivo_nao_circulante: number;
  patrimonio_liquido: number;
  ativo_total: number;
  passivo_total: number;
  estoques: number;
  estoques_bruto?: number;          // pré-cap (apenas se cap foi aplicado)
  patrimonio_liquido_bruto?: number; // PL original (pré-rebalanço por equação contábil)
  disponivel: number;
  contas_receber: number;
  imobilizado: number;
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
  fornecedores: number;
  credores_rj: number;
  outras_obrigacoes: number;
  divida_total: number;
  divida_total_bruto?: number;      // pré-cap
  hasReceita: boolean;
  hasBalanco: boolean;
  errors: string[];
  ytd_desacumulado?: boolean;
  ytd_flags?: {
    is_ytd_input?: boolean;
    ytd_desacumulado?: boolean;
    ytd_outlier_flag?: boolean;     // mês marcado p/ excluir de gráficos mensais
    ytd_source_count?: number;
  };
}

interface BSIndicators {
  mes: string;
  cmvPercent: number | null;
  despesaPercent: number | null;
  cmvDespesaPercent: number | null;
  resultadoPercent: number | null;
  liquidezCorrente: number | null;
  liquidezSeca: number | null;
  liquidezImediata: number | null;
}
interface KanitzRow {
  mesKey: string;
  ativo_total: number;
  passivo_total: number;
  patrimonio_liquido: number;
  x1: number; x2: number; x3: number; x4: number; x5: number;
  score: number;
  rating: string;
  insight: string;
  // ISG (Índice de Solvência Geral) — usado quando PL < 0 (Kanitz inadequado)
  isg: number;
  isg_rating: string;
  modelo_preferencial: "kanitz" | "isg";
}

// ─── Constantes (espelham bsDadosBuilder.ts) ─────────────
const MES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const REF1_MAP: Record<string, keyof BSDadosRow> = {
  "A": "disponivel", "B": "disponivel", "C": "contas_receber", "D": "estoques",
  "E": "ativo_circulante", "F": "ativo_circulante", "G": "ativo_circulante", "H": "ativo_circulante",
  "I": "ativo_circulante", "J": "ativo_circulante", "K": "ativo_circulante", "L": "ativo_circulante",
  "M": "ativo_circulante", "N": "ativo_circulante", "O": "ativo_circulante",
  // ANC (P..J1) — roteiam direto para ativo_nao_circulante; C1/D1 também alimentam imobilizado
  "P": "ativo_nao_circulante", "Q": "ativo_nao_circulante", "R": "ativo_nao_circulante",
  "S": "ativo_nao_circulante", "T": "ativo_nao_circulante", "U": "ativo_nao_circulante",
  "V": "ativo_nao_circulante", "W": "ativo_nao_circulante", "X": "ativo_nao_circulante",
  "Y": "ativo_nao_circulante", "Z": "ativo_nao_circulante", "A1": "ativo_nao_circulante",
  "B1": "ativo_nao_circulante", "C1": "imobilizado", "D1": "imobilizado",
  "E1": "ativo_nao_circulante", "F1": "ativo_nao_circulante", "G1": "ativo_nao_circulante",
  "H1": "ativo_nao_circulante", "I1": "ativo_nao_circulante", "J1": "ativo_nao_circulante",
  // PC
  "AA": "divida_financeira", "BB": "fornecedores", "CC": "divida_trabalhista",
  "DD": "divida_tributaria", "II": "credores_rj", "LL": "credores_rj",
  "EE": "passivo_circulante", "FF": "passivo_circulante", "GG": "passivo_circulante", "HH": "passivo_circulante",
  "JJ": "outras_obrigacoes", "KK": "passivo_circulante", "MM": "passivo_circulante", "NN": "divida_tributaria",
  "OO": "passivo_circulante", "II1": "divida_tributaria",
  // PNC (PP..FF1) — completar gap vs cliente
  "PP": "fornecedores", "QQ": "divida_financeira", "RR": "divida_tributaria",
  "SS": "divida_tributaria", "TT": "divida_financeira",
  "UU": "passivo_nao_circulante", "VV": "passivo_nao_circulante", "WW": "passivo_nao_circulante",
  "XX": "passivo_nao_circulante", "YY": "passivo_nao_circulante", "ZZ": "passivo_nao_circulante",
  "AA1": "passivo_nao_circulante", "BB1": "passivo_nao_circulante",
  "CC1": "credores_rj",
  "DD1": "passivo_nao_circulante", "EE1": "passivo_nao_circulante", "FF1": "passivo_nao_circulante",
  // PL
  "GG1": "patrimonio_liquido", "HH1": "patrimonio_liquido",
  // Totalizadores
  "AC_TOTAL": "ativo_circulante", "PC_TOTAL": "passivo_circulante",
  "ANC_TOTAL": "ativo_nao_circulante", "PNC_TOTAL": "passivo_nao_circulante", "PL_TOTAL": "patrimonio_liquido",
  "RECEITA": "receita_liquida", "RECEITA LIQUIDA": "receita_liquida", "RECEITA LÍQUIDA": "receita_liquida",
  "DEDUCOES_RECEITA": "receita_liquida",
  "CMV": "cmv", "DESPESAS": "despesas", "DESPESA": "despesas", "RESULTADO": "resultado",
  "DESPESAS_FIN": "despesas_financeiras",   // antes fundia em "despesas" — agora separado
  "RECEITAS_FIN": "receitas_financeiras",   // juros ativos / rendimentos de aplicação
  "DESPESAS_NOP": "despesas",                // não operacionais ainda em despesas (sinal próprio)
  "DESPESAS FINANCEIRAS": "despesas_financeiras",
  "RECEITAS FINANCEIRAS": "receitas_financeiras",
  "DEPRECIACAO": "depreciacao", "DEPRECIAÇÃO": "depreciacao",
  "AMORTIZACAO": "amortizacao", "AMORTIZAÇÃO": "amortizacao",
  "ATIVO CIRCULANTE": "ativo_circulante", "PASSIVO CIRCULANTE": "passivo_circulante",
  "ATIVO NAO CIRCULANTE": "ativo_nao_circulante", "ATIVO NÃO CIRCULANTE": "ativo_nao_circulante",
  "PASSIVO NAO CIRCULANTE": "passivo_nao_circulante", "PASSIVO NÃO CIRCULANTE": "passivo_nao_circulante",
  "PATRIMONIO LIQUIDO": "patrimonio_liquido", "PATRIMÔNIO LÍQUIDO": "patrimonio_liquido",
  "ESTOQUES": "estoques", "ESTOQUE": "estoques", "DISPONIVEL": "disponivel", "DISPONÍVEL": "disponivel",
  "PASSIVO TRIBUTARIO": "divida_tributaria", "PASSIVO TRIBUTÁRIO": "divida_tributaria",
  "PASSIVO TRABALHISTA": "divida_trabalhista",
  "EMPRESTIMOS": "divida_financeira", "EMPRÉSTIMOS": "divida_financeira", "FINANCIAMENTOS": "divida_financeira",
  "FORNECEDORES": "fornecedores", "CREDORES RJ": "credores_rj", "RECUPERACAO JUDICIAL": "credores_rj",
};

const AC_REFS = new Set(["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"]);
const PC_REFS = new Set(["AA","BB","CC","DD","EE","FF","GG","HH","II","JJ","KK","LL","MM","NN","OO","II1"]);

/**
 * REF_BY_PREFIX — Classificador GENÉRICO por grupo contábil brasileiro.
 * 1º dígito = natureza (1 Ativo, 2 Passivo, 3-8 DRE).
 * 2º dígito = grupo (11 AC, 12 ANC, 13 Permanente, 21 PC, 22 PNC, 23 PL).
 * Para 21X/22X a sub-classificação combina código + DESCRIÇÃO
 * (planos diferentes — ex: Giannini — usam 211/212/215 com significados distintos).
 */
const REF_BY_PREFIX: Array<[RegExp, string]> = [
  // ── ATIVO CIRCULANTE ───
  [/^1111/,  "C"],   // Clientes (mais específico que 111 — testar antes)
  [/^111/,   "A"],   // Bens e Numerários / Caixa / Disponível
  [/^112/,   "C"],   // Clientes / Contas a Receber (padrão Giannini)
  [/^113/,   "D"],   // Estoques
  [/^114/,   "E"],
  [/^115/,   "F"],
  [/^116/,   "G"], [/^117/, "G"], [/^118/, "G"], [/^119/, "G"],
  [/^11/,    "AC_TOTAL"],
  // ── ATIVO NÃO CIRCULANTE ───
  [/^121/,   "P"], [/^122/, "Q"], [/^123/, "R"], [/^124/, "S"],
  [/^12/,    "ANC_TOTAL"],
  [/^131/,   "R"], [/^132/, "S"],
  [/^13/,    "ANC_TOTAL"],
  // ── PASSIVO CIRCULANTE — sub-classificação via descrição ───
  [/^21[1-9]/, "PC_COMPONENT"],
  [/^21/,    "PC_TOTAL"],
  // ── PASSIVO NÃO CIRCULANTE ───
  [/^22[1-9]/, "PNC_COMPONENT"],
  [/^22/,    "PNC_TOTAL"],
  // ── PATRIMÔNIO LÍQUIDO ───
  [/^231/,   "GG1"], [/^232/, "HH1"], [/^233/, "HH1"], [/^234/, "HH1"],
  [/^23/,    "PL_TOTAL"],
  [/^24/,    "GG1"],
  // ── DRE ───
  [/^31/,    "RECEITA_OR_DEDUCAO"],  // 31x pode ser bruta OU dedução — classifica por descrição
  [/^32/,    "DEDUCOES_RECEITA"],
  [/^33/,    "DEDUCOES_RECEITA"],
  [/^4/,     "CMV"],
  [/^5/,     "CMV"],          // Custo Industrial → CMV
  [/^6/,     "DESPESAS"],     // Despesas Operacionais
  [/^7/,     "FIN_GROUP"],    // Financeiro — receita OU despesa via descrição
  [/^8/,     "DESPESAS_NOP"], // Despesas/Receitas NÃO Operacionais
];

/** Classifica grupo 7 (financeiro) em receita vs despesa pela descrição. */
function classifyFinByDescription(desc: string): "DESPESAS_FIN" | "RECEITAS_FIN" {
  const d = stripAccents(desc);
  if (/juros?\s+(?:ativ|recebid|aufer)|rendiment|receita.*financ|aplica[cç][aã]o\s+financ|desconto\s+obtid|varia[cç][aã]o\s+monet[aá]ria\s+ativ/.test(d)) {
    return "RECEITAS_FIN";
  }
  return "DESPESAS_FIN";
}

/** Detecta se uma conta com prefixo 31x é dedução de receita (impostos, devoluções, abatimentos). */
function isDeducaoByDescription(desc: string): boolean {
  const d = stripAccents(desc);
  return /dedu[cç][aã]o|devolu[cç][aã]o|cancelament|abatiment|imposto.*(?:vend|receit|fatur)|icms.*vend|iss.*servi|pis.*receit|cofins.*receit|simples.*nacional|substitui[cç][aã]o\s+tribut/.test(d);
}

const stripAccents = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function classifyPCByDescription(desc: string): string {
  const d = stripAccents(desc);
  if (/credores?\s+rj|recuperacao\s+judic/.test(d)) return "II";
  if (/fornecedor/.test(d)) return "BB";
  if (/emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?|leasing|arrendament/.test(d)) return "AA";
  if (/sal[aá]ri|f[eé]rias|13[ºo°]|d[eé]cimo\s+terceiro|inss|fgts|trabalhi|encargos\s+soci|provis[aã]o.*f[eé]ria/.test(d)) return "CC";
  if (/tribut|imposto|icms|iss|pis|cofins|irpj|csll|simples|parcelament|refis/.test(d)) return "DD";
  return "JJ"; // Outras Obrigações
}

function classifyPNCByDescription(desc: string): string {
  const d = stripAccents(desc);
  if (/credores?\s+rj|recuperacao\s+judic/.test(d)) return "CC1";
  if (/fornecedor/.test(d)) return "PP";
  if (/emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?|leasing|arrendament/.test(d)) return "QQ";
  if (/tribut|imposto|parcelament|refis/.test(d)) return "RR";
  return "DD1";
}

function inferRefByCode(code?: string, descricao?: string): string | null {
  const c = String(code || "").replace(/\s+/g, "");
  for (const [pattern, ref] of REF_BY_PREFIX) {
    if (pattern.test(c)) {
      if (ref === "PC_COMPONENT") return classifyPCByDescription(descricao || "");
      if (ref === "PNC_COMPONENT") return classifyPNCByDescription(descricao || "");
      if (ref === "FIN_GROUP") return classifyFinByDescription(descricao || "");
      if (ref === "RECEITA_OR_DEDUCAO") return isDeducaoByDescription(descricao || "") ? "DEDUCOES_RECEITA" : "RECEITA";
      return ref;
    }
  }
  return null;
}

const FALLBACK_PATTERNS: Partial<Record<keyof BSDadosRow, RegExp>> = {
  receita_liquida: /\breceita.*l[ií]quid|venda.*l[ií]quid\b/i,
  cmv: /\bc(?:mv|sv|pv)\b|\bcusto\s+(?:das?\s+)?(?:mercadoria|servi[cç]o|produto|venda)/i,
  despesas: /\bdespesa|gasto\s+oper/i,
  despesas_financeiras: /\b(?:despesas?\s+financeir|juros\s+(?:passivo|pagos?|sobre)|encargos\s+financeir|varia[cç][oõ]es\s+monet[aá]rias?\s+passiv)/i,
  receitas_financeiras: /\b(?:receitas?\s+financeir|juros\s+(?:ativo|recebidos?|aufer)|rendimentos?\s+de\s+aplica|desconto\s+obtid)/i,
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
};

// ─── Helpers ─────────────────────────────────────────────
const upper = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
const norm  = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const pad2  = (n: number | string) => String(n).padStart(2, "0");

const MES_ABREV: Record<string, number> = { jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12 };
const MES_LONG:  Record<string, number> = { janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12 };

function expandYear(y: string | number): number | null {
  const n = Number(y); if (!Number.isFinite(n)) return null;
  if (n >= 1900 && n <= 2100) return n;
  if (n >= 0 && n <= 79) return 2000 + n;
  if (n >= 80 && n <= 99) return 1900 + n;
  return null;
}
function buildKey(y: number, mm: number): string | null {
  if (mm < 1 || mm > 12 || y < 1900 || y > 2100) return null;
  return `${y}-${pad2(mm)}`;
}

/** Normaliza qualquer rótulo de período → "YYYY-MM" (ou devolve a entrada se falhar). */
function periodToMesKey(p: string): string {
  if (!p) return p;
  const raw = String(p).trim();
  const direct = raw.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const s = norm(raw);
  let m = s.match(/^(\d{4})[\s/\-.](\d{1,2})$/);
  if (m) { const y = expandYear(m[1])!, mm = Number(m[2]); const k = buildKey(y, mm); if (k) return k; }
  m = s.match(/^(\d{1,2})[\s/\-.](\d{2,4})$/);
  if (m) { const mm = Number(m[1]), y = expandYear(m[2]); if (y) { const k = buildKey(y, mm); if (k) return k; } }
  m = s.match(/^([a-z]+)[\s/\-.]+(\d{2,4})$/);
  if (m) { const mm = MES_LONG[m[1]] ?? MES_ABREV[m[1].slice(0,3)]; const y = expandYear(m[2]); if (mm && y) { const k = buildKey(y, mm); if (k) return k; } }
  m = s.match(/^(\d{2,4})[\s/\-.]+([a-z]+)$/);
  if (m) { const y = expandYear(m[1]); const mm = MES_LONG[m[2]] ?? MES_ABREV[m[2].slice(0,3)]; if (mm && y) { const k = buildKey(y, mm); if (k) return k; } }
  m = s.match(/^(\d{4})$/); if (m) { const y = expandYear(m[1]); if (y) return `${y}-12`; }
  return raw;
}

function mesKeyToLabel(k: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(k);
  if (!m) return k;
  const idx = parseInt(m[2],10)-1;
  return idx>=0 && idx<12 ? `${MES_FULL[idx]} ${m[1]}` : k;
}

function emptyRow(mesKey: string): BSDadosRow {
  return {
    mes: mesKeyToLabel(mesKey), mesKey,
    receita_liquida: 0, cmv: 0, despesas: 0, despesas_financeiras: 0, receitas_financeiras: 0,
    depreciacao: 0, amortizacao: 0, resultado: 0,
    ativo_circulante: 0, passivo_circulante: 0,
    ativo_nao_circulante: 0, passivo_nao_circulante: 0,
    patrimonio_liquido: 0, ativo_total: 0, passivo_total: 0,
    estoques: 0, disponivel: 0, contas_receber: 0, imobilizado: 0,
    divida_tributaria: 0, divida_trabalhista: 0, divida_financeira: 0,
    fornecedores: 0, credores_rj: 0, outras_obrigacoes: 0, divida_total: 0,
    hasReceita: false, hasBalanco: false, errors: [],
  };
}

function resolveKey(linha: InputLinha): keyof BSDadosRow | null {
  const ref1 = linha.ref1 ?? inferRefByCode(linha.conta, linha.descricao);
  if (ref1) {
    const k = REF1_MAP[upper(ref1)];
    if (k) return k;
  }
  const text = `${linha.descricao || ""} ${linha.conta || ""}`;
  for (const [k, re] of Object.entries(FALLBACK_PATTERNS)) {
    if (re && re.test(text)) return k as keyof BSDadosRow;
  }
  return null;
}

// FIX #3 — Buckets estendidos: trackeia ANC, PNC, PL via ref1 para Kanitz
interface Buckets {
  ac: number; pc: number;
  anc: number; pnc: number; pl: number;
  sawACTotal: boolean; sawPCTotal: boolean;
  sawANCTotal: boolean; sawPNCTotal: boolean; sawPLTotal: boolean;
  // Valores declarados pelo GT (totalizador), para preferi-los às folhas em finalize
  gtAC: number; gtPC: number; gtANC: number; gtPNC: number; gtPL: number;
}

// ANC = P..J1 (15 refs do MD §2.2)
const ANC_REFS = new Set(["P","Q","R","S","T","U","V","W","X","Y","Z","A1","B1","C1","D1","E1","F1","G1","H1","I1","J1"]);
// PNC = PP..FF1 (§2.4)
const PNC_REFS = new Set(["PP","QQ","RR","SS","TT","UU","VV","WW","XX","YY","ZZ","A1A","B1A","C1A","D1A","E1A","F1A","AA1","BB1","CC1A","DD1","EE1","FF1"]);
// PL = GG1, HH1 + "Resultado" (§2.5)
const PL_REFS = new Set(["GG1","HH1","RESULTADO_EXERCICIO"]);

function applyValue(row: BSDadosRow, key: keyof BSDadosRow, v: number, ref1: string | null | undefined, b: Buckets) {
  if (!Number.isFinite(v)) return;
  const refUp = ref1 ? upper(ref1) : "";
  const isTotal = refUp.endsWith("_TOTAL"); // AC_TOTAL, PC_TOTAL, ANC_TOTAL, PNC_TOTAL, PL_TOTAL
  switch (key) {
    case "receita_liquida": row.receita_liquida += refUp === "DEDUCOES_RECEITA" ? -Math.abs(v) : Math.abs(v); break;
    case "cmv":             row.cmv -= Math.abs(v); break;
    case "despesas":        row.despesas -= Math.abs(v); break;
    case "despesas_financeiras": row.despesas_financeiras -= Math.abs(v); break;
    case "receitas_financeiras": row.receitas_financeiras += Math.abs(v); break;
    case "depreciacao":     row.depreciacao -= Math.abs(v); break;
    case "amortizacao":     row.amortizacao -= Math.abs(v); break;
    case "resultado":       row.resultado += v; break;
    case "ativo_circulante":
      if (isTotal) { b.sawACTotal = true; b.gtAC = Math.max(b.gtAC, Math.abs(v)); }
      else { row.ativo_circulante += Math.abs(v); }
      break;
    case "passivo_circulante":
      if (isTotal) { b.sawPCTotal = true; b.gtPC = Math.max(b.gtPC, Math.abs(v)); }
      else { row.passivo_circulante += Math.abs(v); }
      break;
    case "ativo_nao_circulante":
      if (isTotal) { b.sawANCTotal = true; b.gtANC = Math.max(b.gtANC, Math.abs(v)); }
      else { row.ativo_nao_circulante += Math.abs(v); }
      break;
    case "passivo_nao_circulante":
      if (isTotal) { b.sawPNCTotal = true; b.gtPNC = Math.max(b.gtPNC, Math.abs(v)); }
      else { row.passivo_nao_circulante += Math.abs(v); }
      break;
    case "patrimonio_liquido":
      if (isTotal) { b.sawPLTotal = true; b.gtPL = Math.abs(v) > Math.abs(b.gtPL) ? v : b.gtPL; }
      else { row.patrimonio_liquido += v; }
      break;
    case "contas_receber":
    case "imobilizado":
    case "outras_obrigacoes":
    case "estoques":
    case "disponivel":
    case "divida_tributaria":
    case "divida_trabalhista":
    case "divida_financeira":
    case "fornecedores":
    case "credores_rj":
      (row as any)[key] += Math.abs(v); break;
  }
  // ⚠️ FIX dupla contagem: o bucket por prefixo só serve como FALLBACK
  // para linhas que NÃO caíram em nenhum case do switch acima (key === null
  // não chega aqui pois retorna em resolveKey). Para linhas que JÁ foram
  // aplicadas via switch, NÃO acumulamos novamente nos buckets ac/pc/anc/pnc/pl.
  // Mantemos buckets apenas para telemetria de cobertura.
}

function finalize(r: BSDadosRow, b?: Buckets): BSDadosRow {
  // FIX: se GT presente, ele é a fonte da verdade — evita dupla contagem de folhas+total.
  if (b) {
    if (b.sawACTotal  && b.gtAC  > 0) r.ativo_circulante       = b.gtAC;
    if (b.sawPCTotal  && b.gtPC  > 0) r.passivo_circulante     = b.gtPC;
    if (b.sawANCTotal && b.gtANC > 0) r.ativo_nao_circulante   = b.gtANC;
    if (b.sawPNCTotal && b.gtPNC > 0) r.passivo_nao_circulante = b.gtPNC;
    if (b.sawPLTotal  && b.gtPL !== 0) r.patrimonio_liquido    = b.gtPL;
  }
  // Resíduo do PC vai para outras_obrigacoes (componentes não classificados)
  const componentesPC = r.divida_tributaria + r.divida_trabalhista + r.divida_financeira +
                        r.fornecedores + r.credores_rj + r.outras_obrigacoes;
  if (r.passivo_circulante > componentesPC) {
    r.outras_obrigacoes += r.passivo_circulante - componentesPC;
  }
  // Recalcula divida_total
  r.divida_total = r.divida_tributaria + r.divida_trabalhista + r.divida_financeira +
                   r.fornecedores + r.credores_rj + r.outras_obrigacoes;
  // Resultado alinhado: inclui despesas e receitas financeiras (CPC 47).
  r.resultado = r.receita_liquida + r.cmv + r.despesas + r.despesas_financeiras + r.receitas_financeiras;
  r.ativo_total = r.ativo_circulante + r.ativo_nao_circulante;
  r.passivo_total = r.passivo_circulante + r.passivo_nao_circulante;
  r.hasReceita = r.receita_liquida > 0;
  r.hasBalanco = r.ativo_circulante > 0 || r.passivo_circulante > 0 || r.divida_total > 0;
  if (!r.hasReceita) r.errors.push("Receita líquida ausente ou zerada");
  if (r.cmv > 0)     r.errors.push("CMV positivo (deveria ser negativo)");

  // Cap ESTOQUES — preserva valor bruto p/ UI mostrar antes/depois.
  if (r.estoques > 0 && r.ativo_circulante > 0 && r.estoques / r.ativo_circulante > 0.85) {
    const before = r.estoques;
    const pct = (before / r.ativo_circulante) * 100;
    r.estoques_bruto = before;
    r.estoques = r.ativo_circulante * 0.65;
    r.errors.push(`Estoques inflados (${pct.toFixed(1)}% do AC) — cap aplicado: ${before.toFixed(0)} → ${r.estoques.toFixed(0)}`);
    console.log(`[finalize] CAP_ESTOQUES mes=${r.mesKey} before=${before.toFixed(0)} pct=${pct.toFixed(1)}% after=${r.estoques.toFixed(0)}`);
  }

  // Cap DÍVIDA TOTAL — preserva valor bruto.
  const passivoEstimado = r.passivo_total > 0 ? r.passivo_total : r.passivo_circulante;
  if (passivoEstimado > 0 && r.divida_total > passivoEstimado * 1.1) {
    const before = r.divida_total;
    r.divida_total_bruto = before;
    r.divida_total = passivoEstimado;
    r.errors.push(`Dívida total excedia Passivo Total — cap aplicado: ${before.toFixed(0)} → ${passivoEstimado.toFixed(0)}`);
    console.log(`[finalize] CAP_DIVIDA mes=${r.mesKey} before=${before.toFixed(0)} after=${passivoEstimado.toFixed(0)}`);
  }

  // FIX #6 — Equação contábil Ativo = Passivo + PL (±1%). CPC 26 R1 §54 / NBC TG 26.
  if (r.ativo_total > 0 && (r.passivo_total > 0 || r.patrimonio_liquido !== 0)) {
    const ladoDireito = r.passivo_total + r.patrimonio_liquido;
    const diff = Math.abs(r.ativo_total - ladoDireito);
    const tol = r.ativo_total * 0.01;
    if (diff > tol) {
      const desvio = (diff / r.ativo_total) * 100;
      r.errors.push(`Equação contábil rompida: Ativo=${r.ativo_total.toFixed(0)} ≠ Passivo+PL=${ladoDireito.toFixed(0)} (desvio ${desvio.toFixed(2)}%)`);
      console.log(`[finalize] EQ_BREAK mes=${r.mesKey} A=${r.ativo_total.toFixed(0)} P+PL=${ladoDireito.toFixed(0)} desvio=${desvio.toFixed(2)}%`);
    }
  }
  return r;
}

/**
 * FIX #1 (DEFINITIVO) — Prune hierárquico robusto.
 * Combina:
 *  (a) detecção de pais por código com separador "." OU contínuo numérico
 *  (b) filtro de descrições sintéticas/totalizadoras conhecidas
 */
const SYNTHETIC_DESC_PATTERNS: RegExp[] = [
  /^ativo$/i, /^ativo\s+(circulante|n[aã]o\s+circulante|total|realiz[aá]vel)/i,
  /^passivo$/i, /^passivo\s+(circulante|n[aã]o\s+circulante|total|exig[ií]vel)/i,
  /^patrim[oô]nio\s+l[ií]quido$/i,
  /^total\s+do?\s+(ativo|passivo|patrim[oô]nio|circulante|n[aã]o\s+circulante)/i,
  /^total\s+geral/i, /^subtotal/i, /^totaliza/i,
  /^demonstra[çc][aã]o\s+de?\s+resultado/i, /^demonstrativo\s+de?\s+resultado/i, /^dre$/i,
  /^receita\s+(bruta|l[ií]quida|total|operacional)$/i,
  /^despesa\s+(total|operacional)$/i,
  /^resultado\s+(bruto|operacional|antes|do\s+exerc[ií]cio|l[ií]quido)/i,
  /^lucro\s+(bruto|operacional|antes|do\s+exerc[ií]cio|l[ií]quido)/i,
  // FIX #5 — capturas adicionais frequentes em balancetes brasileiros
  /\(=\)/, /\(\+\)/, /\(\-\)/, // marcadores de subtotal
  /^\s*total\b/i, // qualquer "total ..." que não tenha sido pego acima
  /^soma\s+(do|dos|das)/i,
];
function isSyntheticDesc(desc?: string): boolean {
  const d = String(desc || "").trim();
  if (!d) return false;
  return SYNTHETIC_DESC_PATTERNS.some(p => p.test(d));
}

/**
 * FIX #5 — Poda hierárquica de balancete por código contábil + filtros sintéticos.
 * Considera pai qualquer conta cujo código é prefixo de outra conta presente.
 * Suporta separadores "." OU códigos contínuos numéricos.
 * Remove também: códigos com profundidade < máx do grupo, descrições sintéticas,
 * e linhas cujo saldo é exatamente igual à soma de linhas-filho (auto-detecção).
 */
function pruneParents(linhas: InputLinha[]): InputLinha[] {
  const normCode = (c?: string) => String(c || "").replace(/\s+/g, "").replace(/\.+$/g, "");
  const codeSet = new Set<string>();
  for (const l of linhas) {
    const c = normCode(l.conta);
    if (c) codeSet.add(c);
  }
  // PERF — substitui O(n²) por sort + passada linear (O(n log n)).
  // Marca `c` como pai sse existe `other` no conjunto que começa com `c`
  // seguido de um separador hierárquico (dígito ou ponto).
  const sorted = Array.from(codeSet).sort();
  const parents = new Set<string>();
  for (let i = 0; i < sorted.length - 1; i++) {
    const c = sorted[i];
    // Após o sort, qualquer descendente de `c` aparece imediatamente após.
    // Varremos enquanto o prefixo bater.
    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      if (!other.startsWith(c)) break;
      if (other.length === c.length) continue;
      const next = other.charAt(c.length);
      if (/[0-9.]/.test(next) || c.endsWith(".")) { parents.add(c); break; }
    }
  }
  const before = linhas.length;
  const filtered = linhas.filter(l => {
    const c = normCode(l.conta);
    if (isSyntheticDesc(l.descricao)) return false;
    if (!c) return true;
    return !parents.has(c);
  });
  const removed = before - filtered.length;
  if (removed > 0) {
    console.log(`[pruneParents] removidas ${removed}/${before} linhas (pais sintéticos)`);
  }
  return filtered;
}

/**
 * FIX #2 — Desacumular DRE quando os valores aparecem como saldo YTD.
 * Heurística:
 *  - Para cada chave de DRE (receita_liquida, cmv, despesas), olhar a série mensal
 *    DENTRO do mesmo ano-civil ordenada por mesKey.
 *  - Se |valor(mês_n)| > |valor(mês_(n-1))| em 2+ pares consecutivos do mesmo ano,
 *    considerar acumulado. Aplica differencing: novo_n = bruto_n - bruto_(n-1).
 *  - Mês de janeiro nunca é desacumulado (é o ponto de partida do exercício).
 *  - Reset entre anos preservado.
 */
function desacumularDRE(
  rows: BSDadosRow[],
  userYtdByMesKey: Map<string, boolean>,
): BSDadosRow[] {
  if (rows.length < 2) return rows;
  const sorted = [...rows].sort((a, b) => a.mesKey.localeCompare(b.mesKey));
  const dreKeys: Array<"receita_liquida" | "cmv" | "despesas" | "despesas_financeiras" | "receitas_financeiras"> = ["receita_liquida", "cmv", "despesas", "despesas_financeiras", "receitas_financeiras"];
  const byYear = new Map<string, BSDadosRow[]>();
  for (const r of sorted) {
    const y = r.mesKey.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }
  for (const [, group] of byYear) {
    if (group.length < 2) continue;

    // Opção B (RECONSTRUÇÃO EXATA): se >=2 meses consecutivos do mesmo ano
    // estão marcados como YTD pelo usuário, força subtração YTD-YTD —
    // valor exato, sem heurística de mediana ou monotonia.
    const ytdMarked = group.filter(r => userYtdByMesKey.get(r.mesKey)).length;
    const userForceExact = ytdMarked >= 2;

    for (const k of dreKeys) {
      let monotonicPairs = 0;
      let totalPairs = 0;
      for (let i = 1; i < group.length; i++) {
        const prev = Math.abs(group[i - 1][k] as number);
        const curr = Math.abs(group[i][k] as number);
        if (prev > 0) {
          totalPairs++;
          if (curr >= prev * 1.02) monotonicPairs++;
        }
      }
      const heuristicMatch = totalPairs >= 2 && monotonicPairs / totalPairs >= 0.8;
      if (userForceExact || heuristicMatch) {
        const original = group.map(g => g[k] as number);
        for (let i = group.length - 1; i >= 1; i--) {
          (group[i] as any)[k] = original[i] - original[i - 1];
        }
        const tag = userForceExact
          ? `DRE.${k} desacumulada (YTD marcado pelo usuário — subtração exata)`
          : `DRE.${k} desacumulada (YTD detectado)`;
        for (const r of group) {
          if (!r.errors.includes(tag)) r.errors.push(tag);
          r.ytd_desacumulado = true;
          r.ytd_flags = {
            ...(r.ytd_flags || {}),
            is_ytd_input: !!userYtdByMesKey.get(r.mesKey) || r.ytd_flags?.is_ytd_input,
            ytd_desacumulado: true,
            ytd_source_count: ytdMarked || group.length,
          };
        }
        console.log(`[desacumularDRE] aplicado: chave=${k} ano=${group[0].mesKey.slice(0,4)} fonte=${userForceExact ? "user" : "heurística"} pares=${monotonicPairs}/${totalPairs}`);
      }
    }
    for (const r of group) {
      r.resultado = r.receita_liquida + r.cmv + r.despesas + r.despesas_financeiras + r.receitas_financeiras;
    }
  }
  return sorted;
}

/**
 * Detecção de outlier YTD isolado (Opção A+C — apenas badge, sem normalização).
 * Para cada mês cuja Receita Líquida >= 3× mediana dos demais meses do ano,
 * marca ytd_outlier_flag=true. Não altera valores — apenas sinaliza.
 * Pulado para meses já marcados como ytd_desacumulado (já tratados pela Opção B).
 */
function detectYtdOutliers(rows: BSDadosRow[]): BSDadosRow[] {
  if (rows.length < 3) return rows;
  const byYear = new Map<string, BSDadosRow[]>();
  for (const r of rows) {
    const y = r.mesKey.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }
  for (const [, group] of byYear) {
    if (group.length < 3) continue;
    for (const r of group) {
      if (r.ytd_desacumulado) continue;
      const others = group.filter(x => x !== r && x.receita_liquida > 0).map(x => x.receita_liquida).sort((a, b) => a - b);
      if (others.length < 2) continue;
      const median = others[Math.floor(others.length / 2)];
      if (median > 0 && r.receita_liquida >= median * 3) {
        r.ytd_flags = { ...(r.ytd_flags || {}), ytd_outlier_flag: true };
        const msg = `Possível YTD isolado: Receita ${r.receita_liquida.toFixed(0)} ≥ 3× mediana (${median.toFixed(0)}) — valor mantido como está`;
        if (!r.errors.includes(msg)) r.errors.push(msg);
        console.log(`[detectYtdOutliers] mes=${r.mesKey} receita=${r.receita_liquida.toFixed(0)} mediana=${median.toFixed(0)}`);
      }
    }
  }
  return rows;
}

function buildBSDados(balancetes: InputBalancete[]): BSDadosRow[] {
  const rowsByMes = new Map<string, BSDadosRow>();
  const bucketsByMes = new Map<string, Buckets>();
  const userYtdByMesKey = new Map<string, boolean>();

  const dup: Record<string, number> = {};
  for (const b of balancetes) {
    const k = periodToMesKey(b.mes);
    dup[k] = (dup[k] || 0) + 1;
    if (b.is_ytd) userYtdByMesKey.set(k, true);
  }

  for (const b of balancetes) {
    const mesKey = periodToMesKey(b.mes);
    if (!rowsByMes.has(mesKey)) {
      rowsByMes.set(mesKey, emptyRow(mesKey));
      bucketsByMes.set(mesKey, { ac: 0, pc: 0, anc: 0, pnc: 0, pl: 0, sawACTotal: false, sawPCTotal: false, sawANCTotal: false, sawPNCTotal: false, sawPLTotal: false, gtAC: 0, gtPC: 0, gtANC: 0, gtPNC: 0, gtPL: 0 });
    }
    if (dup[mesKey] > 1) {
      const r = rowsByMes.get(mesKey)!;
      const msg = `Mês duplicado entre balancetes (×${dup[mesKey]}) — valores somados`;
      if (!r.errors.includes(msg)) r.errors.push(msg);
    }
    const row = rowsByMes.get(mesKey)!;
    if (b.is_ytd) {
      row.ytd_flags = { ...(row.ytd_flags || {}), is_ytd_input: true };
    }
    const buckets = bucketsByMes.get(mesKey)!;
    const linhasLeaf = pruneParents(b.linhas || []);
    for (const linha of linhasLeaf) {
      const key = resolveKey(linha);
      if (!key) continue;
      applyValue(row, key, Number(linha.saldo) || 0, linha.ref1 ?? inferRefByCode(linha.conta, linha.descricao), buckets);
    }
  }

  // ⚠️ FIX dupla contagem (Causa #2 do diagnóstico):
  // applyValue já acumulou os valores nas chaves corretas via REF1_MAP.
  // Os buckets b.ac/pc/anc/pnc/pl agora são vazios (telemetria), então NÃO
  // sobrescrevemos as rows. finalize() ainda dá preferência a GT (totalizador)
  // quando existir, evitando soma de folhas+total.
  // Mantemos compatibilidade: se row está zerada E bucket tem valor (planos
  // contábeis exóticos onde REF1_MAP não pegou), aplica como fallback.
  for (const [, row] of rowsByMes) {
    const b = bucketsByMes.get(row.mesKey)!;
    if (row.ativo_circulante === 0 && !b.sawACTotal && b.ac > 0) row.ativo_circulante = b.ac;
    if (row.passivo_circulante === 0 && !b.sawPCTotal && b.pc > 0) row.passivo_circulante = b.pc;
    if (row.ativo_nao_circulante === 0 && !b.sawANCTotal && b.anc > 0) row.ativo_nao_circulante = b.anc;
    if (row.passivo_nao_circulante === 0 && !b.sawPNCTotal && b.pnc > 0) row.passivo_nao_circulante = b.pnc;
    if (row.patrimonio_liquido === 0 && !b.sawPLTotal && b.pl !== 0) row.patrimonio_liquido = b.pl;
  }

  const finalized = Array.from(rowsByMes.values()).map(r => finalize(r, bucketsByMes.get(r.mesKey)))
    .sort((a, b) => a.mesKey.localeCompare(b.mesKey));
  const desacumulated = desacumularDRE(finalized, userYtdByMesKey);
  return detectYtdOutliers(desacumulated);
}


const safePct = (a: number, b: number): number | null =>
  !b || !Number.isFinite(b) ? null : Number(((a / b) * 100).toFixed(2));
const safeDiv = (a: number, b: number): number | null =>
  !b || !Number.isFinite(b) ? null : Number((a / b).toFixed(4));

function enrich(rows: BSDadosRow[]): BSIndicators[] {
  return rows.map(r => ({
    mes: r.mes,
    cmvPercent: safePct(Math.abs(r.cmv), r.receita_liquida),
    despesaPercent: safePct(Math.abs(r.despesas), r.receita_liquida),
    cmvDespesaPercent: safePct(Math.abs(r.cmv) + Math.abs(r.despesas), r.receita_liquida),
    resultadoPercent: safePct(r.resultado, r.receita_liquida),
    liquidezCorrente: safeDiv(r.ativo_circulante, r.passivo_circulante),
    liquidezSeca: safeDiv(r.ativo_circulante - r.estoques, r.passivo_circulante),
    liquidezImediata: safeDiv(r.disponivel, r.passivo_circulante),
  }));
}

// ─── FIX #3 + KANITZ-AUDIT: Kanitz + ISG por mês ─────────
// Validado contra "Planilha Utilizar no Projeto Kanitz Giannini" + "Modelo Termômetro de Kanitz".
// LG agora usa RLP real (aproximado por ANC quando não há breakout de Imobilizado/Intangível).
// ISG é calculado em todos os meses e promovido a indicador preferencial quando PL < 0.
function computeKanitz(rows: BSDadosRow[]): KanitzRow[] {
  return rows.map(r => {
    const AC = r.ativo_circulante;
    const ANC = r.ativo_nao_circulante;
    const PC = r.passivo_circulante;
    const PNC = r.passivo_nao_circulante;
    const PL = r.patrimonio_liquido;
    const LL = r.resultado;
    const RLP = ANC;
    const safe = (n: number, d: number) => (Math.abs(d) < 0.01 ? 0 : n / d);

    // FIX #3 — Bloqueio metodológico: Kanitz é INVÁLIDO quando |PL| < 5% do Ativo Total
    // (denominadores RPL e GE divergem). NBC TA 200 §A20 — ceticismo profissional.
    const plMin = Math.max(r.ativo_total * 0.05, 1);
    const kanitzBloqueado = Math.abs(PL) < plMin || r.ativo_total <= 0;

    const x1 = safe(LL, PL);
    const x2 = safe(AC + RLP, PC + PNC);
    const x3 = safe(AC - r.estoques, PC);
    const x4 = safe(AC, PC);
    const x5 = safe(PC + PNC, PL);
    const scoreRaw = 0.05 * x1 + 1.65 * x2 + 3.55 * x3 - 1.06 * x4 - 0.33 * x5;
    const score = kanitzBloqueado ? 0 : scoreRaw;

    let rating = "Pré-Insolvência (Penumbra)";
    let insight = "Faixa de penumbra — sinais de fragilidade, monitorar.";
    if (kanitzBloqueado) {
      rating = "Bloqueado (PL insuficiente)";
      insight = `Kanitz não aplicável: |PL|=${Math.abs(PL).toFixed(0)} < 5% do Ativo Total (${r.ativo_total.toFixed(0)}). Use ISG.`;
      console.log(`[computeKanitz] BLOQUEADO mes=${r.mesKey} |PL|=${Math.abs(PL).toFixed(0)} AT=${r.ativo_total.toFixed(0)}`);
    } else if (score > 0) { rating = "Solvente"; insight = "Empresa em situação financeira saudável (TK > 0)."; }
    else if (score < -3) { rating = "Insolvência (Falência)"; insight = "Forte indicativo de insolvência (TK < -3)."; }

    const passivoTotal = PC + PNC;
    const isg = safe(r.ativo_total, passivoTotal);
    let isg_rating = "Crítico/Insolvente";
    if (isg >= 1.5) isg_rating = "Excelente/Solvente";
    else if (isg >= 1.0) isg_rating = "Aceitável/Equilíbrio";

    // Promove ISG como preferencial quando Kanitz bloqueado OU PL <= 0.
    const modelo_preferencial: "kanitz" | "isg" = (kanitzBloqueado || PL <= 0) ? "isg" : "kanitz";

    return {
      mesKey: r.mesKey,
      ativo_total: r.ativo_total,
      passivo_total: passivoTotal,
      patrimonio_liquido: PL,
      x1: Number(x1.toFixed(4)), x2: Number(x2.toFixed(4)), x3: Number(x3.toFixed(4)),
      x4: Number(x4.toFixed(4)), x5: Number(x5.toFixed(4)),
      score: Number(score.toFixed(4)),
      rating, insight,
      isg: Number(isg.toFixed(4)),
      isg_rating,
      modelo_preferencial,
    };
  });
}

// ─── FIX #3: Insights determinísticos compactos ─────────
// FIX #6 — Também devolve risk_level e conformidade calculados a partir
// dos fatos (sem depender do output da IA, evita os "critico/35" travados).
function computeInsights(rows: BSDadosRow[], kanitz: KanitzRow[]): {
  diagnostico: string; problemas: any[]; riscos: any[]; recomendacoes: any[]; positivos: any[];
  tendencia: string; risk_level: "baixo"|"moderado"|"elevado"|"critico"; conformidade: number; risk_score: number;
} {
  const ultimo = rows[rows.length - 1];
  const ultK = kanitz[kanitz.length - 1];
  const problemas: any[] = [];
  const riscos: any[] = [];
  const positivos: any[] = [];
  const recomendacoes: any[] = [];
  if (ultimo) {
    if (ultimo.resultado < 0) problemas.push({ tipo: "resultado_negativo", valor: ultimo.resultado, descricao: "Prejuízo no exercício" });
    if (ultimo.patrimonio_liquido < 0) riscos.push({ tipo: "passivo_a_descoberto", valor: ultimo.patrimonio_liquido, descricao: "PL negativo" });
    if (ultimo.passivo_circulante > ultimo.ativo_circulante) riscos.push({ tipo: "liquidez_critica", descricao: "PC > AC" });
    if (ultK && ultK.score < -3) riscos.push({ tipo: "kanitz_insolvente", valor: ultK.score });
    if (ultimo.divida_total > 0) problemas.push({ tipo: "endividamento", valor: ultimo.divida_total });
    if (ultimo.receita_liquida > 0) positivos.push({ tipo: "receita_existente", valor: ultimo.receita_liquida });
    recomendacoes.push({ acao: "Revisar política de capital de giro" });
    if (ultimo.patrimonio_liquido < 0) recomendacoes.push({ acao: "Capitalização urgente" });
  }
  const tendencia = rows.length >= 2
    ? (rows[rows.length - 1].resultado < rows[0].resultado ? "deterioracao" : "melhora")
    : "estavel";

  // FIX #6 — Risk score determinístico (0..100, maior = pior).
  // Pondera: PL, liquidez, Kanitz/ISG, prejuízo recorrente, endividamento.
  let risk_score = 0;
  if (ultimo) {
    if (ultimo.patrimonio_liquido < 0) risk_score += 35;
    else if (ultimo.patrimonio_liquido < ultimo.ativo_total * 0.1) risk_score += 15;
    if (ultimo.passivo_circulante > 0 && ultimo.ativo_circulante / ultimo.passivo_circulante < 1) risk_score += 20;
    else if (ultimo.passivo_circulante > 0 && ultimo.ativo_circulante / ultimo.passivo_circulante < 1.2) risk_score += 8;
    if (ultimo.resultado < 0) risk_score += 15;
    if (ultK) {
      if (ultK.modelo_preferencial === "isg") {
        if (ultK.isg < 1.0) risk_score += 20;
        else if (ultK.isg < 1.5) risk_score += 8;
      } else {
        if (ultK.score < -3) risk_score += 20;
        else if (ultK.score <= 0) risk_score += 10;
      }
    }
    if (rows.length >= 3) {
      const recentes = rows.slice(-3);
      const todosPrejuizo = recentes.every(r => r.resultado < 0);
      if (todosPrejuizo) risk_score += 10;
    }
  }
  risk_score = Math.min(100, risk_score);
  const risk_level: "baixo"|"moderado"|"elevado"|"critico" =
    risk_score >= 60 ? "critico" : risk_score >= 35 ? "elevado" : risk_score >= 15 ? "moderado" : "baixo";
  const conformidade = Math.max(0, Math.round(100 - risk_score));

  const diagnostico = ultK
    ? (ultK.modelo_preferencial === "isg"
        ? `ISG=${ultK.isg.toFixed(4)} (${ultK.isg_rating}). PL negativo — Kanitz inadequado, prevalece Índice de Solvência Geral. Kanitz informativo=${ultK.score.toFixed(2)}. Risco=${risk_level} (${risk_score}/100).`
        : `Kanitz=${ultK.score.toFixed(2)} (${ultK.rating}). ISG=${ultK.isg.toFixed(2)} (${ultK.isg_rating}). ${ultK.insight} Risco=${risk_level} (${risk_score}/100).`)
    : "Análise determinística baseada nos dados consolidados.";
  return { diagnostico, problemas, riscos, recomendacoes, positivos, tendencia, risk_level, conformidade, risk_score };
}

// ─── HTTP handler ────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.balancetes)) {
      return new Response(JSON.stringify({ error: "balancetes[] obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SANITIZAÇÃO DE mesKey (FIX #2) ───────────────────────
    // Rejeita placeholders ("atual", "corrente", "—") que quebram o cast ::date
    // mais adiante e fazem perder TODA a persistência determinística.
    const isValidMesKey = (k: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
    const rawBalancetes: InputBalancete[] = body.balancetes;
    const sanitized: InputBalancete[] = [];
    const rejected: Array<{ mes: string; reason: string }> = [];
    for (const b of rawBalancetes) {
      const mk = periodToMesKey(b.mes);
      if (isValidMesKey(mk)) {
        sanitized.push({ ...b, mes: mk });
      } else {
        rejected.push({ mes: b.mes, reason: `mês inválido após normalização: "${mk}"` });
      }
    }
    if (sanitized.length === 0) {
      return new Response(JSON.stringify({
        error: "Nenhum balancete com mês válido (YYYY-MM). Forneça meses explícitos antes de consolidar.",
        rejected,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (rejected.length > 0) {
      console.warn(`[audit-bs-dados] ${rejected.length} balancete(s) descartados por mês inválido:`, rejected);
    }

    const balancetes: InputBalancete[] = sanitized;
    const bsDados = buildBSDados(balancetes);
    const indicadores = enrich(bsDados);
    const kanitz = computeKanitz(bsDados);
    const insightsObj = computeInsights(bsDados, kanitz);
    const summary = {
      meses: bsDados.length,
      total_linhas: balancetes.reduce((s, b) => s + (b.linhas?.length || 0), 0),
      errors: bsDados.reduce((s, r) => s + r.errors.length, 0),
      rejected_meses: rejected.length,
    };


    let persisted = false;
    let auditId: string | null = null;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    // ─── BACKGROUND TASKS — não bloqueiam a resposta ────────
    // Coletor de promises diferidas. Tudo o que não é necessário no payload de
    // retorno (legacy snapshot, balancete_lines, audit_logs) vai para waitUntil.
    const backgroundTasks: Promise<unknown>[] = [];
    const runBackground = (label: string, p: Promise<unknown>) => {
      backgroundTasks.push(
        p.catch((e) => console.warn(`[bg:${label}]`, (e as Error)?.message || e)),
      );
    };

    // (a) snapshot legacy em pipeline_analysis_results (compat) — BACKGROUND
    if (body.document_id && typeof body.document_id === "string") {
      runBackground("pipeline_analysis_results",
        supabase.from("pipeline_analysis_results").insert({
          document_id: body.document_id,
          indicadores: { bsDados, indicadores, summary, generated_at: new Date().toISOString() },
          mapping_score: bsDados.length ? 1 : 0,
          validation_score: summary.errors === 0 ? 1 : 0.5,
          quality_score: summary.errors === 0 && bsDados.length ? 1 : 0.5,
        }),
      );
      persisted = true;
    }

    // (b) MD MASTER: cria audit + balancetes + bs_dados + indicadores
    if (body.company_id && typeof body.company_id === "string") {
      try {
        // userId via JWT
        const { data: userData } = await supabase.auth.getUser(
          (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""),
        );
        const createdBy = userData?.user?.id;
        if (createdBy) {
          // 1. cria auditoria (FOREGROUND — precisamos do audit_id no retorno)
          const { data: auditRow, error: aErr } = await supabase
            .from("audits")
            .insert({
              company_id: body.company_id,
              created_by: createdBy,
              name: body.audit_name || `Auditoria ${new Date().toLocaleDateString("pt-BR")}`,
              variant: body.variant || "completo",
              status: "completed",
              meses_count: bsDados.length,
              metadata: { source: "audit-bs-dados", summary, periodos: bsDados.map(r => r.mesKey) },
            })
            .select("id")
            .single();
          if (aErr) throw aErr;
          auditId = auditRow.id as string;

          // 2. balancetes (1 linha por mês) — FOREGROUND (lines FK depende)
          const balancetesIns = balancetes.map((b) => ({
            audit_id: auditId,
            created_by: createdBy,
            mes_referencia: `${periodToMesKey(b.mes)}-01`,
            file_name: body.file_name || "balancete",
            total_linhas: (b.linhas || []).length,
            content_hash: body.content_hash || null,
            pipeline_document_id: body.document_id || null,
          }));
          let balIdByMes = new Map<string, string>();
          if (balancetesIns.length > 0) {
            const { data: insertedBals, error: bErr } = await supabase
              .from("balancetes")
              .insert(balancetesIns)
              .select("id, mes_referencia");
            if (bErr) throw bErr;
            for (const row of insertedBals || []) {
              balIdByMes.set(String(row.mes_referencia).slice(0, 7), row.id as string);
            }

            // 2b. balancete_lines → BACKGROUND (payload grande, não usado no retorno)
            const linesIns: any[] = [];
            for (const b of balancetes) {
              const mesKey = periodToMesKey(b.mes);
              const balId = balIdByMes.get(mesKey);
              if (!balId) continue;
              for (const l of (b.linhas || [])) {
                if (!l || (!l.conta && !l.descricao)) continue;
                const saldo = Number(l.saldo) || 0;
                if (!Number.isFinite(saldo)) continue;
                linesIns.push({
                  balancete_id: balId,
                  conta: String(l.conta || "").trim() || "—",
                  descricao: l.descricao ? String(l.descricao).slice(0, 500) : null,
                  ref1: l.ref1 ?? inferRefByCode(l.conta, l.descricao) ?? null,
                  saldo,
                });
              }
            }
            const chunks: any[][] = [];
            for (let i = 0; i < linesIns.length; i += 500) {
              chunks.push(linesIns.slice(i, i + 500));
            }
            const CONCURRENCY = 6;
            runBackground("balancete_lines", (async () => {
              for (let i = 0; i < chunks.length; i += CONCURRENCY) {
                const wave = chunks.slice(i, i + CONCURRENCY);
                const results = await Promise.all(
                  wave.map(chunk => supabase.from("balancete_lines").insert(chunk)),
                );
                for (const r of results) {
                  if (r.error) console.warn("balancete_lines insert warn:", r.error.message);
                }
              }
            })());
          }

          // 3-4. snapshots consolidados — FOREGROUND em paralelo (independentes).
          const bsRows = bsDados.map((r) => ({
            audit_id: auditId,
            mes: `${r.mesKey}-01`,
            receita_liquida: r.receita_liquida,
            cmv: r.cmv,
            despesas: r.despesas,
            despesas_financeiras: r.despesas_financeiras,
            receitas_financeiras: r.receitas_financeiras,
            depreciacao: r.depreciacao,
            amortizacao: r.amortizacao,
            resultado: r.resultado,
            ativo_circulante: r.ativo_circulante,
            ativo_nao_circulante: r.ativo_nao_circulante,
            passivo_circulante: r.passivo_circulante,
            passivo_nao_circulante: r.passivo_nao_circulante,
            patrimonio_liquido: r.patrimonio_liquido,
            ativo_total: r.ativo_total,
            passivo_total: r.passivo_total,
            estoques: r.estoques,
            estoques_bruto: r.estoques_bruto ?? null,
            disponivel: r.disponivel,
            contas_receber: r.contas_receber,
            imobilizado: r.imobilizado,
            divida_tributaria: r.divida_tributaria,
            divida_trabalhista: r.divida_trabalhista,
            divida_financeira: r.divida_financeira,
            fornecedores: r.fornecedores,
            credores_rj: r.credores_rj,
            outras_obrigacoes: r.outras_obrigacoes,
            divida_total: r.divida_total,
            divida_total_bruto: r.divida_total_bruto ?? null,
            errors: r.errors,
            ytd_flags: r.ytd_flags ?? null,
          }));
          const indRows = indicadores.map((i, idx) => ({
            audit_id: auditId,
            mes: `${bsDados[idx].mesKey}-01`,
            cmv_percent: i.cmvPercent,
            despesa_percent: i.despesaPercent,
            cmv_despesa_percent: i.cmvDespesaPercent,
            resultado_percent: i.resultadoPercent,
            liquidez_corrente: i.liquidezCorrente,
            liquidez_seca: i.liquidezSeca,
            liquidez_imediata: i.liquidezImediata,
          }));
          const kanitzRows = kanitz.map(k => ({
            audit_id: auditId,
            mes: `${k.mesKey}-01`,
            ativo_total: k.ativo_total,
            passivo_total: k.passivo_total,
            patrimonio_liquido: k.patrimonio_liquido,
            x1: k.x1, x2: k.x2, x3: k.x3, x4: k.x4, x5: k.x5,
            score: k.score, rating: k.rating, insight: k.insight,
            isg: k.isg, isg_rating: k.isg_rating,
            modelo_preferencial: k.modelo_preferencial,
          }));

          const parallelOps: Promise<unknown>[] = [];
          if (bsRows.length > 0)
            parallelOps.push(supabase.from("bs_dados").upsert(bsRows, { onConflict: "audit_id,mes" }));
          if (indRows.length > 0)
            parallelOps.push(supabase.from("indicadores").insert(indRows));
          if (kanitzRows.length > 0)
            parallelOps.push(supabase.from("kanitz_scores").insert(kanitzRows));
          parallelOps.push(supabase.from("insights").insert({
            audit_id: auditId,
            diagnostico: insightsObj.diagnostico,
            problemas: insightsObj.problemas,
            riscos: insightsObj.riscos,
            recomendacoes: insightsObj.recomendacoes,
            positivos: insightsObj.positivos,
            tendencia: insightsObj.tendencia,
            generated_by: "deterministic-bs-dados-v2",
          }));
          const parallelResults = await Promise.all(parallelOps);
          for (const r of parallelResults) {
            const err = (r as any)?.error;
            if (err) console.warn("[parallel persist]", err.message);
          }

          // 5. audit_log → BACKGROUND
          runBackground("audit_logs",
            supabase.from("audit_logs").insert({
              audit_id: auditId,
              etapa: "bs_dados.persist",
              status: "ok",
              payload: { meses: bsDados.length, errors: summary.errors, kanitz: kanitzRows.length },
            }),
          );

          persisted = true;
        }
      } catch (mdErr) {
        console.warn("MD MASTER persist warn:", (mdErr as Error)?.message);

      }
    }

    // Sustenta os inserts diferidos após o response retornar.
    if (backgroundTasks.length > 0) {
      try {
        // @ts-ignore — EdgeRuntime é injetado pelo Supabase Edge Runtime
        (globalThis as any).EdgeRuntime?.waitUntil?.(Promise.all(backgroundTasks));
      } catch { /* sem suporte ao waitUntil — ignora */ }
    }

    return new Response(JSON.stringify({ bsDados, indicadores, kanitz, insights: insightsObj, summary, persisted, audit_id: auditId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
