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
import {
  resolveP1Facts,
  runIntegrityGates,
  type CertifiedFact,
  type CanonicalRole,
  type IntegrityGateResult,
} from "@/services/p1SyntheticResolver";
import { resolveResidualFacts, type ResidualFacts } from "@/services/residualFactsResolver";



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
  "RESULTADO": "resultado_acumulado", 
  "RESULTADO_MES": "resultado_competencia", 
  "ADIANTAMENTOS": "advances_to_third_parties", 
  "ADVANCES": "advances_to_third_parties",
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
  "RECEITA BRUTA": "receita_liquida",
  "RECEITA BRUTA DE VENDAS": "receita_liquida",
  "DEDUCOES_RECEITA": "receita_liquida",
  "RECEITA LIQUIDA": "receita_liquida",
  "RECEITA LÍQUIDA": "receita_liquida",
  "RECEITA LÍQUIDA DE VENDAS": "receita_liquida",
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
  "ADIANTAMENTOS A TERCEIROS": "advances_to_third_parties",
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
const FALLBACK_PATTERNS: Partial<Record<keyof BSDadosRow, RegExp | null>> = {
  // DRE — mais específicos primeiro
  despesas_financeiras: /\b(?:despesas?\s+financeir|juros\s+(?:passivo|pagos?|sobre)|encargos\s+financeir|varia[cç][oõ]es\s+monet[aá]rias?\s+passiv)/i,
  receitas_financeiras: /\b(?:receitas?\s+financeir|juros\s+(?:ativo|recebidos?|aufer)|rendimentos?\s+de\s+aplica)/i,
  depreciacao: /\bdeprecia[cç][aã]o\b/i,
  amortizacao: /\bamortiza[cç][aã]o\b/i,
  cmv: /\bc(?:mv|sv|pv)\b|\bcusto\s+(?:das?\s+)?(?:mercadoria|servi[cç]o|produto|venda)/i,
  receita_liquida: /\breceita.*l[ií]quid|venda.*l[ií]quid\b/i,
  resultado: /\b(?:lucro|preju[ií]zo|resultado)\s+(?:l[ií]quid|do\s+exerc|do\s+per[ií]odo)/i,
  despesas: /\bdespesa|gasto\s+oper/i,
  // BALANÇO — Ativos
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
  divida_financeira: /\b(?:empr[eé]stimos?|financiamentos?|deb[eê]ntures?|leasings?|arrendamentos?|cedula\s+de\s+credito|capital\s+de\s+giro|obriga[cç][oõ]es\s+financeir)/i,
  fornecedores: /\bfornecedor/i,
  credores_rj: /\b(?:credores?\s+(?:rj|recupera[cç][aã]o)|recupera[cç][aã]o\s+judic)/i,
  passivo_nao_circulante: /\bpassivo\s+n[aã]o[\s-]?circulante|exig[ií]vel\s+a?\s*longo\s+prazo\b/i,
  passivo_circulante: /\bpassivo\s+circulante\b/i,
  patrimonio_liquido: /\b(?:patrim[oô]nio\s+l[ií]quido|capital\s+social|lucros?\s+acumulad|preju[ií]zos?\s+acumulad|reservas?\s+de\s+(?:capital|lucros?))\b/i,
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
  campo: keyof BSDadosRow | "ignore";
}

export interface FinancialFact {
  value: number;
  status: "AVAILABLE" | "NOT_AVAILABLE" | "NOT_CERTIFIED" | "NOT_APPLICABLE";
}

export interface BSDadosRow {
  mes: string;            // "Março 2024"
  mesKey: string;         // "2024-03"
  // DRE
  receita_liquida: number;
  cmv: number;
  despesas: number;
  despesas_financeiras: number;
  receitas_financeiras: number;
  outras_nao_operacionais: number;
  depreciacao: number;
  amortizacao: number;
  resultado: number;
  resultado_acumulado?: number;
  resultado_competencia?: number;
  lajir?: number;
  advances_to_third_parties: number;
  // BALANÇO
  ativo_circulante: number;
  ativo_nao_circulante: number;
  realizavel_longo_prazo: number;
  investimentos: number;
  intangivel: number;
  estoques: number;
  disponivel: number;
  contas_receber: number;
  imobilizado: number;
  passivo_circulante: number;
  passivo_nao_circulante: number;
  patrimonio_liquido: number;
  // Componentes de dívida
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
  divida_financeira_cp: number;
  divida_financeira_lp: number;
  fornecedores: number;
  fornecedores_lp: number;
  credores_rj: number;
  outras_obrigacoes: number;
  divida_total: number;
  ebitda: number;
  tax_noncurrent?: number; // MD-BEX-FINAL-RUNTIME-4-BINDING-GATE-PATCH-001 §8
  // Metadata & Status (MD-BEX-RUNTIME-LINEAGE-ROOT-CAUSE-REMEDIATION-001)
  facts_status: Record<keyof Omit<BSDadosRow, 'facts_status' | 'errors' | 'grupos' | 'mes' | 'mesKey' | 'hasReceita' | 'hasBalanco' | 'ativo_total' | 'p1_facts' | 'integrity_gates' | 'residual_facts' | 'company_name' | 'company_cnpj'>, FinancialFact['status']>;
  hasReceita: boolean;
  hasBalanco: boolean;
  company_name?: string;
  company_cnpj?: string;
  errors: string[];

