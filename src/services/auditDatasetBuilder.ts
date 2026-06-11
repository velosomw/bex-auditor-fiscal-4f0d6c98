/**
 * AUDIT DATASET BUILDER — Base única mensal para todos os gráficos do relatório.
 *
 * Reproduz a lógica da aba "Dados Gráficos" do template Excel:
 *   Balancete → Classificação Contábil → Normalização → Dataset Mensal → Engine Cálculo → Gráficos
 *
 * Saída: array MonthlyDatum[] ordenado cronologicamente, com TODAS as métricas
 * que alimentam os 6 gráficos do relatório (CMV/RL, CMV+Desp/RL, Resultado/RL,
 * EBITDA, Liquidez, Endividamento).
 *
 * REGRAS DE SINAL (alinhadas ao Excel):
 *   - Receita Líquida → SEMPRE positiva
 *   - CMV / Despesas → SEMPRE negativos (visual de barra para baixo)
 *   - Resultado → mantém sinal natural
 *   - Dívidas → SEMPRE positivas (módulo)
 */
import type { ParsedFinancialData } from "@/services/auditAIService";

const MES_ABREV_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export interface MonthlyDatum {
  mes: string;                  // "Março 2024"
  mesKey: string;               // "2024-03" (ordenação)
  // DRE
  receita_liquida: number;      // > 0
  cmv: number;                  // < 0
  despesas: number;             // < 0
  resultado: number;            // signed
  ebitda: number;               // signed
  depreciacao: number;          // < 0
  amortizacao: number;          // < 0
  // BALANÇO
  ativo_circulante: number;
  ativo_nao_circulante: number;
  passivo_circulante: number;
  passivo_nao_circulante: number;
  patrimonio_liquido?: number;
  imobilizado?: number;
  intangivel?: number;
  estoques: number;
  disponivel: number;
  // ENDIVIDAMENTO (componentes — todos > 0)
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
  fornecedores: number;
  credores_rj: number;
  outras_obrigacoes: number;
  divida_total: number;
  // FLAGS
  hasReceita: boolean;
  hasBalanco: boolean;
}

// ─── CAMADA 1: DICIONÁRIO CONTÁBIL (regex) ─────────────────────────────────
// Cada categoria tem um padrão regex aplicado a "descricao + conta".
// Ordem importa: padrões mais específicos primeiro.
const PATTERNS = {
  // DRE
  receita_liquida: /\breceita.*l[ií]quid|venda.*l[ií]quid|receita\s+oper.*l[ií]quid\b/i,
  receita_bruta: /\breceita.*brut|vendas?\s*brutas?\b/i,
  deducoes: /\bdedu[cç][oõ]es|impostos?\s+sobre\s+vendas?|devolu[cç][oõ]es\b/i,
  cmv: /\bc(?:mv|sv|pv)\b|\bcusto\s+(?:das?\s+)?(?:mercadoria|servi[cç]o|produto|venda)/i,
  despesas: /\bdespesa|gasto\s+oper|despesas?\s+(?:administ|comerc|venda|geral|oper)/i,
  resultado: /\b(?:lucro|preju[ií]zo|resultado)\s+(?:l[ií]quid|do\s+exerc|do\s+per[ií]odo)/i,
  resultado_op: /\bresultado\s+oper|lucro\s+oper|ebit\b/i,
  depreciacao: /\bdeprecia[cç][aã]o\b/i,
  amortizacao: /\bamortiza[cç][aã]o\b/i,
  // BALANÇO — ATIVO
  ativo_circulante: /\bativo\s+circulante\b/i,
  ativo_nao_circulante: /\bativo\s+n[aã]o[\s-]?circulante|realiz[aá]vel\s+a\s+longo\s+prazo|ativo\s+permanente|imobilizado/i,
  estoques: /\bestoqu/i,
  disponivel: /\b(?:caixa|disponibilidade|disponivel|bancos?|aplica[cç][aã]o\s+financ|equivalente)/i,
  clientes: /\b(?:clientes|duplicatas?\s+a\s+receber|contas?\s+a\s+receber)\b/i,
  // BALANÇO — PASSIVO
  passivo_circulante: /\bpassivo\s+circulante\b/i,
  passivo_nao_circulante: /\bpassivo\s+n[aã]o[\s-]?circulante|exig[ií]vel\s+a?\s*longo\s+prazo\b/i,
  // ENDIVIDAMENTO (componentes do passivo)
  div_tributaria: /\b(?:tribut|impostos?\s+a\s+(?:pagar|recolher)|icms|iss|pis|cofins|irpj|csll|inss\s+a\s+rec|fgts\s+a\s+rec|simples\s+nacional|obriga[cç][oõ]es?\s+tribut|imposto\s+de\s+renda)/i,
  div_trabalhista: /\b(?:sal[aá]rios?\s+a\s+pagar|f[eé]rias|13[ºo°]?|d[eé]cimo\s+terceiro|inss\s+a\s+pagar|fgts\s+a\s+pagar|encargos\s+sociais|provis[aã]o\s+(?:de\s+)?f[eé]rias|trabalhista|obriga[cç][oõ]es?\s+trabalhi)/i,
  div_financeira: /\b(?:empr[eé]stimos?|financiamentos?|deb[eê]ntures?|leasing|arrendamento|institui[cç][aã]o\s+financ|banco.*a\s+pagar)/i,
  fornecedores: /\bfornecedor/i,
  credores_rj: /\b(?:credores?\s+(?:rj|recupera[cç][aã]o)|recupera[cç][aã]o\s+judic|cred\.?\s+rj)/i,
};

