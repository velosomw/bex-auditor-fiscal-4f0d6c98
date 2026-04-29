/**
 * Kanitz Calculator — Serviço canônico (single source of truth)
 * Implementa as Camadas 1–5 do MD de Revalidação Kanitz.
 *
 * Fórmula oficial (não pode ser alterada):
 *   K = 0,05·RL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·GE
 *
 * Camadas:
 *   1. Padronização (KanitzNormalizedInput)
 *   2. Cálculo dos indicadores com validações
 *   3. Cálculo Kanitz (FI)
 *   4. Classificação de Risco
 *   5. Auditoria/origem + regras de bloqueio
 */

import type { ParsedFinancialData } from "@/services/auditAIService";

/* ───── Camada 1 — Estruturas ───── */

export type KanitzClassification = "saudavel" | "atencao" | "insolvencia" | "bloqueado";
export type KanitzOrigin = "ocr" | "ia" | "manual" | "integracao";

export interface KanitzNormalizedInput {
  periodo: string;
  ac: number;          // Ativo Circulante
  pc: number;          // Passivo Circulante
  rlp: number;         // Realizável a Longo Prazo
  elp: number;         // Exigível a Longo Prazo (= Passivo Não Circulante)
  pl: number;          // Patrimônio Líquido
  estoques: number;
  lucroLiquido: number;
  // Auditoria de origem (Camada 5)
  origem: KanitzOrigin;
  confianca: number;   // 0..1
  contasFaltantes: number;
  totalContasEsperadas: number;
}

export interface KanitzIndicators {
  rl: number;   // RL = Lucro Líquido / PL  (Rentabilidade do PL)
  lg: number;   // LG = (AC + RLP) / (PC + ELP)  Liquidez Geral
  ls: number;   // LS = (AC − Estoques) / PC     Liquidez Seca
  lc: number;   // LC = AC / PC                  Liquidez Corrente
  ge: number;   // GE = (PC + ELP) / PL          Grau de Endividamento (POSITIVO conforme MD)
}

export interface KanitzValidation {
  rl: "ok" | "fora_intervalo";
  lg: "ok" | "negativo";
  ls: "ok" | "negativo";
  lc: "ok" | "negativo";
  ge: "ok" | "negativo_critico";
}

export interface KanitzBlock {
  blocked: boolean;
  reasons: string[];
}

export interface KanitzResultV2 {
  periodo: string;
  input: KanitzNormalizedInput;
  indicators: KanitzIndicators;
  validation: KanitzValidation;
  k: number;
  classificacao: KanitzClassification;
  block: KanitzBlock;
  // Comparação Excel (Camada 5 — opcional)
  kExcel?: number;
  diff?: number;
  diffStatus?: "OK" | "WARNING" | "ERROR" | "CRITICAL";
}

/* ───── Helpers de extração (mantém compatibilidade com ParsedFinancialData) ───── */

function findValue(parsed: ParsedFinancialData, keyword: string, year: string): number {
  const allRows = [...parsed.balanco, ...parsed.dre];
  const k = keyword.toLowerCase();
  const row = allRows.find(r =>
    (r.conta?.toLowerCase().includes(k)) || (r.descricao?.toLowerCase().includes(k))
  );
  return Number(row?.values?.[year]) || 0;
}

/**
 * Camada 1 — extrai input normalizado a partir de ParsedFinancialData (OCR pipeline).
 */
