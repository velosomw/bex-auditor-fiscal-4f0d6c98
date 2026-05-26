/**
 * GRUPO DE RESULTADO — Dicionário canônico (terminologia textual)
 *
 * Esta é a fonte de verdade para identificar **Grupos de Resultado Principais**
 * e sub-grupos do balancete brasileiro a partir da **DESCRIÇÃO** da conta,
 * independente do código numérico (que varia por plano de contas — ex.:
 * Giannini usa "22 NAO CIRCULANTE - LONGO PRAZO", outros planos usam "22"
 * para "Passivo Não Circulante" puro, etc.).
 *
 * Regra de uso:
 *   1. O parser tenta `matchGrupoCanonico(descricao)` para cada linha sintética
 *      (não-folha). Se houver match, a linha é mantida e marcada como
 *      `*_TOTAL` (autoritária na camada A do builder).
 *   2. O builder usa o mesmo dicionário em fallback quando o código numérico
 *      não bate com `GROUP_TOTAL_CODES`.
 *
 * Princípio: "a referência de Grupo de Resultado e sub-grupos mantém
 * característica e morfologia textual igual" — apoiamos detecção em
 * vocabulário, não em prefixos de código.
 */

export type GrupoCanonico =
  | "AC_TOTAL"
  | "ANC_TOTAL"
  | "PC_TOTAL"
  | "PNC_TOTAL"
  | "PL_TOTAL"
  | "RECEITA"            // Receita Bruta / Operacional Bruta
  | "DEDUCOES_RECEITA"   // Devoluções, Abatimentos, Impostos sobre Vendas
  | "CMV"
  | "DESPESAS"           // Operacionais (Administrativas, Comerciais, Pessoal)
  | "DESPESAS_FIN"
  | "DESPESAS_NOP";      // Não Operacionais

/**
 * Padrões textuais por grupo canônico. Ordem importa — mais específico antes
 * (ex.: "Ativo Não Circulante" antes de "Ativo Circulante").
 */
const PATTERNS: Array<{ grupo: GrupoCanonico; re: RegExp }> = [
  // ── BALANÇO — ATIVO ─────────────────────────────────────
  { grupo: "ANC_TOTAL", re: /^ativo\s+n[aã]o[\s-]*circulante$/ },
  { grupo: "ANC_TOTAL", re: /^ativo\s+permanente$/ },
  { grupo: "ANC_TOTAL", re: /^realiz[aá]vel\s+a\s+longo\s+prazo$/ },
  { grupo: "AC_TOTAL",  re: /^ativo\s+circulante$/ },

  // ── BALANÇO — PASSIVO ───────────────────────────────────
  { grupo: "PNC_TOTAL", re: /^passivo\s+n[aã]o[\s-]*circulante$/ },
  { grupo: "PNC_TOTAL", re: /n[aã]o[\s-]*circulante.*longo\s+prazo/ },
  { grupo: "PNC_TOTAL", re: /^exig[ií]vel\s+a\s+longo\s+prazo$/ },
  { grupo: "PC_TOTAL",  re: /^passivo\s+circulante$/ },
  { grupo: "PL_TOTAL",  re: /^patrim[oô]nio\s+l[ií]quido$/ },

  // ── DRE ─────────────────────────────────────────────────
  { grupo: "RECEITA",          re: /^receita\s+(?:bruta|operacional\s+bruta)/ },
  { grupo: "RECEITA",          re: /^vendas\s+brutas?/ },
  { grupo: "DEDUCOES_RECEITA", re: /^dedu[cç][oõ]es?\s+(?:da\s+receita|de\s+vendas)/ },
  { grupo: "DEDUCOES_RECEITA", re: /^devolu[cç][oõ]es?\s+e\s+abatimentos?/ },
  { grupo: "DEDUCOES_RECEITA", re: /^impostos?\s+sobre\s+vendas?/ },
  { grupo: "CMV",              re: /^custo\s+(?:das?\s+)?(?:mercadorias?|produtos?|servi[cç]os?)/ },
  { grupo: "CMV",              re: /^cmv$|^csv$|^cpv$/ },
  { grupo: "CMV",              re: /^custo\s+industrial/ },
  { grupo: "DESPESAS_FIN",     re: /^(?:despesas?|receitas?)\s+financeiras?$/ },
  { grupo: "DESPESAS_FIN",     re: /^resultado\s+financeiro$/ },
  { grupo: "DESPESAS_NOP",     re: /^(?:despesas?|receitas?)\s+(?:e\s+(?:despesas?|receitas?)\s+)?n[aã]o[\s-]*operacionais?$/ },
  { grupo: "DESPESAS_NOP",     re: /^outras\s+(?:despesas?|receitas?)\s+n[aã]o[\s-]*operacionais?$/ },
  { grupo: "DESPESAS",         re: /^despesas?\s+operacionais?$/ },
  { grupo: "DESPESAS",         re: /^despesas?\s+(?:administrativas|comerciais|gerais|com\s+pessoal|de\s+vendas)$/ },
];

const stripAccents = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/**
 * Retorna o Grupo de Resultado canônico se a descrição bate com algum
 * padrão textual reconhecido — caso contrário, null.
 *
 * Importante: só faz match exato/quase-exato (^...$) para evitar capturar
 * sub-contas analíticas (ex.: "Salários a Pagar" não é PC_TOTAL).
 */
export function matchGrupoCanonico(descricao: string): GrupoCanonico | null {
  if (!descricao) return null;
  const d = stripAccents(descricao);
  for (const { grupo, re } of PATTERNS) {
    if (re.test(d)) return grupo;
  }
  return null;
}

/**
 * Sub-grupos de Passivo Circulante (componentes de dívida).
 * Identificação por terminologia — usada quando código não obedece
 * o padrão BR padrão.
 */
export function matchSubgrupoPassivoCirculante(
  descricao: string,
): "fornecedores" | "divida_trabalhista" | "divida_tributaria" | "divida_financeira" | "credores_rj" | null {
  const d = stripAccents(descricao);
  if (/credores?\s+rj|recupera[cç][aã]o\s+judic|obriga[cç][oõ]es?\s+de\s+recupera[cç][aã]o/.test(d)) return "credores_rj";
  if (/fornecedor/.test(d)) return "fornecedores";
  if (/empr[eé]stim|financiament|deb[eê]ntures?|leasing|arrendament|confiss[oõ]es?\s+de\s+d[ií]vida|institui[cç][oõ]es?\s+financ/.test(d)) return "divida_financeira";
  if (/sal[aá]ri|f[eé]rias|13[ºo°]|d[eé]cimo\s+terceiro|inss|fgts|trabalhi|encargos\s+soci/.test(d)) return "divida_trabalhista";
  if (/tribut|imposto|icms|iss|pis|cofins|irpj|csll|simples|parcelament|refis|contribui[cç][oõ]es?\s+a\s+recolher/.test(d)) return "divida_tributaria";
  return null;
}
