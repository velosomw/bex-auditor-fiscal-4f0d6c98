// ─────────────────────────────────────────────────────────────────
// BEx Model Router — roteamento automático Gemini × GPT-5
// ─────────────────────────────────────────────────────────────────
// Regra geral:
//   • Padrão = Gemini (custo baixo, multimodal, contexto longo)
//   • GPT-5 = SOMENTE para análise de risco AVANÇADO (criticidade ALTA)
//
// Critérios para escalar para GPT-5 (criticality = "high"):
//   • Balanço desbalanceado (Ativo ≠ Passivo + PL)
//   • Patrimônio Líquido negativo
//   • Liquidez Corrente < 1
//   • Endividamento Geral > 80%
//   • Score Kanitz < -3 (insolvência iminente)
// ─────────────────────────────────────────────────────────────────

export type ProcessKey =
  | "ocr_parse"          // Leitura/parse de PDF, balancete, DRE
  | "structure_extract"  // Estruturação de dados via Document AI
  | "audit_insights"     // Geração de insights da auditoria
  | "risk_advanced"      // Análise de risco avançado (RJ, solvência)
  | "chat_assistant"     // Chat do Auditor IA
  | "embeddings"         // Vetorização para busca semântica
  | "report_generation"; // Geração de relatórios finais

export type Criticality = "low" | "medium" | "high";

export interface RoutingDecision {
  model: string;
  provider: "google" | "openai";
  serviceTag: string;
  reason: string;
  criticality: Criticality;
}

// Matriz oficial de roteamento — fonte única da verdade
export const ROUTING_MATRIX: Record<
  ProcessKey,
  Record<Criticality, { model: string; provider: "google" | "openai"; serviceTag: string }>
> = {
  ocr_parse: {
    low:    { model: "google/gemini-2.0-flash",        provider: "google", serviceTag: "gemini_2_flash" },
    medium: { model: "google/gemini-2.0-flash",        provider: "google", serviceTag: "gemini_2_flash" },
    high:   { model: "google/gemini-1.5-pro",          provider: "google", serviceTag: "gemini_pro" },
  },
  structure_extract: {
    low:    { model: "google/gemini-2.0-flash",        provider: "google", serviceTag: "gemini_2_flash" },
    medium: { model: "google/gemini-2.0-flash",        provider: "google", serviceTag: "gemini_2_flash" },
    high:   { model: "google/gemini-1.5-pro",          provider: "google", serviceTag: "gemini_pro" },
  },
  audit_insights: {
    low:    { model: "google/gemini-2.0-flash",       provider: "google", serviceTag: "gemini_2_flash" },
    medium: { model: "google/gemini-1.5-pro",         provider: "google", serviceTag: "gemini_pro" },
    high:   { model: "openai/gpt-4o",                 provider: "openai", serviceTag: "gpt4o" },
  },
  risk_advanced: {
    // Risco avançado SEMPRE usa GPT-4o (estabilidade e raciocínio profundo)
    low:    { model: "openai/gpt-4o-mini", provider: "openai", serviceTag: "gpt4o_mini" },
    medium: { model: "openai/gpt-4o",      provider: "openai", serviceTag: "gpt4o" },
    high:   { model: "openai/gpt-4o",      provider: "openai", serviceTag: "gpt4o" },
  },
  chat_assistant: {
    low:    { model: "google/gemini-2.0-flash",       provider: "google", serviceTag: "gemini_2_flash" },
    medium: { model: "google/gemini-2.0-flash",       provider: "google", serviceTag: "gemini_2_flash" },
    high:   { model: "google/gemini-1.5-pro",         provider: "google", serviceTag: "gemini_pro" },
  },
  embeddings: {
    low:    { model: "google/text-embedding-004", provider: "google", serviceTag: "embedding" },
    medium: { model: "google/text-embedding-004", provider: "google", serviceTag: "embedding" },
    high:   { model: "google/text-embedding-004", provider: "google", serviceTag: "embedding" },
  },
  report_generation: {
    low:    { model: "google/gemini-2.0-flash",       provider: "google", serviceTag: "gemini_2_flash" },
    medium: { model: "google/gemini-1.5-pro",         provider: "google", serviceTag: "gemini_pro" },
    high:   { model: "openai/gpt-4o",                 provider: "openai", serviceTag: "gpt4o" },
  },
};