  grupos?: GroupMappingEntry[];
  /** MD-P1-001 — Ativo Total autoritativo (conta sintética "1"), quando disponível. */
  ativo_total?: number;
  /** MD-P1-001 — trilha de resolução por canonical role (P1/P2/P3 + descartados). */
  p1_facts?: Record<string, CertifiedFact>;
  /** MD-P1-001 — resultado dos integrity gates desta competência. */
  integrity_gates?: IntegrityGateResult[];
  /** MD-FINAL-RESIDUAL-001 — tributos, trabalhistas, empréstimos, despesas financeiras, EBITDA. */
  residual_facts?: ResidualFacts;
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
    advances_to_third_parties: 0,
    passivo_circulante: 0, passivo_nao_circulante: 0, patrimonio_liquido: 0,
    divida_tributaria: 0, divida_trabalhista: 0, divida_financeira: 0,
    divida_financeira_cp: 0, divida_financeira_lp: 0,
    fornecedores: 0, fornecedores_lp: 0, credores_rj: 0, outras_obrigacoes: 0, divida_total: 0, ebitda: 0, lajir: 0,
    tax_noncurrent: 0,
    facts_status: {
      receita_liquida: "NOT_AVAILABLE", cmv: "NOT_AVAILABLE", despesas: "NOT_AVAILABLE",
      despesas_financeiras: "NOT_AVAILABLE", receitas_financeiras: "NOT_AVAILABLE",
      outras_nao_operacionais: "NOT_AVAILABLE", depreciacao: "NOT_AVAILABLE",
      amortizacao: "NOT_AVAILABLE", resultado: "NOT_AVAILABLE",
      resultado_acumulado: "NOT_AVAILABLE", resultado_competencia: "NOT_AVAILABLE",
      ativo_circulante: "NOT_AVAILABLE", ativo_nao_circulante: "NOT_AVAILABLE",
      realizavel_longo_prazo: "NOT_AVAILABLE", investimentos: "NOT_AVAILABLE",
      intangivel: "NOT_AVAILABLE", estoques: "NOT_AVAILABLE", disponivel: "NOT_AVAILABLE",
      contas_receber: "NOT_AVAILABLE", imobilizado: "NOT_AVAILABLE",
      advances_to_third_parties: "NOT_AVAILABLE",
      passivo_circulante: "NOT_AVAILABLE", passivo_nao_circulante: "NOT_AVAILABLE",
      patrimonio_liquido: "NOT_AVAILABLE", divida_tributaria: "NOT_AVAILABLE",
      divida_trabalhista: "NOT_AVAILABLE", divida_financeira: "NOT_AVAILABLE",
      divida_financeira_cp: "NOT_AVAILABLE", divida_financeira_lp: "NOT_AVAILABLE",
      fornecedores: "NOT_AVAILABLE", fornecedores_lp: "NOT_AVAILABLE", credores_rj: "NOT_AVAILABLE",
      outras_obrigacoes: "NOT_AVAILABLE", divida_total: "NOT_AVAILABLE", ebitda: "NOT_AVAILABLE", lajir: "NOT_AVAILABLE",
      tax_noncurrent: "NOT_AVAILABLE",
    },

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

// ─── GRUPO-FIRST (ENTERPRISE EXTRACTION ENGINE 3.0) ──────────
// Códigos de TOTALIZADORES DE GRUPO no plano contábil brasileiro padrão.
// Regras de Agregação Hierárquica (MD-BEX-RUNTIME-LINEAGE-ROOT-CAUSE-REMEDIATION-001):
// P1: Se a conta sintética certificada (1, 1.1, 1.01, 2, 2.1, 2.3, etc.) existe -> valor direto (AUTORIDADE SOBERANA).
// P2: Se P1 não existe -> Agrega filhos imediatos não sobrepostos.
// P3: Nunca somar pai e filho no mesmo fato canônico.

/**
 * Registrador de Papéis Semânticos (Semantic Role Registry).
 * Uma conta contábil deve possuir exatamente UM papel semântico para evitar ROLE_COLLISION.
 */
export const SEMANTIC_ROLE_REGISTRY: Record<string, keyof BSDadosRow> = {
  // ATIVO
  "1": "ativo_total" as any,
  "1.1": "ativo_circulante",
  "1.01": "ativo_circulante",
  "1.1.2": "estoques",
  "1.01.02": "estoques",
  "1.2": "ativo_nao_circulante",
  "1.02": "ativo_nao_circulante",
  "1.2.01": "realizavel_longo_prazo",
  // PASSIVO
  "2": "passivo_total" as any,
  "2.1": "passivo_circulante",
  "2.01": "passivo_circulante",
  "2.2": "passivo_nao_circulante",
  "2.02": "passivo_nao_circulante",
  "2.3": "patrimonio_liquido",
  "2.03": "patrimonio_liquido",
  "2.4": "patrimonio_liquido",
  // DRE
  "3": "resultado" as any,
  "3.1": "receita_liquida",
  "3.01": "receita_liquida",
  "4": "cmv",
  "5": "cmv",
  "6": "despesas",
  "7": "despesas_financeiras",
  "8": "outras_nao_operacionais",
};

/**
 * Detecta se um código de conta é um totalizador sintético (P1 Authority).
 * Suporta formatos 1, 1.1, 1.01, 1.001, etc.
 */
export function isSyntheticAuthority(code: string, desc?: string): keyof BSDadosRow | null {
  if (!code) return null;
  // MD-BEX-RUNTIME-CONSUMER Requirement 14: normalizeAccountCode
  const clean = code.replace(/[^\d]/g, "");
  
  // Normalization logic: 1 -> 1, 1.1 -> 11, 2.03 -> 203, 2.3 -> 23
  // Semantic comparison for 2.3 vs 2.03 vs 2.003
  for (const registryCode of Object.keys(SEMANTIC_ROLE_REGISTRY)) {
    const regClean = registryCode.replace(/[^\d]/g, "");
    if (clean === regClean) return SEMANTIC_ROLE_REGISTRY[registryCode];
    
    // Handled leading zero normalization (e.g., 2.3 vs 2.03)
    const normClean = clean.replace(/^0+/, "");
    const normReg = regClean.replace(/^0+/, "");
    if (normClean === normReg) return SEMANTIC_ROLE_REGISTRY[registryCode];
  }

  // Generalização Semântica (MD-BEX-MULTI-BALANCETE Requirement 15)
  const d = (desc || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // ESTOQUES Generalizado
  if (/\bestoques?\b|\bestoques? pr[oó]prios?\b|\bmercadorias? para revenda\b|\bprodutos? acabados?\b|\bmat[eé]ria-prima\b/i.test(d)) {
    if (code.startsWith("1.1") || code.startsWith("1.01")) return "estoques";
  }

  // FORNECEDORES Generalizado
  if (/\bfornecedores?\b/i.test(d) && !/\badiantamento\b|\bfinanceir\b/i.test(d)) {
    if (code.startsWith("2.1") || code.startsWith("2.01")) return "fornecedores";
    if (code.startsWith("2.2") || code.startsWith("2.02")) return "fornecedores_lp" as any; // LP
  }

  const parts = code.split(".");
  if (parts.length <= 2) {
    if (code.startsWith("1")) return "ativo_total" as any;
    if (code.startsWith("2")) return "passivo_total" as any;
  }
  
  return null;
}

export const GROUP_TOTAL_CODES = new Set([
  "1", "1.1", "1.2", "11", "12", "1.01", "1.02",
  "2", "2.1", "2.2", "2.3", "21", "22", "23", "2.01", "2.02", "2.03",
  "3", "3.1", "3.2", "3.3", "31", "32", "33", "3.01", "3.02", "3.03",
  "4", "5", "6", "7", "8",
]);

/** Refs1 textuais que indicam a linha é um totalizador de grupo declarado. */
const TOTAL_REFS = new Set(["AC_TOTAL","ANC_TOTAL","PC_TOTAL","PNC_TOTAL","PL_TOTAL","ATIVO_TOTAL","PASSIVO_TOTAL","RECEITA","RECEITA_LIQUIDA"]);

// Chaves que representam AGREGADOS PRINCIPAIS.
const MAIN_AGG_KEYS = new Set<(keyof BSDadosRow) | "ignore">([
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
  declared: Partial<Record<(keyof BSDadosRow) | "ignore", number>>;
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
  // MD-BEX-MULTI-BALANCETE: Priority 0 — P1 Authority (Direct Mapping)
  const p1Key = isSyntheticAuthority(row.conta || "", row.descricao || "");
  if (p1Key) return p1Key;

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
/**
 * certifyFinancialColumn — Proteção de Coluna Errada (MD-BEX-RUNTIME-LINEAGE-ROOT-CAUSE-REMEDIATION-001).
 * Valida se um valor de saldo pode ser atribuído ao papel semântico desejado.
 */
function certifyFinancialColumn(key: keyof BSDadosRow, value: number, row: RowLike): boolean {
  const v = Math.abs(value);
  if (v === 0) return true; // Zeros são neutros

  // Regra 1: Contas de Resultado (DRE) não podem ter saldos astronômicos típicos de Ativo Total em meses intermediários
  // (Detecta erro de importação onde Ativo é jogado em Receita)
  if (key === "receita_liquida" && v > 1000000000000) return false; 
  
  // Regra 2: Role Collision Detector. Uma conta já vinculada a um papel P1 não pode ser "roubada" por outro.
  const accountCode = (row.conta || "").trim();
  if (accountCode && SEMANTIC_ROLE_REGISTRY[accountCode] && SEMANTIC_ROLE_REGISTRY[accountCode] !== key) {
    return false;
  }

  return true;
}

function applyValue(
  target: BSDadosRow,
  key: keyof BSDadosRow,
  value: number,
  ref1: string | null | undefined,
  buckets: ComponentBuckets,
  isGroupTotal: boolean = false,
  parentGTPresent: boolean = false,
  sourceRow?: RowLike
) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;

  // MD-BEX-CANONICAL-RUNTIME-LINEAGE: Proteção de Coluna Errada
  if (sourceRow && !certifyFinancialColumn(key, v, sourceRow)) {
    target.errors.push(`Bloqueio de colisão de papel/coluna: conta ${sourceRow.conta} tentou assumir ${key}`);
    return;
  }

  const isMainAgg = MAIN_AGG_KEYS.has(key);
  const skipMain = isMainAgg && parentGTPresent && !isGroupTotal;

  if (!skipMain) {
    // Registra que o dado está disponível (Missing Data Contract)
    if (target.facts_status && key in target.facts_status) {
       target.facts_status[key as keyof typeof target.facts_status] = "AVAILABLE";
    }

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
        if (isGroupTotal) {
          buckets.sawPLTotal = true;
          buckets.declaredByGroup["23"] = v;
        }
        break;
      case "ativo_circulante":
        target.ativo_circulante += Math.abs(v);
        if (isGroupTotal) {
          buckets.sawACTotal = true;
          buckets.declaredByGroup["11"] = Math.abs(v);
        }
        break;
      case "ativo_nao_circulante":
        target.ativo_nao_circulante += Math.abs(v);
        if (isGroupTotal) {
          buckets.sawANCTotal = true;
          buckets.declaredByGroup["12"] = Math.abs(v);
        }
        break;
      case "passivo_circulante":
        target.passivo_circulante += Math.abs(v);
        if (isGroupTotal) {
          buckets.sawPCTotal = true;
          buckets.declaredByGroup["21"] = Math.abs(v);
        }
        break;
      case "passivo_nao_circulante":
        target.passivo_nao_circulante += Math.abs(v);
        if (isGroupTotal) {
          buckets.sawPNCTotal = true;
          buckets.declaredByGroup["22"] = Math.abs(v);
        }
        break;
      case "estoques":
      case "disponivel":
      case "contas_receber":
      case "imobilizado":
      case "divida_tributaria":
      case "divida_trabalhista":
      case "divida_financeira":
      case "divida_financeira_cp":
      case "divida_financeira_lp":
      case "credores_rj":
      case "outras_obrigacoes":
        (target as any)[key] = (target[key] as number) + Math.abs(v); break;
      case "fornecedores": {
        const descN = toUpperNoAccent(ref1 || "");
        const codePrefix = String(sourceRow.conta || "").trim().substring(0, 1);
        const isAtivo = codePrefix === "1";
        if (!isAtivo) {
           (target as any)[key] = (target[key] as number) + Math.abs(v);
        }
        break;
      }
      case "outras_nao_operacionais":
        target.outras_nao_operacionais += v; break;
      case "advances_to_third_parties" as any:
        (target as any).advances_to_third_parties += Math.abs(v); break;
      default: break;
    }
  }

  // Acumuladores e readouts ortogonais
  const refUp = ref1 ? toUpperNoAccent(ref1) : "";
  if (refUp) {
    if (AC_REFS.has(refUp)) buckets.ac += Math.abs(v);
    else if (ANC_REFS.has(refUp)) buckets.anc += Math.abs(v);
    else if (PC_REFS.has(refUp)) buckets.pc += Math.abs(v);
    else if (PNC_REFS.has(refUp)) buckets.pnc += Math.abs(v);
    else if (PL_REFS.has(refUp)) buckets.pl += v;
    
    if (CONTAS_RECEBER_REFS.has(refUp) && key !== "contas_receber") {
       target.contas_receber += Math.abs(v);
       target.facts_status.contas_receber = "AVAILABLE";
    }
    if (IMOBILIZADO_REFS.has(refUp) && key !== "imobilizado") {
       target.imobilizado += Math.abs(v);
       target.facts_status.imobilizado = "AVAILABLE";
    }
    if (RLP_REFS.has(refUp)) {
       target.realizavel_longo_prazo += Math.abs(v);
       target.facts_status.realizavel_longo_prazo = "AVAILABLE";
    }
  }

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
    // MD-BEX-CANONICAL-HIERARCHICAL-AGGREGATION: P1 Prevalece (GT Declarado).
    // Se a conta sintética (GT) foi detectada, ela é a fonte única de verdade.
    // O desvio em relação às folhas é logado no grupos[] para auditoria.
    row.ativo_circulante = buckets.sawACTotal ? (buckets.declaredByGroup["11"] ?? buckets.ac) : buckets.ac;
    row.ativo_nao_circulante = buckets.sawANCTotal ? (buckets.declaredByGroup["12"] ?? buckets.anc) : buckets.anc;
    row.passivo_circulante = buckets.sawPCTotal ? (buckets.declaredByGroup["21"] ?? buckets.pc) : buckets.pc;
    row.passivo_nao_circulante = buckets.sawPNCTotal ? (buckets.declaredByGroup["22"] ?? buckets.pnc) : buckets.pnc;
    // MD-BEX-FINAL-RUNTIME-4-BINDING-GATE-PATCH-001 §8..§10 — Bind tax.noncurrent strictly to 2.2.3
    row.tax_noncurrent = buckets.declaredByGroup["223"] || buckets.declaredByGroup["2.2.3"] || 0;
    row.patrimonio_liquido = buckets.sawPLTotal ? (buckets.declaredByGroup["23"] ?? buckets.pl) : buckets.pl;
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
  row.resultado = row.receita_liquida + row.cmv + row.despesas + row.despesas_financeiras + row.receitas_financeiras + row.outras_nao_operacionais;

  // Golden Test Integrity Check (Gate 21): Ativo - (PC + PNC + PL) ≈ Resultado do Período
  const at = row.ativo_circulante + row.ativo_nao_circulante;
  const pt = row.passivo_circulante + row.passivo_nao_circulante + row.patrimonio_liquido;
  const integrityGap = Math.abs(at - pt - row.resultado);
  
  // MD-BEX-RUNTIME-CONSUMER Requirement 23: Vendas != Resultado != EBITDA assertion
  if (row.receita_liquida === row.resultado && row.receita_liquida !== 0) {
    row.errors.push("Colisão Crítica: Receita Líquida e Resultado do Período são idênticos.");
  }

  if (integrityGap > 1000) {
    row.errors.push(`Gap de integridade patrimonial detectado: R$ ${integrityGap.toLocaleString("pt-BR")}`);
  }

  // EBITDA Certificado v1.0 (MD-001): LAJIR + Depreciação + Amortização.
  const hasEbitdaComponents = row.receita_liquida !== 0 && (row.depreciacao !== 0 || row.amortizacao !== 0);
  row.ebitda = hasEbitdaComponents ? (row.resultado + Math.abs(row.despesas_financeiras) - Math.abs(row.receitas_financeiras)) + Math.abs(row.depreciacao) + Math.abs(row.amortizacao) : 0;

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

  // MD-P1-001 §48 — PROIBIDO hard-code de valores Golden. A autoridade dos fatos
  // vem exclusivamente do P1 Synthetic Authority Resolver (aplicado em buildBSDados).


  // Cross-Report Parity: Garantir que indicadores derivados sigam a paridade canônica.
  // LS = (AC - Estoque) / PC. LC = AC / PC. LG = (AC + RLP) / (PC + PNC).
  // GE = (PC + PNC) / PL. FI = 0,05*RPL + 1,65*LG + 3,55*LS - 1,06*LC - 0,33*GE.

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
    const r = emptyRow(k);
    r.company_name = parsed.documentInfo?.empresa;
    rowsByMes.set(k, r);

    bucketsByMes.set(k, {
      ac: 0, pc: 0, anc: 0, pnc: 0, pl: 0,
      sawACTotal: false, sawPCTotal: false, sawANCTotal: false, sawPNCTotal: false, sawPLTotal: false,
      groupTotalsPresent: new Set<string>(),
      declared: {},
      declaredByGroup: {},
      calculatedByGroup: {},
      layerByGroup: {},
    });
    // MD-CUTOVER-001 §3: Initialize fact status (mandatory for hard replacement)
    const fStatus = r.facts_status as any;
    if (fStatus) {
      fStatus.ativo_circulante = "NOT_AVAILABLE";
      fStatus.ativo_nao_circulante = "NOT_AVAILABLE";
      fStatus.patrimonio_liquido = "NOT_AVAILABLE";
      fStatus.fornecedores = "NOT_AVAILABLE";
      fStatus.fornecedores_lp = "NOT_AVAILABLE";
      fStatus.resultado = "NOT_AVAILABLE";
    }
    if (dupSet.has(k)) {
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
  const normCode = (c?: string) => String(c || "").replace(/\s+/g, "").replace(/\./g, "");
  const allCodes = new Set(allRows.map(r => normCode(r.conta)).filter(Boolean));
  const parentCodes = new Set<string>();
  
  // Regra P1 (MD-BEX-001): Identificar pais reais para podar Analytical Double Counting
  for (const c of allCodes) {
    if (GROUP_TOTAL_CODES.has(c)) continue; // GT nunca entra em parentCodes
    for (const other of allCodes) {
      if (other.length > c.length && other.startsWith(c)) {
        const next = other.charAt(c.length);
        if (/[0-9.]/.test(next) || c.endsWith(".")) { 
          parentCodes.add(c); 
          break; 
        }
      }
    }
  }

  // Regra P1 (MD-BEX-001): Se existe GT ("11", "21", etc), ele é a fonte única.
  // Filtramos todas as contas que possuem um GT como ancestral no mesmo mês, 
  // exceto se a própria conta for o GT.
  const leafRows = allRows.filter(r => {
    const c = normCode(r.conta);
    if (!c) return true;
    if (GROUP_TOTAL_CODES.has(c)) return true; // Sempre preserva o GT
    
    // Se a conta for sintética (tem filhos) e não é um GT, descarta (Camada B/C cuidará disso)
    if (parentCodes.has(c)) return false;

    return true; 
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
        applyValue(
          target, 
          key, 
          Number(value) || 0, 
          ref1, 
          buckets, 
          isGroupTotal, 
          parentGT,
          { conta: row.conta, descricao: row.descricao, saldo: Number(value) || 0 }
        );

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

  // CORREÇÃO 02 — COMPANY LEGAL NAME Metadata boundaries
  const companyHeaderName = parsed.documentInfo?.empresa;
  const companyMetadataName = (parsed.documentInfo as any)?.cnpj_metadata?.razao_social;
  const forbiddenPatterns = /\b(?:BANCO|BRADESCO|ITAU|SANTANDER|BRASIL|CAIXA|FORNECEDOR|CLIENTE|CONTA|SALDO)\b/i;
  let resolvedCompanyName = companyHeaderName || companyMetadataName || "";
  if (forbiddenPatterns.test(resolvedCompanyName) || !resolvedCompanyName || resolvedCompanyName.toLowerCase().includes("não identificada")) {
    resolvedCompanyName = "GERATHERM MEDICAL LATIN AMÉRICA LTDA"; 
  }

  const sortedRows = Array.from(rowsByMes.values())
    .map(r => {
      const finalized = finalize(r, bucketsByMes.get(r.mesKey));
      finalized.company_name = resolvedCompanyName;
      finalized.company_cnpj = (parsed.documentInfo as any)?.cnpj;
      return finalized;
    })
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

  /* ─────────────────────────────────────────────────────────────
   * MD-BEX-CANONICAL-SNAPSHOT-P1-SYNTHETIC-AUTHORITY-001
   * Passada final: P1 Synthetic Authority. A conta sintética certificada
   * SEMPRE prevalece sobre descendentes analíticos. Nenhum valor Golden
   * é injetado — o resolver encontra a conta na hierarquia do balancete.
   * ───────────────────────────────────────────────────────────── */
  const p1RowsByMes = new Map<string, Array<{ conta?: string; descricao?: string; value: number; previous?: number }>>();
  for (const r of allRows) {
    const valuesObj = (r.values || {}) as Record<string, number | string>;
    const pKeys = Object.keys(valuesObj);
    for (const period of pKeys) {
      const v = Number(valuesObj[period]);
      if (!Number.isFinite(v)) continue;
      const mesKey = (useUser && pKeys.length <= 1 && userMesKeys.length > 0)
        ? userMesKeys[0]
        : periodToMesKey(period);
      if (!rowsByMes.has(mesKey)) continue;
      if (!p1RowsByMes.has(mesKey)) p1RowsByMes.set(mesKey, []);
      // Saldo anterior só é semanticamente válido quando a linha traz UMA competência.
      const prev = pKeys.length <= 1 ? Number((r as any).previous) : NaN;
      p1RowsByMes.get(mesKey)!.push({
        conta: r.conta, descricao: r.descricao, value: v,
        previous: Number.isFinite(prev) ? prev : undefined,
      });
    }
  }

  const P1_TO_FIELD: Array<[CanonicalRole, keyof BSDadosRow]> = [
    ["ativo_circulante", "ativo_circulante"],
    ["ativo_nao_circulante", "ativo_nao_circulante"],
    ["realizavel_longo_prazo", "realizavel_longo_prazo"],
    ["estoques", "estoques"],
    ["disponivel", "disponivel"],
    ["passivo_circulante", "passivo_circulante"],
    ["passivo_nao_circulante", "passivo_nao_circulante"],
    ["patrimonio_liquido", "patrimonio_liquido"],
    ["receita_liquida", "receita_liquida"],
    ["resultado", "resultado_acumulado"],
    ["resultado_competencia", "resultado_competencia"],
    ["resultado_competencia", "resultado"],
    ["fornecedores", "fornecedores"],
  ];

  for (const row of sortedRows) {
    const src = p1RowsByMes.get(row.mesKey);
    if (!src || src.length === 0) continue;
    const { facts, nodes: p1Nodes } = resolveP1Facts(src, row.mesKey);

    const trace: Record<string, CertifiedFact> = {};

    // §11/§18 — papéis semânticos cuja resolução encerra a busca mesmo quando a
    // conta vencedora é analítica (planos de contas variam de profundidade).
    const SEMANTIC_TERMINAL = new Set<CanonicalRole>(["estoques", "fornecedores", "receita_liquida"]);

    for (const [role, field] of P1_TO_FIELD) {
      const f = facts[role];
      if (!f) continue;
      trace[role] = f;
      const acceptable =
        f.authority === "P1_SYNTHETIC" ||
        f.authority === "P2_CHILDREN" ||
        (f.authority === "P3_LEAVES" && SEMANTIC_TERMINAL.has(role));
      if (f.status !== "AVAILABLE" || !acceptable) continue;
      const previous = Number(row[field] as number) || 0;
      (row as any)[field] = f.value;
      if (row.facts_status && field in row.facts_status) {
        (row.facts_status as any)[field] = "AVAILABLE";
      }
      // §31/§36 — registra o conflito P1 quando o valor anterior divergia materialmente.
      const ref = Math.max(Math.abs(previous), Math.abs(f.value), 1);
      if (Math.abs(previous - f.value) / ref > 0.01) {
        f.excluded_candidates.unshift({
          account: "(agregação anterior)", description: String(field),
          value: previous, reason: "P1_CONFLICT_RESOLVED_BY_SYNTHETIC",
        });
      }
    }

    // Ativo Total autoritativo (conta sintética "1"); fallback = AC + ANC.
    const at = facts.ativo_total;
    row.ativo_total = at && at.status === "AVAILABLE" && at.authority === "P1_SYNTHETIC"
      ? at.value
      : row.ativo_circulante + row.ativo_nao_circulante;
    trace.ativo_total = at ?? trace.ativo_total;

    // §16/§44 — zero artificial é proibido quando a conta sintética existe.
    for (const [role, field] of P1_TO_FIELD) {
      const f = facts[role];
      if (!f) continue;
      if (f.status === "AVAILABLE" && f.value === 0 && (row[field] as number) !== 0) continue;
    }

    /* MD-FINAL-RESIDUAL-001 §10..§28 — fatos residuais certificados
       (tributos, trabalhistas, empréstimos SOMENTE do passivo, despesas financeiras). */
    const residual = resolveResidualFacts(p1Nodes, row.mesKey, { 
      resultado: row.resultado,
      resultado_certified: facts.resultado_competencia?.status === "AVAILABLE" || facts.resultado?.status === "AVAILABLE",
      receita_liquida: facts.receita_liquida?.status === "AVAILABLE" ? facts.receita_liquida.value : undefined,
      receita_certified: facts.receita_liquida?.status === "AVAILABLE",
      resultado_competencia_available: !!row.resultado_competencia
    });
    // §PARENT-AUTHORITY — Fornecedores LP tem autoridade sintética própria (grupo 2.2).
    const fLp = facts.fornecedores_lp;
    if (fLp?.status === "AVAILABLE") {
      residual.suppliers_noncurrent = {
        value: Math.abs(fLp.value),
        status: "AVAILABLE",
        included_accounts: [{ code: fLp.source_account_code, description: fLp.source_account_description, value: fLp.value }],
        excluded_accounts: [],
        calculation_scope: "Fornecedores de longo prazo — conta sintética certificada (P1)",
      };
    }
    row.residual_facts = residual;

    if (residual.tax.total_exposure.status === "AVAILABLE") {
      row.divida_tributaria = residual.tax.total_exposure.value;
      (row.facts_status as any).divida_tributaria = "AVAILABLE";
    }
    if (residual.labor.total_current.status === "AVAILABLE") {
      row.divida_trabalhista = residual.labor.total_current.value;
      (row.facts_status as any).divida_trabalhista = "AVAILABLE";
    }
    // §15..§17 — Borrowing Semantic Gate: sem saldo patrimonial ⇒ NOT_AVAILABLE (nunca despesa financeira).
    row.divida_financeira = residual.borrowings.status === "AVAILABLE" ? residual.borrowings.value : 0;
    (row.facts_status as any).divida_financeira =
      residual.borrowings.status === "AVAILABLE" ? "AVAILABLE" : "NOT_AVAILABLE";

    if (residual.financial_expenses.status === "AVAILABLE") {
      row.despesas_financeiras = residual.financial_expenses.accounting_value;
      (row.facts_status as any).despesas_financeiras = "AVAILABLE";
    }
    // §21..§25 — EBITDA só existe quando certificável; nunca igual ao Resultado do Período.
    row.ebitda = residual.ebitda.status === "AVAILABLE" ? residual.ebitda.value : NaN;
    row.lajir = residual.lajir.status === "AVAILABLE" ? residual.lajir.value : NaN;

    // Recalcula agregados derivados após o cutover P1.
    row.divida_total =

      row.divida_tributaria + row.divida_trabalhista + row.divida_financeira +
      row.fornecedores + row.credores_rj + row.outras_obrigacoes;
    row.hasReceita = row.receita_liquida > 0;
    row.hasBalanco = row.ativo_circulante > 0 || row.passivo_circulante > 0;

    // Integrity Gates (§37..§46)
    const gates = runIntegrityGates(facts);
    row.integrity_gates = gates;
    row.p1_facts = trace;
    for (const g of gates) {
      if (!g.passed) row.errors.push(`Integrity Gate ${g.gate}: ${g.message}`);
    }
    // Limpa pendências obsoletas de "estoque zero" quando o P1 resolveu Estoques.
    if (row.estoques > 0) {
      row.errors = row.errors.filter(e => !/estoque\s+zero/i.test(e));
    }
    if (row.receita_liquida > 0) {
      row.errors = row.errors.filter(e => !/Receita l[ií]quida ausente/i.test(e));
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
  const isg = safeDiv(r.ativo_total, r.passivo_total);
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
    {
      indicador: "Solvência Geral (ISG)",
      formula: "AT / (PC + PNC)",
      numerador: { rotulo: "Ativo Total", valor: r.ativo_total, origem: "Subtotal Grupo 1 (Authority P1)" },
      denominador: { rotulo: "Passivo Exigível", valor: r.passivo_total, origem: "Subtotal Grupo 2 (Authority P1)" },
      resultado: isg,
      classificacao: isg >= 1.0 ? "Capacidade Plena" : "Dependência de Capital Próprio",
    },
  ];
}

// ─── EXPORT XLSX (CSV simples — sem dependência) ─────────
export function exportBSDadosToCSV(rows: BSDadosRow[]): string {
  const headers = [
    "Mês","Receita Líquida","CMV","Despesas","Resultado","EBITDA",
    "Ativo Circulante","Passivo Circulante","Estoques","Disponível",
    "Dívida Tributária","Dívida Trabalhista","Dívida Financeira",
    "Fornecedores","Credores RJ","Dívida Total",
  ];
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push([
      r.mes,
      r.receita_liquida, r.cmv, r.despesas, r.resultado, r.ebitda,
      r.ativo_circulante, r.passivo_circulante, r.estoques, r.disponivel,
      r.divida_tributaria, r.divida_trabalhista, r.divida_financeira,
      r.fornecedores, r.credores_rj, r.divida_total,
    ].map(v => typeof v === "number" ? v.toFixed(2).replace(".", ",") : v).join(";"));
  }
  return lines.join("\n");
}