export function extractFromParsed(
  parsed: ParsedFinancialData,
  year: string,
  origem: KanitzOrigin = "ocr"
): KanitzNormalizedInput {
  const ac = Math.abs(findValue(parsed, "total do ativo circulante", year) || findValue(parsed, "ativo circulante", year));
  const pc = Math.abs(findValue(parsed, "total do passivo circulante", year) || findValue(parsed, "passivo circulante", year));
  const elp = Math.abs(
    findValue(parsed, "total do passivo não circulante", year) ||
    findValue(parsed, "passivo nao circulante", year) ||
    findValue(parsed, "passivo não circulante", year) ||
    findValue(parsed, "exigível a longo prazo", year)
  );
  const rlp = Math.abs(findValue(parsed, "realizável a longo prazo", year) || findValue(parsed, "realizavel", year));
  // PL preserva o sinal — necessário para detectar PL negativo (bloqueio MD)
  const plRaw =
    findValue(parsed, "total do patrimônio", year) ||
    findValue(parsed, "patrimonio líquido", year) ||
    findValue(parsed, "patrimônio líquido", year);
  const pl = plRaw;
  const estoques = Math.abs(findValue(parsed, "estoque", year));
  const lucroLiquido = findValue(parsed, "resultado do exercício", year) || findValue(parsed, "lucro líquido", year);

  // Contagem rudimentar de contas faltantes
  const expected = ["ac", "pc", "elp", "pl", "estoques"];
  const got = [ac, pc, elp, pl, estoques].filter(v => v !== 0).length;
  const faltantes = expected.length - got;

  return {
    periodo: year,
    ac, pc, rlp, elp, pl, estoques, lucroLiquido,
    origem,
    confianca: 0.85,
    contasFaltantes: faltantes,
    totalContasEsperadas: expected.length,
  };
}

/**
 * Camada 1 — extrai a partir do bloco aiAnalysis (fallback IA).
 */
export function extractFromAiAnalysis(aiAnalysis: any, periodo = "Análise IA"): KanitzNormalizedInput | null {
  const ef = aiAnalysis?.diagnostico?.estruturaFinanceira;
  if (!ef) return null;
  return {
    periodo,
    ac: Number(ef.ativo_circulante) || 0,
    pc: Number(ef.passivo_circulante) || 0,
    elp: Number(ef.passivo_nao_circulante) || 0,
    rlp: 0,
    pl: Number(ef.patrimonio_liquido) || 0,
    estoques: Number(ef.estoques) || 0,
    lucroLiquido: Number(ef.lucro_liquido) || 0,
    origem: "ia",
    confianca: 0.75,
    contasFaltantes: 0,
    totalContasEsperadas: 5,
  };
}

/* ───── Camada 5 — Regras de bloqueio ───── */

export function checkBlocks(input: KanitzNormalizedInput): KanitzBlock {
  const reasons: string[] = [];
  if (input.pl <= 0) reasons.push("PL ≤ 0 (patrimônio líquido nulo ou negativo)");
  if (input.pc === 0) reasons.push("PC = 0 (passivo circulante ausente)");
  const pctFaltante = input.totalContasEsperadas > 0
    ? input.contasFaltantes / input.totalContasEsperadas
    : 0;
  if (pctFaltante > 0.20) {
    reasons.push(`Dados incompletos: ${(pctFaltante * 100).toFixed(0)}% das contas faltantes`);
  }
  return { blocked: reasons.length > 0, reasons };
}

/* ───── Camada 2 — Indicadores ───── */

export function computeIndicators(input: KanitzNormalizedInput): KanitzIndicators {
  const { ac, pc, rlp, elp, pl, estoques, lucroLiquido } = input;
  const rl = pl !== 0 ? lucroLiquido / pl : 0;
  const lg = (pc + elp) !== 0 ? (ac + rlp) / (pc + elp) : 0;
  const ls = pc !== 0 ? (ac - estoques) / pc : 0;
  const lc = pc !== 0 ? ac / pc : 0;
  const ge = pl !== 0 ? (pc + elp) / pl : 0;
  return { rl, lg, ls, lc, ge };
}

export function validateIndicators(ind: KanitzIndicators): KanitzValidation {
  return {
    rl: ind.rl >= -5 && ind.rl <= 5 ? "ok" : "fora_intervalo",
    lg: ind.lg >= 0 ? "ok" : "negativo",
    ls: ind.ls >= 0 ? "ok" : "negativo",
    lc: ind.lc >= 0 ? "ok" : "negativo",
    ge: ind.ge >= 0 ? "ok" : "negativo_critico",
  };
}

