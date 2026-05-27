/**
 * SINAIS — Política centralizada de sinal contábil (Onda 4).
 *
 * Princípio: preservar o SINAL NATIVO em todas as linhas durante a varredura,
 * consolidar o grupo, e só então aplicar `aplicarSinalFinal` no agregado.
 *
 * Buckets que recebem módulo no agregado final (planilha BEX):
 *   - receita_liquida  → POSITIVO (módulo)
 *   - cmv              → NEGATIVO (-módulo)
 *   - despesas         → NEGATIVO (-módulo)
 *   - despesas_financeiras → NEGATIVO (-módulo)
 *   - depreciacao      → NEGATIVO (-módulo)
 *   - amortizacao      → NEGATIVO (-módulo)
 *   - passivo_circulante / passivo_nao_circulante → POSITIVO (módulo)
 *   - dívidas (financeira/tributária/trabalhista/fornecedores/credores) → POSITIVO
 *
 * Buckets que preservam sinal nativo (nunca abs no agregado):
 *   - resultado, patrimonio_liquido, outras_nao_operacionais
 *
 * Esta política bate exatamente com o que `core.ts` já aplica em REF1_MAP
 * (todas as somas usam `Math.abs(v)` por categoria, exceto `resultado`/`PL`
 * que mantêm sinal). O módulo `sinais.ts` formaliza a regra e serve como
 * fonte canônica para `classifier.ts`, ondas futuras e novos buckets.
 */

export type SignedBucket =
  | "resultado" | "patrimonio_liquido" | "outras_nao_operacionais";

export type PositiveBucket =
  | "receita_liquida"
  | "passivo_circulante" | "passivo_nao_circulante"
  | "ativo_circulante"  | "ativo_nao_circulante"
  | "divida_financeira" | "divida_tributaria" | "divida_trabalhista"
  | "fornecedores" | "credores_rj" | "outras_obrigacoes"
  | "estoques" | "disponivel" | "contas_receber"
  | "imobilizado" | "realizavel_longo_prazo" | "investimentos" | "intangivel"
  | "receitas_financeiras";

export type NegativeBucket =
  | "cmv" | "despesas" | "despesas_financeiras"
  | "depreciacao" | "amortizacao";

export type Bucket = SignedBucket | PositiveBucket | NegativeBucket;

const POSITIVE = new Set<string>([
  "receita_liquida",
  "passivo_circulante","passivo_nao_circulante",
  "ativo_circulante","ativo_nao_circulante",
  "divida_financeira","divida_tributaria","divida_trabalhista",
  "fornecedores","credores_rj","outras_obrigacoes",
  "estoques","disponivel","contas_receber",
  "imobilizado","realizavel_longo_prazo","investimentos","intangivel",
  "receitas_financeiras",
]);

const NEGATIVE = new Set<string>([
  "cmv","despesas","despesas_financeiras","depreciacao","amortizacao",
]);

const SIGNED = new Set<string>([
  "resultado","patrimonio_liquido","outras_nao_operacionais",
]);

/**
 * Aplica política de sinal **apenas** no agregado final do grupo.
 * Não use em valores de linha individuais — destrói contas redutoras.
 */
export function aplicarSinalFinal(bucket: string, valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  if (SIGNED.has(bucket)) return valor;       // mantém sinal nativo
  if (POSITIVE.has(bucket)) return Math.abs(valor);
  if (NEGATIVE.has(bucket)) return -Math.abs(valor);
  return valor;                                // bucket desconhecido → preserva
}

/** Retorna o sinal canônico esperado para o bucket após consolidação. */
export function sinalCanonico(bucket: string): "positivo" | "negativo" | "nativo" {
  if (NEGATIVE.has(bucket)) return "negativo";
  if (POSITIVE.has(bucket)) return "positivo";
  return "nativo";
}
