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
import { inferRefByCode, type ParsedFinancialData } from "@/services/auditAIService";
import {
  mesKeyToLabel as _mesKeyToLabel,
  periodToMesKey as _periodToMesKey,
  detectDuplicates,
} from "@/services/mesNormalizer";

// Mapeamento Ref 1 (Ref Capital BEX) → chave canônica BS & Dados.
// Cobertura COMPLETA das 47 referências da aba "BS" do template
// (Ativo Circulante A..O, ANC P..J1, Passivo Circulante AA..II1, PNC PP..FF1, PL GG1/HH1/Resultado).
// Ref ausente do mapa = ignorada na consolidação (não-zerada apenas se houver fallback regex).
export const REF1_MAP: Record<string, keyof BSDadosRow> = {
  // ── Ativo Circulante (A..O) ──
  "A": "disponivel",        // Caixa e Equivalentes
  "B": "disponivel",        // Aplicações Financeiras
  "C": "ativo_circulante",  // Contas a receber clientes (também → contas_receber via orth.)
  "D": "estoques",          // Estoque
  "E": "ativo_circulante",
  "F": "ativo_circulante",
  "G": "ativo_circulante",
  "H": "ativo_circulante",
  "I": "ativo_circulante",
  "J": "ativo_circulante",
  "K": "ativo_circulante",
  "L": "ativo_circulante",
  "M": "ativo_circulante",
  "N": "ativo_circulante",
  "O": "ativo_circulante",
  // ── Ativo Não Circulante (P..J1) ──
  "P": "ativo_nao_circulante",  "Q": "ativo_nao_circulante",  "R": "ativo_nao_circulante",
  "S": "ativo_nao_circulante",  "T": "ativo_nao_circulante",  "U": "ativo_nao_circulante",
  "V": "ativo_nao_circulante",  "W": "ativo_nao_circulante",  "X": "ativo_nao_circulante",
  "Y": "ativo_nao_circulante",  "Z": "ativo_nao_circulante",  "A1": "ativo_nao_circulante",
  "B1": "ativo_nao_circulante",
  "C1": "ativo_nao_circulante", // Imobilizado Líquido — também alimenta orth. imobilizado
  "D1": "ativo_nao_circulante", // Intangível — também alimenta orth. imobilizado
  "E1": "ativo_nao_circulante", "F1": "ativo_nao_circulante", "G1": "ativo_nao_circulante",
  "H1": "ativo_nao_circulante", "I1": "ativo_nao_circulante", "J1": "ativo_nao_circulante",
  // ── Passivo Circulante (AA..II1) ──
  "AA": "divida_financeira",
  "BB": "fornecedores",
  "CC": "divida_trabalhista",
  "DD": "divida_tributaria",
  "EE": "passivo_circulante",
  "FF": "passivo_circulante",
  "GG": "passivo_circulante",
  "HH": "passivo_circulante",
  "II": "credores_rj",
  "JJ": "outras_obrigacoes",  // resíduo do PC sub-classificado
  "KK": "passivo_circulante",
  "LL": "credores_rj",
  "MM": "passivo_circulante",
  "NN": "divida_tributaria",
  "OO": "passivo_circulante",
  "II1": "divida_tributaria",
  // ── Passivo Não Circulante (PP..FF1) ──
  "PP": "fornecedores",        // LP
  "QQ": "divida_financeira",   // LP
  "RR": "divida_tributaria",   // LP
  "SS": "divida_tributaria",
  "TT": "divida_financeira",
  "UU": "passivo_nao_circulante", "VV": "passivo_nao_circulante", "WW": "passivo_nao_circulante",
  "XX": "passivo_nao_circulante", "YY": "passivo_nao_circulante", "ZZ": "passivo_nao_circulante",
  "AA1": "passivo_nao_circulante", "BB1": "passivo_nao_circulante",
  "CC1": "credores_rj",        // RJ LP
  "DD1": "passivo_nao_circulante", "EE1": "passivo_nao_circulante", "FF1": "passivo_nao_circulante",
  // ── Patrimônio Líquido ──
  "GG1": "patrimonio_liquido", // Capital Social
  "HH1": "patrimonio_liquido", // Lucros/Prejuízos Acumulados
  "RESULTADO": "resultado",
  // ── Totais de grupo (autoritativos quando linha-totalizadora existe) ──
  "AC_TOTAL":  "ativo_circulante",
  "ANC_TOTAL": "ativo_nao_circulante",
  "PC_TOTAL":  "passivo_circulante",
  "PNC_TOTAL": "passivo_nao_circulante",
  "PL_TOTAL":  "patrimonio_liquido",
  // ── DRE — categorias separadas ──
  "DESPESAS_FIN": "despesas_financeiras", // grupo 7
  "RECEITAS_FIN": "receitas_financeiras", // DRE 50.B
  "DESPESAS_NOP": "outras_nao_operacionais", // grupo 8
  // ── Aliases textuais (fallback quando ref1 vem como nome) ──
  "RECEITA": "receita_liquida",
  "DEDUCOES_RECEITA": "receita_liquida",
  "RECEITA LIQUIDA": "receita_liquida",
  "RECEITA LÍQUIDA": "receita_liquida",
  "CMV": "cmv",
  "DESPESAS": "despesas",
  "DESPESA": "despesas",
  "DESPESAS FINANCEIRAS": "despesas_financeiras",
  "RECEITAS FINANCEIRAS": "receitas_financeiras",
  "ATIVO CIRCULANTE": "ativo_circulante",
  "ATIVO NAO CIRCULANTE": "ativo_nao_circulante",
  "ATIVO NÃO CIRCULANTE": "ativo_nao_circulante",
  "ATIVO PERMANENTE": "ativo_nao_circulante",
  "PASSIVO CIRCULANTE": "passivo_circulante",
  "PASSIVO NAO CIRCULANTE": "passivo_nao_circulante",
  "PASSIVO NÃO CIRCULANTE": "passivo_nao_circulante",
  "PATRIMONIO LIQUIDO": "patrimonio_liquido",
  "PATRIMÔNIO LÍQUIDO": "patrimonio_liquido",
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


// Padrões regex usados quando o balancete extraído não traz "Ref 1" explícito.
// ORDEM IMPORTA: resolveKey retorna no primeiro match — patterns mais específicos primeiro.
const FALLBACK_PATTERNS: Record<keyof BSDadosRow, RegExp | null> = {
  mes: null, mesKey: null,
  // DRE — mais específicos primeiro
  despesas_financeiras: /\b(?:despesas?\s+financeir|juros\s+(?:passivo|pagos?|sobre)|encargos\s+financeir|varia[cç][oõ]es\s+monet[aá]rias?\s+passiv)/i,
  receitas_financeiras: /\b(?:receitas?\s+financeir|juros\s+(?:ativo|recebidos?|aufer)|rendimentos?\s+de\s+aplica)/i,
  depreciacao: /\bdeprecia[cç][aã]o\b/i,
  amortizacao: /\bamortiza[cç][aã]o\b/i,
  cmv: /\bc(?:mv|sv|pv)\b|\bcusto\s+(?:das?\s+)?(?:mercadoria|servi[cç]o|produto|venda)/i,
  receita_liquida: /\breceita.*l[ií]quid|venda.*l[ií]quid\b/i,
  resultado: /\b(?:lucro|preju[ií]zo|resultado)\s+(?:l[ií]quid|do\s+exerc|do\s+per[ií]odo)/i,
  despesas: /\bdespesa|gasto\s+oper/i,
  // BALANÇO — Ativos: NC antes de C (mais específico) e leaves antes de totais
  estoques: /\bestoqu/i,
  disponivel: /\b(?:caixa|disponibilidade|disponivel|bancos?|aplica[cç][aã]o\s+financ|equivalente)/i,
  contas_receber: /\b(?:contas?\s+a\s+receber|duplicatas?\s+a\s+receber|clientes)\b/i,
  imobilizado: /\b(?:imobilizado|m[aá]quina|equipamento|ve[ií]culo|edifica[cç][oõ]es|terreno)\b/i,
  intangivel: /\bintang[ií]vel|marca\s+e\s+patent|software\b/i,
  investimentos: /\b(?:investiment[oa]s?\s+em|participa[cç][oõ]es?\s+societ|coligad|controlad)/i,
  ativo_nao_circulante: /\bativo\s+n[aã]o[\s-]?circulante|ativo\s+permanente/i,
  realizavel_longo_prazo: /\brealiz[aá]vel\s+a?\s*longo\s+prazo\b/i,
  ativo_circulante: /\bativo\s+circulante\b/i,
  // BALANÇO — Passivos & PL
  divida_tributaria: /\b(?:tribut|impostos?\s+a\s+(?:pagar|recolher)|icms|iss|pis|cofins|irpj|csll)/i,
  divida_trabalhista: /\b(?:sal[aá]rios?\s+a\s+pagar|f[eé]rias|13[ºo°]?|inss\s+a\s+pagar|fgts\s+a\s+pagar|encargos\s+sociais|trabalhista)/i,
  divida_financeira: /\b(?:empr[eé]stimos?|financiamentos?|deb[eê]ntures?|leasing|arrendamento)/i,
  fornecedores: /\bfornecedor/i,
  credores_rj: /\b(?:credores?\s+(?:rj|recupera[cç][aã]o)|recupera[cç][aã]o\s+judic)/i,
  passivo_nao_circulante: /\bpassivo\s+n[aã]o[\s-]?circulante|exig[ií]vel\s+a?\s*longo\s+prazo\b/i,
  passivo_circulante: /\bpassivo\s+circulante\b/i,
  patrimonio_liquido: /\b(?:patrim[oô]nio\s+l[ií]quido|capital\s+social|lucros?\s+acumulad|preju[ií]zos?\s+acumulad|reservas?\s+de\s+(?:capital|lucros?))\b/i,
  divida_total: null,
  outras_obrigacoes: null,
  outras_nao_operacionais: null,
  hasReceita: null, hasBalanco: null, errors: null, grupos: null,
};


// ─── Tipos ───────────────────────────────────────────────

/** Status do semáforo trifásico para mapeamento por grupo. */
export type GroupMappingStatus = "ok" | "atencao" | "erro" | "sem_total";

/** Trilha de classificação por grupo (2 dígitos) — usada na UI explicável. */
export interface GroupMappingEntry {
  /** Código do grupo (ex.: "11", "21", "4") */
  grupo: string;
  /** Rótulo amigável (Ativo Circulante, Passivo Circulante, etc.) */
  rotulo: string;
  /** Valor declarado pela linha totalizadora (Camada A). Undefined se ausente. */
  declarado?: number;
  /** Soma das folhas (drill-down, Camada B) coletadas para o grupo. */
  calculado: number;
  /** Divergência percentual entre declarado e calculado (0..1). */
  desvioPct: number;
  /** Camada usada para alimentar o agregado: A=GT, B=drill-down, C=regex fallback. */
  camada: "A" | "B" | "C";
  /** Status do semáforo (1%/3%/>3%). */
  status: GroupMappingStatus;
  /** Campo do BSDadosRow alimentado (ativo_circulante, passivo_circulante, etc.). */
  campo: keyof BSDadosRow;
}

export interface BSDadosRow {
  mes: string;            // "Março 2024"
  mesKey: string;         // "2024-03"
  // DRE (variação mensal após detecção YTD)
  receita_liquida: number;
  cmv: number;
  despesas: number;             // despesas operacionais (administrativas, comerciais)
  despesas_financeiras: number; // grupo 7 — separado das operacionais
  receitas_financeiras: number; // grupo 7+ / DRE 50.B — usado em EBITDA (subtrai)
  outras_nao_operacionais: number; // grupo 8 — não operacionais (signed)
  depreciacao: number;
  amortizacao: number;
  resultado: number;
  // BALANÇO — Ativos
  ativo_circulante: number;
  ativo_nao_circulante: number;
  realizavel_longo_prazo: number; // RLP (Refs P..T) — subset de ANC, usado em Liquidez Geral
  investimentos: number;          // Ref B1 — subgrupo ANC (Onda 2)
  intangivel: number;             // Ref D1 — subgrupo ANC (Onda 2, separado do imobilizado)
  estoques: number;
  disponivel: number;
  contas_receber: number;
  imobilizado: number;            // Ref C1
  // BALANÇO — Passivos & PL
  passivo_circulante: number;
  passivo_nao_circulante: number;
  patrimonio_liquido: number;
  // Componentes de dívida (sempre positivos)
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
  fornecedores: number;
  credores_rj: number;
  outras_obrigacoes: number;    // resíduo do PC (Ref JJ)
  divida_total: number;
  // Flags
  hasReceita: boolean;
  hasBalanco: boolean;
  errors: string[];
  /** Trilha de auditoria explicável — mapeamento por grupo (2 dígitos). */
  grupos?: GroupMappingEntry[];
}

/** Rótulo humano para cada código de grupo (2 dígitos). */
export const GROUP_LABELS: Record<string, { rotulo: string; campo: keyof BSDadosRow }> = {
  "11": { rotulo: "Ativo Circulante",            campo: "ativo_circulante" },
  "12": { rotulo: "Ativo Não Circulante",        campo: "ativo_nao_circulante" },
  // "13" REMOVIDO — Ativo Permanente não é universal (Giannini e muitos
  // planos não-padrão não o utilizam). Quando presente, é capturado via
  // ref1=ANC_TOTAL pelo dicionário textual.
  "21": { rotulo: "Passivo Circulante",          campo: "passivo_circulante" },
  "22": { rotulo: "Passivo Não Circulante",      campo: "passivo_nao_circulante" },
  "23": { rotulo: "Patrimônio Líquido",          campo: "patrimonio_liquido" },
  "31": { rotulo: "Receita Bruta",               campo: "receita_liquida" },
  "32": { rotulo: "Deduções da Receita",         campo: "receita_liquida" },
  "33": { rotulo: "Impostos sobre Vendas",       campo: "receita_liquida" },
  "4":  { rotulo: "CMV / Custo de Serviços",     campo: "cmv" },
  "5":  { rotulo: "Custo Industrial",            campo: "cmv" },
  "6":  { rotulo: "Despesas Operacionais",       campo: "despesas" },
  "7":  { rotulo: "Despesas/Receitas Financeiras", campo: "despesas_financeiras" },
  "8":  { rotulo: "Não Operacionais",            campo: "outras_nao_operacionais" },
};

/** Classifica desvio em status trifásico (1%/3%/>3%). */
export function classifyDeviation(desvio: number, declaradoAusente: boolean): GroupMappingStatus {
  if (declaradoAusente) return "sem_total";
  const abs = Math.abs(desvio);
  if (abs <= 0.01) return "ok";
  if (abs <= 0.03) return "atencao";
  return "erro";
}

export interface BalanceteEntry {
  /** Identificador do arquivo / balancete de origem */
  fileName: string;
  /** Mês de referência atribuído pelo usuário (formato YYYY-MM). Pode ser null se múltiplos meses já estão no arquivo. */
  mesReferencia: string | null;
  /** Quando o usuário escolheu "auto-detect", lista de meses YYYY-MM resolvidos pelo parser. */
  mesesDetectados?: string[];
  /** Usuário marcou no upload que este balancete contém saldos YTD (acumulado desde Janeiro). */
  isYtd?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────
const toUpperNoAccent = (s: string) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

// Re-exporta para manter compatibilidade dos imports existentes.
export const mesKeyToLabel = _mesKeyToLabel;
export const periodToMesKey = _periodToMesKey;

function emptyRow(mesKey: string): BSDadosRow {
  return {
    mes: mesKeyToLabel(mesKey), mesKey,
    receita_liquida: 0, cmv: 0, despesas: 0, despesas_financeiras: 0,
    receitas_financeiras: 0, outras_nao_operacionais: 0,
    depreciacao: 0, amortizacao: 0, resultado: 0,
    ativo_circulante: 0, ativo_nao_circulante: 0, realizavel_longo_prazo: 0,
    investimentos: 0, intangivel: 0,
    estoques: 0, disponivel: 0, contas_receber: 0, imobilizado: 0,
    passivo_circulante: 0, passivo_nao_circulante: 0, patrimonio_liquido: 0,
    divida_tributaria: 0, divida_trabalhista: 0, divida_financeira: 0,
    fornecedores: 0, credores_rj: 0, outras_obrigacoes: 0, divida_total: 0,
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

// Conjuntos de Refs Capital que agregam totalizadores (template BEX).
// Usados como acumuladores quando o balancete não traz a linha totalizadora explícita.
const AC_REFS = new Set(["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"]);
const ANC_REFS = new Set([
  "P","Q","R","S","T","U","V","W","X","Y","Z",
  "A1","B1","C1","D1","E1","F1","G1","H1","I1","J1",
]);
const PC_REFS = new Set(["AA","BB","CC","DD","EE","FF","GG","HH","II","JJ","KK","LL","MM","NN","OO","II1"]);
const PNC_REFS = new Set([
  "PP","QQ","RR","SS","TT","UU","VV","WW","XX","YY","ZZ",
  "AA1","BB1","CC1","DD1","EE1","FF1",
]);
const PL_REFS = new Set(["GG1","HH1"]);
// Refs para readouts ortogonais (não-exclusivos)
const CONTAS_RECEBER_REFS = new Set(["C"]);
const IMOBILIZADO_REFS = new Set(["C1","D1"]);
// RLP = subset inicial do ANC (antes de Investimentos/Imobilizado/Intangível).
// Refs P..Z conforme plano BEX — usado em Liquidez Geral conforme planilha Kanitz Giannini.
const RLP_REFS = new Set(["P","Q","R","S","T","U","V","W","X","Y","Z"]);

// ─── GRUPO-FIRST ────────────────────────────────────────
// Códigos de TOTALIZADORES DE GRUPO no plano contábil brasileiro padrão.
// Quando essas linhas existem no balancete, são AUTORITATIVAS para o
// campo principal (AC/PC/ANC/PNC/PL e DRE). Folhas descendentes só
// alimentam sub-componentes (disponivel, estoques, fornecedores, etc.).
// Nota: "13" (Ativo Permanente) intencionalmente fora — plano não-padrão
// pode emitir essa linha como sintética agregadora dentro de "12", o que
// gera dupla contagem. Quando presente como grupo de fato, é capturado
// via ref1=ANC_TOTAL pelo dicionário textual.
export const GROUP_TOTAL_CODES = new Set([
  "11","12",         // AC, ANC
  "21","22","23",    // PC, PNC, PL
  "31","32","33",    // Receita bruta, Devoluções, Impostos sobre vendas
  "4","5","6","7","8", // CMV, Custo Industrial, Despesas Op, Desp.Fin, Não Op
]);

/** Refs1 textuais que indicam a linha é um totalizador de grupo declarado. */
const TOTAL_REFS = new Set(["AC_TOTAL","ANC_TOTAL","PC_TOTAL","PNC_TOTAL","PL_TOTAL"]);

// Chaves que representam AGREGADOS PRINCIPAIS — folhas só devem alimentar
// estes campos quando o totalizador de grupo NÃO está presente para o mês.
const MAIN_AGG_KEYS = new Set<keyof BSDadosRow>([
  "ativo_circulante","ativo_nao_circulante",
  "passivo_circulante","passivo_nao_circulante",
  "patrimonio_liquido",
  "receita_liquida","cmv","despesas","despesas_financeiras","receitas_financeiras","outras_nao_operacionais",
]);

// Buckets internos por mês para somar componentes (acumulador derivado).
type ComponentBuckets = {
  ac: number; pc: number;
  anc: number; pnc: number; pl: number;
  sawACTotal: boolean; sawPCTotal: boolean;
  sawANCTotal: boolean; sawPNCTotal: boolean; sawPLTotal: boolean;
  /** Conjunto de códigos GT presentes neste período (ex.: {"11","21","4","6","7"}) */
  groupTotalsPresent: Set<string>;
  /** Diagnóstico — valor declarado pelo GT por campo principal */
  declared: Partial<Record<keyof BSDadosRow, number>>;
  /** Diagnóstico — valor declarado pelo GT por código de grupo (2 dígitos) */
  declaredByGroup: Record<string, number>;
  /** Diagnóstico — soma das folhas (drill-down) por código de grupo */
  calculatedByGroup: Record<string, number>;
  /** Camada usada para alimentar cada grupo (A=GT, B=drill-down, C=regex) */
  layerByGroup: Record<string, "A" | "B" | "C">;
};

/** Resolve refs DRE em formato dot-decimal (10.A, 20.B, 30.C, 40.J, 50.B) → ref canônica. */
function resolveDotDRERef(ref: string): string | null {
  const m = /^(\d{1,2})\.([A-Z]\d?)$/i.exec(ref.trim());
  if (!m) return null;
  const [_, prefix, suffix] = m;
  // Casos especiais (sub-itens financeiros dentro de grupos operacionais)
  if (prefix === "40" && suffix.toUpperCase() === "J") return "DESPESAS_FIN";
  if (prefix === "50" && suffix.toUpperCase() === "B") return "RECEITAS_FIN";
  // Mapeamento por prefixo
  switch (prefix) {
    case "10": return "RECEITA";
    case "20": return "DEDUCOES_RECEITA";
    case "30": return "CMV";
    case "40": return "DESPESAS";
    case "50": return "RECEITA"; // Outras receitas → soma em receita líquida
    default: return null;
  }
}

/** Resolve a chave canônica de uma linha pelo Ref 1; cai para regex se ausente. */
function resolveKey(row: RowLike): keyof BSDadosRow | null {
  let ref1 = row.ref1 ?? inferRefByCode(row.conta || "", row.descricao || "");
  // FIX (A): sentinel para raízes DRE bare ("3".."8") — descarta a linha
  // antes do fallback por descrição (impede dupla contagem na receita_liquida).
  if (ref1 === "__IGNORE__") return null;
  if (ref1) {
    // Normaliza refs DRE dot-decimal (formato planilha XPT: "10.A", "40.J", "50.B")
    const dotResolved = resolveDotDRERef(String(ref1));
    if (dotResolved) ref1 = dotResolved;
    const k = REF1_MAP[toUpperNoAccent(ref1)];
    if (k) return k;
  }
  const text = `${row.descricao || ""} ${row.conta || ""}`;
  for (const [key, pattern] of Object.entries(FALLBACK_PATTERNS)) {
    if (!pattern) continue;
    if (pattern.test(text)) return key as keyof BSDadosRow;
  }
  return null;
}

/**
 * applyValue — Grupo-First.
 *
 * @param isGroupTotal  conta é EXATAMENTE um código de totalizador de grupo (11/21/4/…)
 * @param parentGTPresent  existe totalizador de grupo PAI desta folha no mesmo período
 *
 * Regra-chave: quando há GT-pai presente E a chave é um agregado principal
 * (AC/PC/CMV/Receita/...), NÃO escrevemos no campo principal — apenas
 * atualizamos buckets/sub-componentes. Elimina dupla contagem entre
 * totalizador e folhas (raiz do bug de Liquidez Corrente em planos como Giannini).
 */
function applyValue(
  target: BSDadosRow,
  key: keyof BSDadosRow,
  value: number,
  ref1: string | null | undefined,
  buckets: ComponentBuckets,
  isGroupTotal: boolean = false,
  parentGTPresent: boolean = false,
) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;

  const isMainAgg = MAIN_AGG_KEYS.has(key);
  const skipMain = isMainAgg && parentGTPresent && !isGroupTotal;

  if (!skipMain) {
    switch (key) {
      case "receita_liquida": {
        const refU = toUpperNoAccent(ref1 || "");
        const isDeducao = refU === "DEDUCOES_RECEITA";
        (target as any)[key] = (target[key] as number) + (isDeducao ? -Math.abs(v) : Math.abs(v));
        break;
      }
      case "cmv":
      case "despesas":
      case "despesas_financeiras":
      case "depreciacao":
      case "amortizacao":
        (target as any)[key] = (target[key] as number) - Math.abs(v); break;
      case "receitas_financeiras":
        (target as any)[key] = (target[key] as number) + Math.abs(v); break;
      case "resultado":
        (target as any)[key] = (target[key] as number) + v; break;
      case "patrimonio_liquido":
        target.patrimonio_liquido += v;
        if (isGroupTotal) buckets.sawPLTotal = true; break;
      case "ativo_circulante":
        target.ativo_circulante += Math.abs(v);
        if (isGroupTotal) buckets.sawACTotal = true; break;
      case "ativo_nao_circulante":
        target.ativo_nao_circulante += Math.abs(v);
        if (isGroupTotal) buckets.sawANCTotal = true; break;
      case "passivo_circulante":
        target.passivo_circulante += Math.abs(v);
        if (isGroupTotal) buckets.sawPCTotal = true; break;
      case "passivo_nao_circulante":
        target.passivo_nao_circulante += Math.abs(v);
        if (isGroupTotal) buckets.sawPNCTotal = true; break;
      case "estoques":
      case "disponivel":
      case "contas_receber":
      case "imobilizado":
      case "divida_tributaria":
      case "divida_trabalhista":
      case "divida_financeira":
      case "fornecedores":
      case "credores_rj":
      case "outras_obrigacoes":
        (target as any)[key] = (target[key] as number) + Math.abs(v); break;
      case "outras_nao_operacionais":
        target.outras_nao_operacionais += v; break;
      default: break;
    }
  }

  // Acumuladores por Ref Capital + readouts ortogonais — SEMPRE atualizados
  const refUp = ref1 ? toUpperNoAccent(ref1) : "";
  if (refUp) {
    if (AC_REFS.has(refUp)) buckets.ac += Math.abs(v);
    else if (ANC_REFS.has(refUp)) buckets.anc += Math.abs(v);
    else if (PC_REFS.has(refUp)) buckets.pc += Math.abs(v);
    else if (PNC_REFS.has(refUp)) buckets.pnc += Math.abs(v);
    else if (PL_REFS.has(refUp)) buckets.pl += v;
    if (CONTAS_RECEBER_REFS.has(refUp) && key !== "contas_receber") target.contas_receber += Math.abs(v);
    if (IMOBILIZADO_REFS.has(refUp) && key !== "imobilizado") target.imobilizado += Math.abs(v);
    if (RLP_REFS.has(refUp)) target.realizavel_longo_prazo += Math.abs(v);
  }

  // Diagnóstico — valor declarado pelo GT por campo principal
  if (isGroupTotal && isMainAgg) {
    const cur = buckets.declared[key] ?? 0;
    buckets.declared[key] = cur + (key === "patrimonio_liquido" || key === "outras_nao_operacionais" || key === "resultado" ? v : Math.abs(v));
  }
}


// Tolerância padrão para validação Ativo = Passivo + PL (0.5%).
export const BALANCE_TOLERANCE = 0.005;

function finalize(row: BSDadosRow, buckets?: ComponentBuckets): BSDadosRow {
  // Componentes de dívida que TAMBÉM são PNC (QQ, RR, etc.) já foram contados em divida_*.
  // Para evitar dupla contagem em PNC, somamos só o "resto" do bucket de PNC.
  // Mas como o roteamento primário deles vai pra divida_* (não pra PNC), o bucket.pnc
  // só acumula os que não são componentes específicos de dívida.
  if (buckets) {
    if (!buckets.sawACTotal && buckets.ac > 0) row.ativo_circulante = buckets.ac;
    if (!buckets.sawANCTotal && buckets.anc > 0) row.ativo_nao_circulante = buckets.anc;
    if (!buckets.sawPCTotal && buckets.pc > 0) row.passivo_circulante = buckets.pc;
    if (!buckets.sawPNCTotal && buckets.pnc > 0) row.passivo_nao_circulante = buckets.pnc;
    if (!buckets.sawPLTotal && buckets.pl !== 0) row.patrimonio_liquido = buckets.pl;
  }

  // Se PC declarado > soma de componentes classificados, atribui o resíduo a outras_obrigacoes
  const componentesPCConhecidos =
    row.divida_tributaria + row.divida_trabalhista + row.divida_financeira +
    row.fornecedores + row.credores_rj + row.outras_obrigacoes;
  if (row.passivo_circulante > componentesPCConhecidos) {
    row.outras_obrigacoes += row.passivo_circulante - componentesPCConhecidos;
  }
  row.divida_total =
    row.divida_tributaria + row.divida_trabalhista + row.divida_financeira +
    row.fornecedores + row.credores_rj + row.outras_obrigacoes;
  // Resultado derivado da DRE (determinístico) — cmv/despesas/despesas_financeiras já vêm negativos.
  // Evita dupla contagem com contas de PL no balanço (Capital, Lucros Acumulados).
  row.resultado = row.receita_liquida + row.cmv + row.despesas + row.despesas_financeiras;
  row.hasReceita = row.receita_liquida > 0;
  row.hasBalanco = row.ativo_circulante > 0 || row.passivo_circulante > 0 || row.divida_total > 0;
  // Validações
  if (!row.hasReceita) row.errors.push("Receita líquida ausente ou zerada");
  if (row.cmv > 0) row.errors.push("CMV positivo (deveria ser negativo)");
  if (buckets) {
    if (buckets.sawACTotal && buckets.ac > 0) {
      const diff = Math.abs(row.ativo_circulante - buckets.ac);
      const ref = Math.max(row.ativo_circulante, buckets.ac);
      if (ref > 0 && diff / ref > BALANCE_TOLERANCE) {
        row.errors.push(`Ativo Circulante divergente dos componentes (Δ ${(diff/ref*100).toFixed(2)}%)`);
      }
    }
    if (buckets.sawPCTotal && buckets.pc > 0) {
      const diff = Math.abs(row.passivo_circulante - buckets.pc);
      const ref = Math.max(row.passivo_circulante, buckets.pc);
      if (ref > 0 && diff / ref > BALANCE_TOLERANCE) {
        row.errors.push(`Passivo Circulante divergente dos componentes (Δ ${(diff/ref*100).toFixed(2)}%)`);
      }
    }
  }

  // ── Trilha de auditoria explicável (Mapeamento por Grupo) ──
  if (buckets) {
    const grupos: GroupMappingEntry[] = [];
    const allGroupCodes = new Set<string>([
      ...Object.keys(buckets.declaredByGroup),
      ...Object.keys(buckets.calculatedByGroup),
    ]);
    for (const grupo of Array.from(allGroupCodes).sort()) {
      const meta = GROUP_LABELS[grupo];
      if (!meta) continue;
      const declarado = buckets.declaredByGroup[grupo];
      const calculado = buckets.calculatedByGroup[grupo] || 0;
      const camada = buckets.layerByGroup[grupo] || (declarado != null ? "A" : "C");
      const declaradoAusente = declarado == null;
      const base = Math.max(Math.abs(declarado ?? 0), Math.abs(calculado), 1);
      const desvioPct = declaradoAusente ? 0 : (declarado! - calculado) / base;
      grupos.push({
        grupo,
        rotulo: meta.rotulo,
        declarado,
        calculado,
        desvioPct,
        camada,
        status: classifyDeviation(desvioPct, declaradoAusente),
        campo: meta.campo,
      });
    }
    row.grupos = grupos;
    // Promove erros >3% para a lista de erros
    for (const g of grupos) {
      if (g.status === "erro") {
        row.errors.push(`Grupo ${g.grupo} (${g.rotulo}) — divergência ${(g.desvioPct * 100).toFixed(1)}% entre subtotal declarado e soma das folhas`);
      }
    }
  }

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

  // Meses atribuídos pelo usuário (autoridade quando presentes).
  const userMesKeys = entries
    .map(e => e.mesReferencia)
    .filter((k): k is string => !!k);

  // Estratégia de meses:
  //  - Se usuário atribuiu N meses E o pipeline detectou ≤ 1 período, usa entries
  //    (cenário: 1 balancete sem multi-mês embutido, ou 2-3 balancetes 1-mês cada).
  //  - Caso contrário, usa periodsRaw (pipeline detectou multi-mês no arquivo).
  const useUser = userMesKeys.length > 0 && (periodsRaw.length <= 1 || periodsRaw.every(p => p.length < 7));
  const usableMesKeys: string[] = useUser
    ? userMesKeys
    : (periodsRaw.length ? periodsRaw.map(periodToMesKey).filter(k => k && k.includes("-")) : userMesKeys);

  // Detecta duplicatas determinísticas (helper compartilhado).
  // Regra de mescla padrão p/ duplicidade de balancetes do MESMO mês: SOMA
  // (assume balancetes complementares — ex.: matriz + filial). Quando o
  // duplicado é o MESMO arquivo recarregado, o hash dedupe na pipeline já
  // bloqueia antes de chegar aqui.
  const { duplicates: dupList } = detectDuplicates(usableMesKeys);
  const dupSet = new Set(dupList.map(d => d.mesKey));

  const rowsByMes = new Map<string, BSDadosRow>();
  const bucketsByMes = new Map<string, ComponentBuckets>();
  // Ordem determinística (cronológica) — evita ordens de Set dependentes de inserção.
  const orderedKeys = Array.from(new Set(usableMesKeys)).sort();
  orderedKeys.forEach(k => {
    rowsByMes.set(k, emptyRow(k));
    bucketsByMes.set(k, {
      ac: 0, pc: 0, anc: 0, pnc: 0, pl: 0,
      sawACTotal: false, sawPCTotal: false, sawANCTotal: false, sawPNCTotal: false, sawPLTotal: false,
      groupTotalsPresent: new Set<string>(),
      declared: {},
      declaredByGroup: {},
      calculatedByGroup: {},
      layerByGroup: {},
    });
    if (dupSet.has(k)) {
      const r = rowsByMes.get(k)!;
      const count = dupList.find(d => d.mesKey === k)?.count ?? 2;
      const msg = `Mês duplicado entre balancetes (×${count}) — valores somados`;
      if (!r.errors.includes(msg)) r.errors.push(msg);
    }
  });

  // Itera DRE + Balanço, mapeando por período → mesKey.
  const allRows = [
    ...((parsed.dre ?? []) as any[]),
    ...((parsed.balanco ?? []) as any[]),
  ];

  // ── Prune de contas sintéticas (pais) para evitar dupla contagem ─────
  // GRUPO-FIRST: PRESERVAMOS os totalizadores de grupo (11/12/13/21/22/23/31/32/33/4/5/6/7/8)
  // mesmo que tenham folhas — eles são autoritativos.
  const normCode = (c?: string) => String(c || "").replace(/\s+/g, "").replace(/\.+$/g, "");
  const allCodes = new Set(allRows.map(r => normCode(r.conta)).filter(Boolean));
  const parentCodes = new Set<string>();
  for (const c of allCodes) {
    if (GROUP_TOTAL_CODES.has(c)) continue; // GT nunca entra em parentCodes
    for (const other of allCodes) {
      if (other.length > c.length && other.startsWith(c)) {
        const next = other.charAt(c.length);
        if (/[0-9.]/.test(next) || c.endsWith(".")) { parentCodes.add(c); break; }
      }
    }
  }
  const leafRows = allRows.filter(r => {
    const c = normCode(r.conta);
    if (!c) return true;
    if (GROUP_TOTAL_CODES.has(c)) return true; // sempre preserva GT
    return !parentCodes.has(c);
  });

  // ── 1ª passada: detecta GTs presentes por mesKey ──
  // GT = conta cujo código está em GROUP_TOTAL_CODES OU cujo ref1 termina em "_TOTAL"
  // (ref1 textual vem do dicionário canônico em planos não-padrão).
  const gtPresentByMes = new Map<string, Set<string>>();
  for (const row of leafRows) {
    const c = normCode(row.conta);
    const r1 = String(row.ref1 ?? row.refCapital ?? "").toUpperCase();
    const isGT = GROUP_TOTAL_CODES.has(c) || TOTAL_REFS.has(r1);
    if (!isGT) continue;
    const valuesObj = row.values || {};
    for (const period of Object.keys(valuesObj)) {
      const v = Number(valuesObj[period]);
      if (!Number.isFinite(v) || v === 0) continue;
      let mesKey: string;
      if (useUser && Object.keys(valuesObj).length <= 1 && userMesKeys.length > 0) {
        mesKey = userMesKeys[0];
      } else {
        mesKey = periodToMesKey(period);
      }
      if (!gtPresentByMes.has(mesKey)) gtPresentByMes.set(mesKey, new Set());
      // Indexa pelo código quando disponível; senão pelo ref1 (chave estável).
      const gtKey = c || r1;
      gtPresentByMes.get(mesKey)!.add(gtKey);
      const buckets = bucketsByMes.get(mesKey);
      if (buckets) buckets.groupTotalsPresent.add(gtKey);
    }
  }

  const findParentGT = (conta: string, mesKey: string): string | null => {
    const gts = gtPresentByMes.get(mesKey);
    if (!gts) return null;
    // Prefere o GT mais longo (mais específico) — ex.: "21" antes de "2"
    let best: string | null = null;
    for (const gt of gts) {
      if (conta !== gt && conta.startsWith(gt)) {
        if (!best || gt.length > best.length) best = gt;
      }
    }
    return best;
  };

  const hasParentGT = (conta: string, mesKey: string): boolean =>
    findParentGT(conta, mesKey) !== null;

  // Mapeamento ref1 sintético para Group Totals que vieram sem ref1 explícito
  // (garante que "32"/"33" → DEDUCOES_RECEITA, "11" → AC_TOTAL etc., preservando
  // sinais corretos em applyValue — fix do bug Receita Líquida inflada).
  const GT_REF1: Record<string, string> = {
    "11":"AC_TOTAL","12":"ANC_TOTAL","21":"PC_TOTAL","22":"PNC_TOTAL","23":"PL_TOTAL",
    "32":"DEDUCOES_RECEITA","33":"DEDUCOES_RECEITA",
  };

  // ── 2ª passada: roteia valores ──
  for (const row of leafRows) {
    const contaPre = normCode(row.conta);
    const inferredRef1 = GROUP_TOTAL_CODES.has(contaPre) ? (GT_REF1[contaPre] ?? null) : null;
    const ref1 = (row.ref1 as string | undefined) ?? (row.refCapital as string | undefined) ?? inferRefByCode(row.conta, row.descricao) ?? inferredRef1 ?? null;
    const conta = contaPre;
    const ref1Up = String(ref1 ?? "").toUpperCase();
    const isGroupTotal = GROUP_TOTAL_CODES.has(conta) || TOTAL_REFS.has(ref1Up);
    const valuesObj = row.values || {};
    const periodKeys = Object.keys(valuesObj);

    for (const period of periodKeys) {
      const value = valuesObj[period];
      const key = resolveKey({
        descricao: row.descricao,
        conta: row.conta,
        ref1,
        saldo: Number(value) || 0,
      });
      if (!key) continue;

      let targetKeys: string[];
      if (useUser && periodKeys.length <= 1 && userMesKeys.length > 0) {
        targetKeys = [userMesKeys[0]];
      } else {
        targetKeys = [periodToMesKey(period)];
      }

      for (const mesKey of targetKeys) {
        const target = rowsByMes.get(mesKey);
        const buckets = bucketsByMes.get(mesKey);
        if (!target || !buckets) continue;
        const parentGT = !isGroupTotal && hasParentGT(conta, mesKey);
        applyValue(target, key, Number(value) || 0, ref1, buckets, isGroupTotal, parentGT);

        // ── Trilha por grupo (2 dígitos) — alimenta painel "Mapeamento por Grupo" ──
        const v = Math.abs(Number(value) || 0);
        if (isGroupTotal) {
          buckets.declaredByGroup[conta] = (buckets.declaredByGroup[conta] || 0) + v;
          buckets.layerByGroup[conta] = "A";
        } else {
          const parent = findParentGT(conta, mesKey);
          if (parent) {
            buckets.calculatedByGroup[parent] = (buckets.calculatedByGroup[parent] || 0) + v;
            if (!buckets.layerByGroup[parent]) buckets.layerByGroup[parent] = "A"; // GT já estará "A"
          } else {
            // Folha sem GT pai — Camada C (fallback regex/ref1)
            // Inferimos o grupo pelo 1-2 dígito do código quando possível
            const inferred = GROUP_TOTAL_CODES.has(conta.slice(0, 2)) ? conta.slice(0, 2)
                            : GROUP_TOTAL_CODES.has(conta.slice(0, 1)) ? conta.slice(0, 1) : null;
            if (inferred) {
              buckets.calculatedByGroup[inferred] = (buckets.calculatedByGroup[inferred] || 0) + v;
              if (!buckets.layerByGroup[inferred]) buckets.layerByGroup[inferred] = "C";
            }
          }
        }
      }
    }
  }

  // (legado: variável allRows mantida para o bloco abaixo)
  void leafRows;


  // Marca meses sem dados reais quando o parser só extraiu 1 período
  if (allRows.length > 0) {
    const allPeriodKeys = new Set<string>();
    for (const r of allRows) for (const k of Object.keys(r.values || {})) allPeriodKeys.add(k);
    if (allPeriodKeys.size <= 1 && userMesKeys.length > 1) {
      const applied = userMesKeys[0];
      for (const mk of userMesKeys.slice(1)) {
        const t = rowsByMes.get(mk);
        if (!t) continue;
        const msg = `Sem dados extraídos para este mês — o balancete só forneceu valores para ${applied}. Recarregue o balancete correspondente para evitar inferência.`;
        if (!t.errors.includes(msg)) t.errors.push(msg);
      }
    }
  }

  // Derivação de totais AC/PC/ANC/PNC/PL agora vive em finalize() — bloco anterior removido.

  const sortedRows = Array.from(rowsByMes.values())
    .map(r => finalize(r, bucketsByMes.get(r.mesKey)))
    .sort((a, b) => a.mesKey.localeCompare(b.mesKey));

  // ── DRE POR VARIAÇÃO (regra padrão para balancetes brasileiros) ──
  // Contas dos grupos 3-8 são reportadas como saldo YTD acumulado dentro
  // do ano fiscal. Para obter o valor MENSAL aplicamos sempre
  //   valorMes(N) = saldo(N) − saldo(N-1)   (quando mesmo ano fiscal)
  // Esta é regra contábil determinística (não mais heurística baseada em
  // monotonicidade): qualquer balancete com ≥2 meses do mesmo ano sofre
  // desacumulação automática. Casos raros (DRE já mensalizada) são
  // protegidos pelo Math.max(0, …) que evita receitas negativas espúrias.
  const isAccumulated = sortedRows.length > 1;

  if (isAccumulated) {
    for (let i = sortedRows.length - 1; i > 0; i--) {
      const current = sortedRows[i];
      const previous = sortedRows[i - 1];
      const currentYear = current.mesKey.split("-")[0];
      const previousYear = previous.mesKey.split("-")[0];
      if (currentYear !== previousYear) continue;
      // Sem clamp em zero — variação negativa pode ser legítima (ex.: estorno),
      // preservar permite que Margem Bruta/ROA reflitam a realidade do mês.
      current.receita_liquida = current.receita_liquida - previous.receita_liquida;
      current.cmv = -(Math.abs(current.cmv) - Math.abs(previous.cmv));
      current.despesas = -(Math.abs(current.despesas) - Math.abs(previous.despesas));
      current.despesas_financeiras = -(Math.abs(current.despesas_financeiras) - Math.abs(previous.despesas_financeiras));
      current.depreciacao = -(Math.abs(current.depreciacao) - Math.abs(previous.depreciacao));
      current.amortizacao = -(Math.abs(current.amortizacao) - Math.abs(previous.amortizacao));
      // Resultado re-derivado pós-ajuste
      current.resultado = current.receita_liquida + current.cmv + current.despesas + current.despesas_financeiras + current.receitas_financeiras + current.outras_nao_operacionais;
    }
  }

  return sortedRows;
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

/** Memória de cálculo explicável para cada indicador (numerador, denominador, fórmula, origem). */
export interface IndicatorMemory {
  indicador: string;
  formula: string;
  numerador: { rotulo: string; valor: number; origem: string };
  denominador: { rotulo: string; valor: number; origem: string };
  resultado: number | null;
  classificacao?: string;
}

const origemGrupo = (r: BSDadosRow, grupoCodigo: string, fallback: string): string => {
  const g = r.grupos?.find(x => x.grupo === grupoCodigo);
  if (!g) return fallback;
  const camadaLabel = g.camada === "A" ? "subtotal declarado" : g.camada === "B" ? "drill-down" : "fallback regex";
  return `linha "${g.grupo} ${g.rotulo}" (Camada ${g.camada} — ${camadaLabel})`;
};

const classifyLC = (v: number | null): string =>
  v == null ? "—" : v >= 1.5 ? "Saudável (≥ 1,5)" : v >= 1.0 ? "Adequada (1,0–1,5)" : "Insuficiente (< 1,0)";

export function buildIndicatorMemory(r: BSDadosRow): IndicatorMemory[] {
  const lc = safeDiv(r.ativo_circulante, r.passivo_circulante);
  const ls = safeDiv(r.ativo_circulante - r.estoques, r.passivo_circulante);
  const li = safeDiv(r.disponivel, r.passivo_circulante);
  return [
    {
      indicador: "Liquidez Corrente",
      formula: "AC / PC",
      numerador: { rotulo: "Ativo Circulante", valor: r.ativo_circulante, origem: origemGrupo(r, "11", "AC (agregado)") },
      denominador: { rotulo: "Passivo Circulante", valor: r.passivo_circulante, origem: origemGrupo(r, "21", "PC (agregado, abs aplicado)") },
      resultado: lc,
      classificacao: classifyLC(lc),
    },
    {
      indicador: "Liquidez Seca",
      formula: "(AC − Estoques) / PC",
      numerador: { rotulo: "AC − Estoques", valor: r.ativo_circulante - r.estoques, origem: `${origemGrupo(r, "11", "AC")} − Estoques (R$ ${r.estoques.toLocaleString("pt-BR")})` },
      denominador: { rotulo: "Passivo Circulante", valor: r.passivo_circulante, origem: origemGrupo(r, "21", "PC") },
      resultado: ls,
    },
    {
      indicador: "Liquidez Imediata",
      formula: "Disponível / PC",
      numerador: { rotulo: "Disponível", valor: r.disponivel, origem: "Drill-down 111 (Caixa/Bancos/Aplicações)" },
      denominador: { rotulo: "Passivo Circulante", valor: r.passivo_circulante, origem: origemGrupo(r, "21", "PC") },
      resultado: li,
    },
  ];
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