/* ───── Camada 3 — Cálculo K ───── */

export function computeK(ind: KanitzIndicators): number {
  return (0.05 * ind.rl) + (1.65 * ind.lg) + (3.55 * ind.ls) - (1.06 * ind.lc) - (0.33 * ind.ge);
}

/* ───── Camada 4 — Classificação ───── */

export function classifyK(k: number): KanitzClassification {
  if (k > 0) return "saudavel";
  if (k > -3) return "atencao";
  return "insolvencia";
}

/* ───── Camada 5 — Cross-check Excel ───── */

export function compareWithExcel(k: number, kExcel?: number): { diff?: number; status?: KanitzResultV2["diffStatus"] } {
  if (kExcel === undefined || kExcel === null) return {};
  const diff = Math.abs(k - kExcel);
  let status: KanitzResultV2["diffStatus"];
  if (diff < 0.01) status = "OK";
  else if (diff < 0.1) status = "WARNING";
  else if (diff <= 0.5) status = "ERROR";
  else status = "CRITICAL";
  return { diff, status };
}

/* ───── Pipeline completo ───── */

export function calcKanitz(input: KanitzNormalizedInput, kExcel?: number): KanitzResultV2 {
  const block = checkBlocks(input);
  const indicators = computeIndicators(input);
  const validation = validateIndicators(indicators);
  const k = block.blocked ? 0 : computeK(indicators);
  const classificacao: KanitzClassification = block.blocked ? "bloqueado" : classifyK(k);
  const cmp = compareWithExcel(k, kExcel);
  return { periodo: input.periodo, input, indicators, validation, k, classificacao, block, kExcel, diff: cmp.diff, diffStatus: cmp.status };
}

/**
 * Pipeline em lote: ParsedFinancialData → resultados por período.
 * Se OCR não retornar nada usável, faz fallback no aiAnalysis.
 */
export function buildKanitzSeries(
  parsed: ParsedFinancialData | null | undefined,
  aiAnalysis?: any
): KanitzResultV2[] {
  const out: KanitzResultV2[] = [];
  if (parsed && parsed.years?.length) {
    for (const year of parsed.years) {
      const input = extractFromParsed(parsed, year, "ocr");
      out.push(calcKanitz(input));
    }
  }
  // Fallback: nenhum período produziu dado válido OU todos vieram bloqueados → tenta IA
  const allBlocked = out.length > 0 && out.every(r => r.block.blocked || (r.k === 0 && r.indicators.lc === 0));
  if (out.length === 0 || allBlocked) {
    const aiInput = extractFromAiAnalysis(aiAnalysis);
    if (aiInput) {
      // Se o AI já forneceu fatorInsolvencia explicitamente, usa-o como kExcel cross-check
      const kAi = Number(aiAnalysis?.kanitz?.fatorInsolvencia);
      const result = calcKanitz(aiInput, isFinite(kAi) ? kAi : undefined);
      return [result];
    }
  }
  return out;
}

/* ───── UI helpers ───── */

export const KANITZ_CLASS_META: Record<KanitzClassification, { label: string; icon: string; color: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  saudavel:    { label: "SAUDÁVEL",     icon: "🟢", color: "hsl(150,70%,42%)", tone: "ok" },
  atencao:     { label: "ATENÇÃO",      icon: "🟡", color: "hsl(34,95%,55%)",  tone: "warn" },
  insolvencia: { label: "INSOLVÊNCIA",  icon: "🔴", color: "hsl(0,75%,55%)",   tone: "danger" },
  bloqueado:   { label: "BLOQUEADO",    icon: "⛔", color: "hsl(220,10%,55%)", tone: "neutral" },
};

/** Mapeia classificação MD para os labels antigos (compat) */
export function mapToLegacyClass(c: KanitzClassification): "solvente" | "penumbra" | "insolvente" {
  if (c === "saudavel") return "solvente";
  if (c === "insolvencia" || c === "bloqueado") return "insolvente";
  return "penumbra";
}
