/**
 * CLASSIFIER — Classificador híbrido de linhas contábeis (Onda 5).
 *
 * Pesos (validados no MD Análise de Desvios — Giannini):
 *   50%  código (prefixo + nível hierárquico, ex: "1.1.01.0001")
 *   25%  hierarquia (parent já classificado)
 *   15%  nome (regex canônica em grupoResultadoDictionary)
 *   10%  similaridade IA (cache + embeddings — opcional)
 *
 * Política: **IA sugere, regra determinística decide**.
 * Este módulo é não-disruptivo: pode ser chamado em paralelo ao fluxo atual,
 * registrando `score_confianca` em `metadata.trilha` sem alterar o agregado
 * até confirmação do hybrid_mode.
 */

export interface ClassifyInput {
  conta?: string;       // código contábil (ex: "1.1.01.0001")
  descricao?: string;   // nome da conta
  ref1?: string | null; // Ref Capital BEX (quando o parser já inferiu)
  parentGrupo?: string; // grupo já atribuído ao pai (hierarquia)
  aiSuggestion?: string;// rótulo sugerido pelo cache/IA (opcional)
}

export interface ClassifyResult {
  grupo: string;        // bucket canônico (ex: "ativo_circulante")
  score: number;        // 0..100
  breakdown: { code: number; hierarchy: number; name: number; ai: number };
  reason: string;
}

/** Mapeamento mínimo código → grupo (espelha grupoResultadoDictionary). */
const CODE_PREFIX_MAP: Array<[RegExp, string]> = [
  [/^1\.1\.01/, "disponivel"],
  [/^1\.1\.02/, "contas_receber"],
  [/^1\.1\.03/, "estoques"],
  [/^1\.1/,    "ativo_circulante"],
  [/^1\.2\.01/, "realizavel_longo_prazo"],
  [/^1\.2\.02/, "investimentos"],
  [/^1\.2\.03/, "imobilizado"],
  [/^1\.2\.04/, "intangivel"],
  [/^1\.2/,    "ativo_nao_circulante"],
  [/^2\.1\.01/, "fornecedores"],
  [/^2\.1\.02/, "divida_trabalhista"],
  [/^2\.1\.03/, "divida_tributaria"],
  [/^2\.1\.04/, "divida_financeira"],
  [/^2\.1\.05/, "credores_rj"],
  [/^2\.1/,    "passivo_circulante"],
  [/^2\.2/,    "passivo_nao_circulante"],
  [/^2\.3|^3\.0|^4\.0\.0?9/, "patrimonio_liquido"],
  [/^3\.1|^3\.2/, "receita_liquida"],
  [/^4\.1/,    "cmv"],
  [/^4\.2|^4\.3/, "despesas"],
  [/^4\.4/,    "despesas_financeiras"],
];

const NAME_PATTERNS: Array<[RegExp, string]> = [
  [/realiz[aá]vel.*longo.*prazo/i, "realizavel_longo_prazo"],
  [/imobilizado/i, "imobilizado"],
  [/intang[ií]vel/i, "intangivel"],
  [/investimentos/i, "investimentos"],
  [/dispon[ií]vel|caixa|equivalentes|aplica[çc][oõ]es/i, "disponivel"],
  [/contas?\s+a\s+receber|clientes/i, "contas_receber"],
  [/estoque/i, "estoques"],
  [/fornecedores/i, "fornecedores"],
  [/trabalhista|sal[aá]rios|encargos.*folha/i, "divida_trabalhista"],
  [/tribut[aá]ri|impostos.*recolher|icms|pis|cofins|iss/i, "divida_tributaria"],
  [/empr[eé]stimos|financiamentos|debentures/i, "divida_financeira"],
  [/credores.*rj|recupera[çc][aã]o\s+judicial/i, "credores_rj"],
  [/patrim[oô]nio\s+l[ií]quido|capital\s+social|reservas/i, "patrimonio_liquido"],
  [/receita.*l[ií]quida|receita.*bruta|vendas/i, "receita_liquida"],
  [/cmv|custo.*mercadoria|custo.*servi[çc]o|custo.*produto/i, "cmv"],
  [/despesas?\s+financeiras|juros/i, "despesas_financeiras"],
  [/deprecia[çc][aã]o/i, "depreciacao"],
  [/amortiza[çc][aã]o/i, "amortizacao"],
];

function classifyByCode(conta?: string): string | null {
  if (!conta) return null;
  for (const [rx, g] of CODE_PREFIX_MAP) if (rx.test(conta)) return g;
  return null;
}
function classifyByName(desc?: string): string | null {
  if (!desc) return null;
  for (const [rx, g] of NAME_PATTERNS) if (rx.test(desc)) return g;
  return null;
}

/**
 * Classifica uma linha com pesos 50/25/15/10.
 * Empate desempata pela ordem: código > hierarquia > nome > IA.
 */
export function classify(input: ClassifyInput): ClassifyResult {
  const byCode = classifyByCode(input.conta);
  const byName = classifyByName(input.descricao);
  const byHier = input.parentGrupo || null;
  const byAi   = input.aiSuggestion || null;

  const votes: Record<string, number> = {};
  const breakdown = { code: 0, hierarchy: 0, name: 0, ai: 0 };

  if (byCode) { votes[byCode] = (votes[byCode] ?? 0) + 50; breakdown.code = 50; }
  if (byHier) { votes[byHier] = (votes[byHier] ?? 0) + 25; breakdown.hierarchy = 25; }
  if (byName) { votes[byName] = (votes[byName] ?? 0) + 15; breakdown.name = 15; }
  if (byAi)   { votes[byAi]   = (votes[byAi]   ?? 0) + 10; breakdown.ai = 10; }

  let grupo = byCode ?? byHier ?? byName ?? byAi ?? "ativo_circulante";
  let score = 0;
  for (const [g, v] of Object.entries(votes)) {
    if (v > score) { grupo = g; score = v; }
  }

  const reason = [
    byCode && `código→${byCode} (50)`,
    byHier && `hierarquia→${byHier} (25)`,
    byName && `nome→${byName} (15)`,
    byAi   && `IA→${byAi} (10)`,
  ].filter(Boolean).join(" · ") || "fallback";

  return { grupo, score, breakdown, reason };
}