// ─────────────────────────────────────────────────────────────────
// Fallback chain — usado pelo ai-fetch quando um preview falha (5xx/404).
// Mantém estabilidade caso modelos 3.x em preview fiquem indisponíveis.
// ─────────────────────────────────────────────────────────────────
export const MODEL_FALLBACK: Record<string, string[]> = {
  "google/gemini-1.5-pro":   ["openai/gpt-4o"],
  "google/gemini-2.0-flash": ["google/gemini-1.5-pro", "google/gemini-1.5-flash"],
  "openai/gpt-4o":           ["google/gemini-1.5-pro"],
};

export interface RiskSignals {
  balanceValid?: boolean;
  patrimonioLiquido?: number | null;
  liquidezCorrente?: number | null;
  endividamentoGeral?: number | null;
  kanitzScore?: number | null;
}

/**
 * Calcula a criticidade com base nos sinais de risco financeiro.
 * Esta é a função-chave que decide se o pipeline escala para GPT-5.
 */
export function computeCriticality(signals: RiskSignals): Criticality {
  const reasons: string[] = [];

  if (signals.balanceValid === false) reasons.push("balanco_desbalanceado");
  if (typeof signals.patrimonioLiquido === "number" && signals.patrimonioLiquido <= 0) reasons.push("pl_negativo");
  if (typeof signals.liquidezCorrente === "number" && signals.liquidezCorrente < 1) reasons.push("liquidez_critica");
  if (typeof signals.endividamentoGeral === "number" && signals.endividamentoGeral > 80) reasons.push("endividamento_critico");
  if (typeof signals.kanitzScore === "number" && signals.kanitzScore < -3) reasons.push("kanitz_insolvencia");

  // 2+ sinais críticos → HIGH (escala para GPT-5 onde aplicável)
  if (reasons.length >= 2) return "high";
  // 1 sinal crítico → MEDIUM (Gemini Pro)
  if (reasons.length === 1) return "medium";
  // Nenhum sinal → LOW (Gemini Flash/Flash-Lite, mais barato)
  return "low";
}

/**
 * Seleciona o modelo a ser usado para um processo específico.
 * Aplica override quando o ambiente force um provedor (BEX_FORCE_PROVIDER).
 */
export function selectModel(
  process: ProcessKey,
  criticality: Criticality = "medium",
  signals?: RiskSignals,
): RoutingDecision {
  const finalCriticality: Criticality = signals ? computeCriticality(signals) : criticality;
  const entry = ROUTING_MATRIX[process][finalCriticality];

  // Override de ambiente — útil para testes/cost-control emergencial
  const force = (typeof Deno !== "undefined" ? Deno.env.get("BEX_FORCE_PROVIDER") : undefined) as
    | "google"
    | "openai"
    | undefined;

  let model = entry.model;
  let provider = entry.provider;
  let serviceTag = entry.serviceTag;
  let reason = `process=${process} criticality=${finalCriticality}`;

  if (force && force !== entry.provider) {
    // Faz fallback para um modelo equivalente do provider forçado
    const fallback =
      force === "openai"
        ? { model: "openai/gpt-5-mini", provider: "openai" as const, serviceTag: "gpt5_mini" }
        : { model: "google/gemini-3-flash-preview", provider: "google" as const, serviceTag: "gemini_flash" };
    model = fallback.model;
    provider = fallback.provider;
    serviceTag = fallback.serviceTag;
    reason += ` force=${force}`;
  }

  return { model, provider, serviceTag, reason, criticality: finalCriticality };
}
