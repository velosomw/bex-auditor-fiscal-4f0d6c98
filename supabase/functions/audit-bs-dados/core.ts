// ─── Tipos ───────────────────────────────────────────────
export interface InputLinha {
  conta?: string;
  descricao?: string;
  ref1?: string | null;
  saldo: number;
}
export interface InputBalancete {
  mes: string;
  linhas: InputLinha[];
  /** Usuário marcou este balancete como YTD (saldo acumulado desde Jan). */
  is_ytd?: boolean;
}
export interface BSDadosRow {
  mes: string;
  mesKey: string;
  receita_liquida: number;
  cmv: number;
  despesas: number;                 // grupo 6 — operacionais
  despesas_financeiras: number;     // grupo 7 — separado (alinhado com client)
  receitas_financeiras: number;     // grupo 7+ / juros ativos / rendimentos — usado em EBITDA (subtrai)
  outras_nao_operacionais: number;  // grupo 8 — não operacionais (signed: receita+, despesa-)
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

export interface BSIndicators {
  mes: string;
  cmvPercent: number | null;
  despesaPercent: number | null;
  cmvDespesaPercent: number | null;
  resultadoPercent: number | null;
  liquidezCorrente: number | null;
  liquidezSeca: number | null;
  liquidezImediata: number | null;
}
export interface KanitzRow {
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
  "DESPESAS_NOP": "outras_nao_operacionais", // grupo 8 — não operacionais em campo dedicado (Fix C)
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
  // FIX (d): 12X/13X imobilizado & intangível roteiam para a coluna dedicada
  // `imobilizado` (REF C1/D1) em vez do bucket ANC genérico, para que a tabela
  // de Endividamento exiba "Imobilizado e Intangível" granular (≈2,3M no
  // Parecer Giannini) em vez de despejar todo o ANC (16,7M).
  [/^121/,   "P"], [/^122/, "Q"], [/^123/, "R"], [/^124/, "S"],
  [/^125/,   "C1"], [/^126/, "C1"],            // Imobilizado (planos 12.5/12.6)
  [/^127/,   "D1"], [/^128/, "D1"],            // Intangível
  [/^12/,    "ANC_TOTAL"],
  [/^131/,   "C1"], [/^132/, "D1"],            // Permanente: Imob/Intang
  [/^133/,   "C1"], [/^134/, "D1"],
  [/^13/,    "ANC_TOTAL"],
  // ── PASSIVO CIRCULANTE — sub-classificação via descrição ───
  // FIX (B): 211 = Fornecedores EXPLÍCITO. Outros 21X NUNCA caem em "BB".
  [/^211/,   "BB"],
  [/^21[2-9]/, "PC_COMPONENT"],
  [/^21/,    "PC_TOTAL"],
  // ── PASSIVO NÃO CIRCULANTE ───
  // FIX (Giannini): 221 NÃO é universalmente Fornecedores LP — em vários planos
  // (ex. Giannini) é o agrupador inteiro do PNC (Impostos/RJ/Outros). Resolvemos
  // por descrição para evitar despejar todo o PNC (~349M) em fornecedores.
  [/^22[1-9]/, "PNC_COMPONENT"],
  [/^22/,    "PNC_TOTAL"],
  // ── PATRIMÔNIO LÍQUIDO ───
  [/^231/,   "GG1"], [/^232/, "HH1"], [/^233/, "HH1"], [/^234/, "HH1"],
  [/^23/,    "PL_TOTAL"],
  [/^24/,    "GG1"],
  // ── DRE ───
  // FIX (A): Receita = 31 − 32 − 33. Bare "3".."8" são raízes — IGNORAR.
  [/^3$/,    "DRE_ROOT_IGNORE"],
  [/^4$/,    "DRE_ROOT_IGNORE"],
  [/^5$/,    "DRE_ROOT_IGNORE"],
  [/^6$/,    "DRE_ROOT_IGNORE"],
  [/^7$/,    "DRE_ROOT_IGNORE"],
  [/^8$/,    "DRE_ROOT_IGNORE"],
  [/^31/,    "RECEITA_OR_DEDUCAO"],  // 31x pode ser bruta OU dedução — classifica por descrição
  [/^32/,    "DEDUCOES_RECEITA"],
  [/^33/,    "DEDUCOES_RECEITA"],
  [/^4/,     "CMV"],
  [/^5/,     "CMV"],          // Custo Industrial → CMV
  [/^6/,     "DESPESAS"],     // Despesas Operacionais
  // FIX (user): grupo 7 INTEIRO entra como Despesas Financeiras (módulo)
  // conforme visibilidade do Grupo de Resultado (linha 1137 do balancete
  // de referência). NÃO mais split por descrição em receita vs despesa.
  [/^7/,     "DESPESAS_FIN"],
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
  // FIX (B): fornecedores só via 211; NÃO casamos por descrição aqui.
  if (/emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?|leasing|arrendament/.test(d)) return "AA";
  if (/sal[aá]ri|f[eé]rias|13[ºo°]|d[eé]cimo\s+terceiro|inss|fgts|trabalhi|encargos\s+soci|provis[aã]o.*f[eé]ria/.test(d)) return "CC";
  if (/tribut|imposto|icms|iss|pis|cofins|irpj|csll|simples|parcelament|refis/.test(d)) return "DD";
  return "JJ"; // Outras Obrigações
}

function classifyPNCByDescription(desc: string): string {
  const d = stripAccents(desc);
  if (/credores?\s+rj|recuperacao\s+judic/.test(d)) return "CC1";
  if (/emprestim|financiament|instituic[oõ]es?\s+financ|deb[eê]ntures?|leasing|arrendament/.test(d)) return "QQ";
  if (/tribut|imposto|parcelament|refis/.test(d)) return "RR";
  // Fornecedores LP só quando a descrição é EXPLÍCITA — evita falso match em
  // planos onde 221 é o totalizador genérico do PNC.
  if (/\bfornecedor/.test(d)) return "PP";
  return "DD1";
}

export function inferRefByCode(code?: string, descricao?: string): string | null {
  const c = String(code || "").replace(/\s+/g, "");
  for (const [pattern, ref] of REF_BY_PREFIX) {
    if (pattern.test(c)) {
      if (ref === "PC_COMPONENT") return classifyPCByDescription(descricao || "");
      if (ref === "PNC_COMPONENT") return classifyPNCByDescription(descricao || "");
      if (ref === "FIN_GROUP") return classifyFinByDescription(descricao || "");
      if (ref === "RECEITA_OR_DEDUCAO") return isDeducaoByDescription(descricao || "") ? "DEDUCOES_RECEITA" : "RECEITA";
      // FIX (A): raiz DRE bare ("3".."8") — sinaliza para resolveKey ignorar.
      if (ref === "DRE_ROOT_IGNORE") return "__IGNORE__";
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
  imobilizado: /\b(?:imobilizado|intang[ií]vel|m[aá]quina|equipamento|ve[ií]culo|edifica[cç][oõ]es|terreno|m[oó]vel\s+e?\s*utens[ií]li|software|marca\s+e\s+patent)/i,
};


// ─── Helpers ─────────────────────────────────────────────
const upper = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
const norm  = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const pad2  = (n: number | string) => String(n).padStart(2, "0");

/**
 * TAXONOMIA POR NOME DO GRUPO DE RESULTADO
 * --------------------------------------------------------
 * A classificação se baseia no NOME/TEXTO do Grupo, NUNCA na posição da
 * linha no arquivo — assim suporta balancetes de planos de contas distintos.
 *
 * IMOBILIZADO (líquido = "Ativo Permanente"):
 *   Imobilizado Custo Corrigido (bruto, saldo +)
 *   ( − ) Depreciação Acumulada (contra-ativo, saldo −)
 *   = Ativo Permanente (líquido)
 *
 * As folhas de Depreciação Acumulada vêm com saldo NEGATIVO no balancete;
 * por isso o bucket `imobilizado` precisa preservar SINAL NATURAL (não usar
 * Math.abs), permitindo que a depreciação subtraia o bruto e chegue ao
 * líquido equivalente ao "Ativo Permanente" (linha ~130 do plano).
 */


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
export function periodToMesKey(p: string): string {
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

export function emptyRow(mesKey: string): BSDadosRow {
  return {
    mes: mesKeyToLabel(mesKey), mesKey,
    receita_liquida: 0, cmv: 0, despesas: 0, despesas_financeiras: 0, receitas_financeiras: 0, outras_nao_operacionais: 0,
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

export function resolveKey(linha: InputLinha): keyof BSDadosRow | null {
  let ref1 = linha.ref1 ?? inferRefByCode(linha.conta, linha.descricao);
  // FIX (A): raízes DRE bare descartadas — não cair em fallback regex.
  if (ref1 === "__IGNORE__") return null;
  // FIX (imobilizado por nome): se a descrição menciona Imobilizado /
  // Depreciação Acumulada / Intangível / Ativo Permanente, OU o código
  // pertence ao grupo 13x (Permanente), forçamos C1/D1 mesmo que o parser
  // tenha gravado ref1 errado (ex.: "R" = Depósitos Judiciais LP). Caso
  // contrário, depreciações somam em ANC como positivo (Math.abs) e o
  // bucket imobilizado nunca recebe o líquido bruto-depreciação.
  const desc = stripAccents(linha.descricao || "");
  const codigoStr = String(linha.conta || "").replace(/\s+/g, "");
  const isImobByName = /\b(imobilizad|deprecia[cç][aã]o\s+acumulad|ativo\s+permanent)\b/.test(desc);
  const isIntangByName = /\bintang[ií]vel|amortiza[cç][aã]o\s+acumulad/.test(desc);
  if (isImobByName || /^131/.test(codigoStr)) ref1 = "C1";
  else if (isIntangByName || /^132/.test(codigoStr)) ref1 = "D1";

  // FIX Giannini: ref1 "PP" vem da planilha como rótulo genérico do PNC em
  // alguns planos (ex.: 221/221010 "Impostos e Contribuições" marcadas como PP).
  // Só aceitamos PP quando a descrição explicita "fornecedor"; caso contrário
  // reclassificamos pelo conteúdo para não inflar fornecedores LP.
  if (ref1 && upper(ref1) === "PP") {
    const d = stripAccents(linha.descricao || "");
    if (!/\bfornecedor/.test(d)) {
      ref1 = classifyPNCByDescription(linha.descricao || "");
    }
  }
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
export interface Buckets {
  ac: number; pc: number;
  anc: number; pnc: number; pl: number;
  sawACTotal: boolean; sawPCTotal: boolean;
  sawANCTotal: boolean; sawPNCTotal: boolean; sawPLTotal: boolean;
  // Valores declarados pelo GT (totalizador), para preferi-los às folhas em finalize
  gtAC: number; gtPC: number; gtANC: number; gtPNC: number; gtPL: number;
}

export function emptyBuckets(): Buckets {
  return {
    ac: 0, pc: 0, anc: 0, pnc: 0, pl: 0,
    sawACTotal: false, sawPCTotal: false, sawANCTotal: false, sawPNCTotal: false, sawPLTotal: false,
    gtAC: 0, gtPC: 0, gtANC: 0, gtPNC: 0, gtPL: 0,
  };
}

// ANC = P..J1 (15 refs do MD §2.2)
const ANC_REFS = new Set(["P","Q","R","S","T","U","V","W","X","Y","Z","A1","B1","C1","D1","E1","F1","G1","H1","I1","J1"]);
// PNC = PP..FF1 (§2.4)
const PNC_REFS = new Set(["PP","QQ","RR","SS","TT","UU","VV","WW","XX","YY","ZZ","A1A","B1A","C1A","D1A","E1A","F1A","AA1","BB1","CC1A","DD1","EE1","FF1"]);
// PL = GG1, HH1 + "Resultado" (§2.5)
const PL_REFS = new Set(["GG1","HH1","RESULTADO_EXERCICIO"]);

export function applyValue(row: BSDadosRow, key: keyof BSDadosRow, v: number, ref1: string | null | undefined, b: Buckets) {
  if (!Number.isFinite(v)) return;
  const refUp = ref1 ? upper(ref1) : "";
  const isTotal = refUp.endsWith("_TOTAL"); // AC_TOTAL, PC_TOTAL, ANC_TOTAL, PNC_TOTAL, PL_TOTAL
  switch (key) {
    case "receita_liquida": row.receita_liquida += refUp === "DEDUCOES_RECEITA" ? -Math.abs(v) : Math.abs(v); break;
    case "cmv":             row.cmv -= Math.abs(v); break;
    case "despesas":        row.despesas -= Math.abs(v); break;
    case "despesas_financeiras": row.despesas_financeiras -= Math.abs(v); break;
    case "receitas_financeiras": row.receitas_financeiras += Math.abs(v); break;
    case "outras_nao_operacionais": row.outras_nao_operacionais += v; break; // signed (grupo 8)
    case "depreciacao":     row.depreciacao -= Math.abs(v); break;
    case "amortizacao":     row.amortizacao -= Math.abs(v); break;
    case "resultado":       row.resultado += v; break;
    // FIX (b): totalizadores IRMÃOS (ex: ANC = grupo 12 + grupo 13) devem ser
    // SOMADOS, não MAX. Antes Math.max perdia o grupo 13 (Ativo Permanente)
    // quando havia também o grupo 12. Mesma lógica aplicada a AC/PC/PNC/PL
    // para suportar planos contábeis com múltiplos subgrupos totalizadores.
    case "ativo_circulante":
      if (isTotal) { b.sawACTotal = true; b.gtAC += Math.abs(v); }
      else { row.ativo_circulante += Math.abs(v); }
      break;
    case "passivo_circulante":
      if (isTotal) { b.sawPCTotal = true; b.gtPC += Math.abs(v); }
      else { row.passivo_circulante += Math.abs(v); }
      break;
    case "ativo_nao_circulante":
      if (isTotal) { b.sawANCTotal = true; b.gtANC += Math.abs(v); }
      else { row.ativo_nao_circulante += Math.abs(v); }
      break;
    case "passivo_nao_circulante":
      if (isTotal) { b.sawPNCTotal = true; b.gtPNC += Math.abs(v); }
      else { row.passivo_nao_circulante += Math.abs(v); }
      break;
    case "patrimonio_liquido":
      if (isTotal) { b.sawPLTotal = true; b.gtPL += v; }
      else { row.patrimonio_liquido += v; }
      break;
    // Imobilizado preserva SINAL NATURAL: depreciação acumulada vem com saldo
    // negativo (contra-ativo) e deve SUBTRAIR do Imobilizado bruto para
    // produzir o líquido equivalente ao "Ativo Permanente".
    case "imobilizado":
      row.imobilizado += v; break;
    case "contas_receber":
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

export function finalize(r: BSDadosRow, b?: Buckets): BSDadosRow {
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
  // FIX (user): Resultado do Mês = código 3 INTEIRO (linha 990 de referência
  // no Relatório Técnico), acumulado em r.resultado durante o loop de
  // buildBSDados a partir das folhas com conta iniciando em "3". Não
  // sobrescrevemos aqui — preserva o valor já agregado (com sinal natural).
  r.ativo_total = r.ativo_circulante + r.ativo_nao_circulante;
  r.passivo_total = r.passivo_circulante + r.passivo_nao_circulante;

  // FIX #7 + FIX (a) — Reclassificação CP/LP só dispara quando o parser
  // claramente NÃO trouxe PC nem PNC totalizadores. Se já temos PNC (b.sawPNCTotal
  // ou r.passivo_nao_circulante>0 a partir de buckets PNC explícitos como RR/CC1/
  // QQ/PP/UU…), reclassificar componentes em PC produz dupla contagem (PC infla
  // com tributário/credores LP que já estão consolidados nos buckets).
  // Só aplica heurística quando: PC=0 E PNC=0 (nada estruturado) — assume tudo PC.
  const semTotalizadorPassivo = !b?.sawPCTotal && !b?.sawPNCTotal;
  if (
    semTotalizadorPassivo &&
    r.passivo_circulante === 0 &&
    r.passivo_nao_circulante === 0 &&
    componentesPC > 0
  ) {
    r.passivo_circulante = componentesPC;
    r.passivo_total = r.passivo_circulante + r.passivo_nao_circulante;
    r.errors.push(`Passivo Circulante reclassificado a partir de componentes (PC=${componentesPC.toFixed(0)}) — balancete não trouxe totalizadores PC/PNC`);
    console.log(`[finalize] RECLASS_PC mes=${r.mesKey} PC=${r.passivo_circulante.toFixed(0)} PNC=${r.passivo_nao_circulante.toFixed(0)}`);
  }

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
  // PL pode ser NEGATIVO (passivo a descoberto) — não tratar como erro.
  if (r.ativo_total > 0 && (r.passivo_total > 0 || r.patrimonio_liquido !== 0)) {
    const ladoDireito = r.passivo_total + r.patrimonio_liquido;
    const diff = Math.abs(r.ativo_total - ladoDireito);
    const tol = Math.max(r.ativo_total * 0.01, 1);
    if (diff > tol) {
      const desvio = (diff / r.ativo_total) * 100;
      const plEsperado = r.ativo_total - r.passivo_total;
      // FIX #4 + FIX B — Auto-rebalanço em 3 cenários:
      //   (1) PL positivo inflado (dupla contagem): PL > Ativo
      //   (2) Sinais divergentes: PL lido positivo mas A−P negativo (parser perdeu sinal
      //       de passivo a descoberto), ou vice-versa
      //   (3) PL = 0 mas A ≠ P (faltou capturar PL ou capturou só totalizador zerado)
      const inflatedPositive = r.patrimonio_liquido > r.ativo_total;
      const signDivergence =
        (r.patrimonio_liquido > 0 && plEsperado < -tol) ||
        (r.patrimonio_liquido < 0 && plEsperado > tol);
      const plMissing = r.patrimonio_liquido === 0 && Math.abs(plEsperado) > tol;
      if (inflatedPositive || signDivergence || plMissing) {
        const plOriginal = r.patrimonio_liquido;
        r.patrimonio_liquido_bruto = plOriginal;
        r.patrimonio_liquido = plEsperado;
        const motivo = inflatedPositive
          ? `original ${plOriginal.toFixed(0)} excedia Ativo Total ${r.ativo_total.toFixed(0)}`
          : signDivergence
            ? `sinais divergentes (lido ${plOriginal.toFixed(0)}, A−P = ${plEsperado.toFixed(0)} → indica passivo a descoberto ou inversão)`
            : `PL ausente no balancete; derivado de A−P = ${plEsperado.toFixed(0)}`;
        r.errors.push(`PL recalculado por equação contábil — ${motivo}`);
        console.log(`[finalize] PL_REBALANCE mes=${r.mesKey} motivo=${inflatedPositive ? "inflated" : signDivergence ? "sign_divergence" : "missing"} original=${plOriginal.toFixed(0)} derivado=${plEsperado.toFixed(0)} ativo=${r.ativo_total.toFixed(0)} passivo=${r.passivo_total.toFixed(0)}`);
      } else {
        r.errors.push(`Equação contábil rompida: Ativo=${r.ativo_total.toFixed(0)} ≠ Passivo+PL=${ladoDireito.toFixed(0)} (desvio ${desvio.toFixed(2)}%)`);
        console.log(`[finalize] EQ_BREAK mes=${r.mesKey} A=${r.ativo_total.toFixed(0)} P+PL=${ladoDireito.toFixed(0)} desvio=${desvio.toFixed(2)}% PC=${r.passivo_circulante.toFixed(0)} PNC=${r.passivo_nao_circulante.toFixed(0)} PL=${r.patrimonio_liquido.toFixed(0)}`);
      }
    }
  }
  // Sinaliza passivo a descoberto (não é erro, é diagnóstico contábil real).
  if (r.patrimonio_liquido < 0) {
    console.log(`[finalize] PASSIVO_A_DESCOBERTO mes=${r.mesKey} PL=${r.patrimonio_liquido.toFixed(0)}`);
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
  /^patrim[oô]nio\s+l[ií]quido\s*(?:\(.*\))?$/i,            // FIX #3 — PL puro
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
  // FIX #3 — totalizadores hierárquicos comuns em planos brasileiros
  /^(grupo|conta)\s+sint[eé]tic/i,
  /^capital\s+(social\s+)?(integralizado|total)$/i,
  /^reservas?\s+(de\s+)?(capital|lucros?|total)$/i,
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
export function pruneParents(linhas: InputLinha[]): InputLinha[] {
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
  // FIX #3 — Detecção estrutural: se valor(pai) ≈ Σ valor(filhas diretas),
  // remove o pai (é totalizador real e a soma das folhas é fiel ao saldo).
  const valByCode = new Map<string, number>();
  for (const l of linhas) {
    const c = normCode(l.conta);
    if (c) valByCode.set(c, (valByCode.get(c) || 0) + (Number(l.saldo) || 0));
  }
  const structuralParents = new Set<string>();
  for (const c of parents) {
    const parentVal = valByCode.get(c) || 0;
    if (Math.abs(parentVal) < 1) continue;
    let childSum = 0;
    for (const other of sorted) {
      if (other === c || !other.startsWith(c)) continue;
      // só filhas imediatas (1 nível abaixo)
      const suffix = other.slice(c.length).replace(/^\.+/, "");
      if (suffix && !suffix.includes(".") && /^\d+$/.test(suffix)) {
        childSum += valByCode.get(other) || 0;
      }
    }
    if (childSum !== 0 && Math.abs(parentVal - childSum) / Math.max(Math.abs(parentVal), 1) < 0.02) {
      structuralParents.add(c);
    }
  }
  // FIX — pais com ref1 mapeado em REF1_MAP (RR, CC1, JJ, AA, BB, DD, etc.)
  // devem ser PRESERVADOS e suas filhas DIRETAS removidas. O parser detecta
  // ref1 no nível do agrupador (ex: conta 221010 "Tributário Parcelado" → RR);
  // as folhas (221010.01 ICMS Refis, etc.) raramente carregam ref1 e seu
  // texto nem sempre bate com FALLBACK_PATTERNS, ficando órfãs e zerando
  // os buckets divida_tributaria/credores_rj/outras_obrigacoes.
  const mappedParents = new Set<string>();
  for (const l of linhas) {
    const c = normCode(l.conta);
    if (!c) continue;
    if (!(parents.has(c) || structuralParents.has(c))) continue;
    // FIX (b): se o pai não tem ref1 explícito, inferimos pelo código+descrição
    // para detectar agrupadores PNC (CC1=Credores RJ, RR=Tributário Parcelado,
    // JJ=Outras) que o parser não marcou. Sem isso, o pai fica órfão e o saldo
    // oficial do balancete não chega aos buckets `credores_rj`, `divida_tributaria`.
    let r1 = typeof l.ref1 === "string" ? upper(l.ref1.trim()) : "";
    if (!r1) {
      const inferred = inferRefByCode(l.conta, l.descricao);
      if (inferred) r1 = upper(inferred);
    }
    if (!r1 || r1.endsWith("_TOTAL")) continue;
    // FIX Giannini: ref1 "PP" como rótulo genérico do PNC — só promove a
    // mappedParent quando a descrição é explicitamente Fornecedores. Caso
    // contrário reclassifica por descrição; se cair em DD1 (catch-all sem
    // sinal específico), NÃO adiciona como mappedParent para que as filhas
    // específicas (RR=tributário, CC1=credores RJ) permaneçam na linha e o
    // pai genérico seja removido como structuralParent.
    if (r1 === "PP") {
      const d = stripAccents(l.descricao || "");
      if (!/\bfornecedor/.test(d)) {
        const re = upper(classifyPNCByDescription(l.descricao || ""));
        if (re === "DD1") continue;
        r1 = re;
      }
    }
    if (REF1_MAP[r1]) mappedParents.add(c);

  }
  const isChildOfMappedParent = (c: string) => {
    for (const p of mappedParents) {
      if (c === p || !c.startsWith(p)) continue;
      const suffix = c.slice(p.length).replace(/^\.+/, "");
      if (suffix && /^\d/.test(suffix)) return true;
    }
    return false;
  };
  const filtered = linhas.filter(l => {
    const c = normCode(l.conta);
    // FIX — totalizadores oficiais do balancete (AC_TOTAL/PC_TOTAL/ANC_TOTAL/
    // PNC_TOTAL/PL_TOTAL) NUNCA podem ser podados, mesmo que sejam prefixo de
    // contas filhas. São a fonte da verdade para AC/PC/PNC/PL em finalize().
    const isTotalRef = typeof l.ref1 === "string" && /_TOTAL$/i.test(l.ref1.trim());
    if (isTotalRef) return true;
    if (isSyntheticDesc(l.descricao)) return false;
    if (!c) return true;
    // FIX dupla contagem fornecedores: descendentes de QUALQUER mappedParent
    // são removidos PRIMEIRO. Sub-parents mapeados (ex: 211010 sob 211) eram
    // preservados antes, inflando o bucket fornecedores em 20× (parent + sub-parents).
    if (isChildOfMappedParent(c)) return false;
    // Preserva apenas o mappedParent topmost (ex: 211) — a fonte do bucket.
    if (mappedParents.has(c)) return true;
    if (parents.has(c)) return false;
    if (structuralParents.has(c)) return false;
    return true;
  });
  const removed = before - filtered.length;
  if (removed > 0) {
    console.log(`[pruneParents] removidas ${removed}/${before} linhas (pais sintéticos+estruturais=${structuralParents.size})`);
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
  // FIX (user/Parecer Giannini): "resultado" é DELTA do Grupo de Resultado 3 (linha 990).
  // Todos os grupos de resultado (3, 4, 5, 6, 7, 8) seguem a regra:
  //   mensal = saldo(mês_n) - saldo(mês_n-1)
  // Quando QUALQUER chave da DRE indica YTD no ano, aplicamos delta em TODAS
  // (compartilham o mesmo ciclo contábil acumulado).
  const dreKeys: Array<"receita_liquida" | "cmv" | "despesas" | "despesas_financeiras" | "receitas_financeiras" | "outras_nao_operacionais" | "resultado"> = [
    "receita_liquida", "cmv", "despesas", "despesas_financeiras",
    "receitas_financeiras", "outras_nao_operacionais", "resultado",
  ];
  const byYear = new Map<string, BSDadosRow[]>();
  for (const r of sorted) {
    const y = r.mesKey.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }
  for (const [, group] of byYear) {
    if (group.length < 2) continue;

    const ytdMarked = group.filter(r => userYtdByMesKey.get(r.mesKey)).length;
    const userForceExact = ytdMarked >= 2;

    // Detecta YTD por chave: (a) monotônico crescente em |valor| ou
    // (b) primeiro mês outlier (>= 3× mediana dos demais — clássico YTD acumulado de meses anteriores).
    const triggerKeys = new Set<string>();
    const reasons: Record<string, string> = {};
    for (const k of dreKeys) {
      let monotonicPairs = 0, totalPairs = 0;
      for (let i = 1; i < group.length; i++) {
        const prev = Math.abs(group[i - 1][k] as number);
        const curr = Math.abs(group[i][k] as number);
        if (prev > 0) { totalPairs++; if (curr >= prev * 1.02) monotonicPairs++; }
      }
      const monoMatch = totalPairs >= 2 && monotonicPairs / totalPairs >= 0.8;
      // outlier do primeiro mês
      let outlierMatch = false;
      if (group.length >= 3) {
        const first = Math.abs(group[0][k] as number);
        const others = group.slice(1).map(r => Math.abs(r[k] as number)).filter(v => v > 0).sort((a,b) => a-b);
        if (others.length >= 2 && first > 0) {
          const median = others[Math.floor(others.length / 2)];
          if (median > 0 && first >= median * 3) outlierMatch = true;
        }
      }
      if (monoMatch || outlierMatch) {
        triggerKeys.add(k);
        reasons[k] = monoMatch ? `monotônico ${monotonicPairs}/${totalPairs}` : "outlier-1ºmês";
      }
    }

    const shouldApply = userForceExact || triggerKeys.size > 0;
    if (!shouldApply) continue;

    // Aplica DELTA em TODAS as chaves DRE (regra Grupo de Resultado uniforme)
    const firstMes = parseInt(group[0].mesKey.slice(5, 7), 10) || 1;
    for (const k of dreKeys) {
      const original = group.map(g => g[k] as number);
      // meses 2..N: delta YTD-YTD
      for (let i = group.length - 1; i >= 1; i--) {
        (group[i] as any)[k] = original[i] - original[i - 1];
      }
      // mês 1: estima mensal = YTD / fiscal_month_number
      if (firstMes > 1 && original[0] !== 0) {
        (group[0] as any)[k] = original[0] / firstMes;
      }
    }
    const triggers = triggerKeys.size > 0 ? `[gatilho: ${[...triggerKeys].join(",")}]` : "[user-YTD]";
    const tag = `DRE desacumulada por Grupo de Resultado ${triggers}`;
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
    console.log(`[desacumularDRE] ano=${group[0].mesKey.slice(0,4)} aplicado a TODAS as chaves DRE; gatilhos=${JSON.stringify(reasons)} firstMes=${firstMes}`);
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

export function buildBSDados(balancetes: InputBalancete[]): BSDadosRow[] {
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
    // Taxonomia por nome: deduplica grupos sinônimos (ex.: "Ativo Permanente"
    // = "Imobilizado Custo Corrigido") antes da poda hierárquica.
    const linhasLeaf = pruneParents(b.linhas || []);
    for (const linha of linhasLeaf) {
      const saldo = Number(linha.saldo) || 0;
      // FIX (user): Resultado do Mês = código 3 todo (linha 990 de
      // referência). Acumulamos o sinal natural das folhas iniciadas em "3"
      // — é o único feed do bucket `resultado`. Demais grupos (4..8) NÃO
      // entram aqui; eles são lidos via receita_liquida/cmv/despesas/etc.
      const conta = String(linha.conta || "").replace(/\s+/g, "");
      if (/^3(\d|$)/.test(conta)) {
        row.resultado += saldo;
      }
      const key = resolveKey(linha);
      if (!key) continue;
      applyValue(row, key, saldo, linha.ref1 ?? inferRefByCode(linha.conta, linha.descricao), buckets);
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

export function enrich(rows: BSDadosRow[]): BSIndicators[] {
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
export function computeKanitz(rows: BSDadosRow[]): KanitzRow[] {
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
export function computeInsights(rows: BSDadosRow[], kanitz: KanitzRow[]): {
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