// ─── HELPERS ───────────────────────────────────────────────────────────────
function normPeriod(p: string): { key: string; label: string } | null {
  if (!p) return null;
  const s = p.trim();
  // "2024-03" / "2024/03" / "03/2024"
  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    const y = m[1], mo = m[2].padStart(2, "0");
    const idx = parseInt(mo, 10) - 1;
    if (idx >= 0 && idx < 12) return { key: `${y}-${mo}`, label: `${MES_ABREV_FULL[idx]} ${y}` };
  }
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) {
    const y = m[2], mo = m[1].padStart(2, "0");
    const idx = parseInt(mo, 10) - 1;
    if (idx >= 0 && idx < 12) return { key: `${y}-${mo}`, label: `${MES_ABREV_FULL[idx]} ${y}` };
  }
  // "Março 2024" / "marco/2024"
  m = s.match(/^([a-zçãéê]+)[\s\/]+(\d{4})$/i);
  if (m) {
    const monthName = m[1].toLowerCase().replace("ç","c").replace("ã","a").replace(/é/g,"e");
    const idx = MES_ABREV_FULL.findIndex(n => n.toLowerCase().replace("ç","c").replace("ã","a").startsWith(monthName.slice(0,3)));
    if (idx >= 0) {
      const mo = String(idx + 1).padStart(2, "0");
      return { key: `${m[2]}-${mo}`, label: `${MES_ABREV_FULL[idx]} ${m[2]}` };
    }
  }
  // só ano
  m = s.match(/^(\d{4})$/);
  if (m) return { key: `${m[1]}-12`, label: m[1] };
  return { key: s, label: s };
}

function sumRowsByPattern(
  rows: ParsedFinancialData["balanco"],
  pattern: RegExp,
  period: string,
): number {
  let sum = 0;
  for (const r of rows ?? []) {
    const txt = `${r.descricao || ""} ${r.conta || ""}`;
    if (pattern.test(txt)) {
      const v = Number(r.values?.[period]);
      if (Number.isFinite(v)) sum += v;
    }
  }
  return sum;
}

// Só folhas (ignora linhas-pai cujas filhas somariam novamente). Heurística:
// se uma conta tiver código, considera apenas o nível mais profundo.
function leafSum(
  rows: ParsedFinancialData["balanco"],
  pattern: RegExp,
  period: string,
): number {
  const matches = (rows ?? []).filter(r =>
    pattern.test(`${r.descricao || ""} ${r.conta || ""}`)
  );
  if (!matches.length) return 0;
  // Se houver códigos hierárquicos (com pontos), pega só o nível mais profundo
  const hasCodes = matches.every(r => /\d+(\.\d+)+/.test(r.conta || ""));
  if (hasCodes) {
    const maxDepth = Math.max(...matches.map(r => (r.conta.match(/\./g) || []).length));
    const leaves = matches.filter(r => (r.conta.match(/\./g) || []).length === maxDepth);
    return leaves.reduce((s, r) => s + (Number(r.values?.[period]) || 0), 0);
  }
  return matches.reduce((s, r) => s + (Number(r.values?.[period]) || 0), 0);
}

// ─── BUILDER ───────────────────────────────────────────────────────────────
export function buildMonthlyDataset(parsed: ParsedFinancialData | null | undefined): MonthlyDatum[] {
  if (!parsed) return [];
  const periods = parsed.years ?? [];
  if (!periods.length) return [];

  const normalized = periods
    .map(p => ({ raw: p, ...(normPeriod(p) || { key: p, label: p }) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return normalized.map(({ raw, key, label }) => {
    const dre = parsed.dre ?? [];
    const bal = parsed.balanco ?? [];

    // ── DRE ─────────────────────────────────────────────────────────────
    let receita = sumRowsByPattern(dre, PATTERNS.receita_liquida, raw);
    if (receita === 0) {
      // Reconstrução: bruta - deduções
      const bruta = sumRowsByPattern(dre, PATTERNS.receita_bruta, raw);
      const ded = sumRowsByPattern(dre, PATTERNS.deducoes, raw);
      receita = Math.abs(bruta) - Math.abs(ded);
    }
    receita = Math.abs(receita);

    const cmvRaw = sumRowsByPattern(dre, PATTERNS.cmv, raw);
    const cmv = -Math.abs(cmvRaw); // sempre negativo

    const despRaw = sumRowsByPattern(dre, PATTERNS.despesas, raw);
    const despesas = -Math.abs(despRaw);

    let resultado = sumRowsByPattern(dre, PATTERNS.resultado, raw);
    if (resultado === 0) {
      // fallback: receita + cmv + despesas
      resultado = receita + cmv + despesas;
    }

    const depreciacao = -Math.abs(sumRowsByPattern(dre, PATTERNS.depreciacao, raw));
    const amortizacao = -Math.abs(sumRowsByPattern(dre, PATTERNS.amortizacao, raw));
    let resOp = sumRowsByPattern(dre, PATTERNS.resultado_op, raw);
    if (resOp === 0) resOp = resultado;
    const ebitda = resOp - depreciacao - amortizacao; // soma o módulo de volta

    // ── BALANÇO ────────────────────────────────────────────────────────
    const ativo_circulante = Math.abs(sumRowsByPattern(bal, PATTERNS.ativo_circulante, raw));
    const ativo_nao_circulante = Math.abs(sumRowsByPattern(bal, PATTERNS.ativo_nao_circulante, raw));
    const passivo_circulante = Math.abs(sumRowsByPattern(bal, PATTERNS.passivo_circulante, raw));
    const passivo_nao_circulante = Math.abs(sumRowsByPattern(bal, PATTERNS.passivo_nao_circulante, raw));
    const estoques = Math.abs(leafSum(bal, PATTERNS.estoques, raw));
    const disponivel = Math.abs(leafSum(bal, PATTERNS.disponivel, raw));

    // ── ENDIVIDAMENTO ──────────────────────────────────────────────────
    const divida_tributaria = Math.abs(leafSum(bal, PATTERNS.div_tributaria, raw));
    const divida_trabalhista = Math.abs(leafSum(bal, PATTERNS.div_trabalhista, raw));
    const divida_financeira = Math.abs(leafSum(bal, PATTERNS.div_financeira, raw));
    const fornecedores = Math.abs(leafSum(bal, PATTERNS.fornecedores, raw));
    const credores_rj = Math.abs(leafSum(bal, PATTERNS.credores_rj, raw));
    const conhecidas = divida_tributaria + divida_trabalhista + divida_financeira + fornecedores + credores_rj;
    const passivoTotal = passivo_circulante + passivo_nao_circulante;
    const outras_obrigacoes = Math.max(0, passivoTotal - conhecidas);
    const divida_total = conhecidas + outras_obrigacoes;

    return {
      mes: label,
      mesKey: key,
      receita_liquida: receita,
      cmv,
      despesas,
      resultado,
      ebitda,
      depreciacao,
      amortizacao,
      ativo_circulante,
      ativo_nao_circulante,
      passivo_circulante,
      passivo_nao_circulante,
      estoques,
      disponivel,
      divida_tributaria,
      divida_trabalhista,
      divida_financeira,
      fornecedores,
      credores_rj,
      outras_obrigacoes,
      divida_total,
      hasReceita: receita > 0,
      hasBalanco: ativo_circulante > 0 || passivo_circulante > 0 || divida_total > 0,
    };
  });
}

// ─── ENGINE DE CÁLCULO (indicadores derivados) ─────────────────────────────
const safeDiv = (a: number, b: number): number | null =>
  !b || !Number.isFinite(b) || b === 0 ? null : a / b;

export function computeIndicators(d: MonthlyDatum) {
  const cmvPct = safeDiv(Math.abs(d.cmv), d.receita_liquida);
  const cmvDespPct = safeDiv(Math.abs(d.cmv) + Math.abs(d.despesas), d.receita_liquida);
  const margemResultado = safeDiv(d.resultado, d.receita_liquida);
  const liquidez_corrente = safeDiv(d.ativo_circulante, d.passivo_circulante);
  const liquidez_seca = safeDiv(d.ativo_circulante - d.estoques, d.passivo_circulante);
  const liquidez_imediata = safeDiv(d.disponivel, d.passivo_circulante);
  const liquidez_geral = safeDiv(
    d.ativo_circulante + d.ativo_nao_circulante,
    d.passivo_circulante + d.passivo_nao_circulante,
  );
  return {
    cmvPct, cmvDespPct, margemResultado,
    liquidez_corrente, liquidez_seca, liquidez_imediata, liquidez_geral,
  };
}
