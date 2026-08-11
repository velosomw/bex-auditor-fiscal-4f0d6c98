// ─────────────────────────────────────────────────────────────────
// BEx AI Gateway fetch wrapper — retry com backoff exponencial
// ─────────────────────────────────────────────────────────────────
// Trata os erros transitórios do Lovable AI Gateway:
//   • 429 (rate-limit) — respeita Retry-After se enviado
//   • 502/503/504 (upstream/gateway timeout)
// Não retenta 4xx (exceto 429) nem 200/streaming.
// ─────────────────────────────────────────────────────────────────

export interface AIFetchOptions {
  /** Tentativas totais (incluindo a primeira). Default 3. */
  maxAttempts?: number;
  /** Backoff inicial em ms. Default 400. */
  baseDelayMs?: number;
  /** Teto de delay entre tentativas. Default 4000. */
  maxDelayMs?: number;
  /** Timeout por tentativa (AbortController). Default 120000. */
  perAttemptTimeoutMs?: number;
  /** Identificador para logging. */
  label?: string;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickDelay(attempt: number, base: number, cap: number, retryAfterHeader?: string | null) {
  if (retryAfterHeader) {
    const sec = Number(retryAfterHeader);
    if (Number.isFinite(sec) && sec > 0) return Math.min(cap, sec * 1000);
  }
  // exponencial com jitter (full jitter)
  const exp = Math.min(cap, base * Math.pow(2, attempt - 1));
  return Math.floor(Math.random() * exp);
}

/**
 * Faz fetch ao Lovable AI Gateway com retry/backoff transparente.
 * Retorna a `Response` da última tentativa (sucesso ou falha definitiva).
 */
export async function aiGatewayFetch(
  url: string,
  init: RequestInit,
  opts: AIFetchOptions = {},
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 400;
  const maxDelay = opts.maxDelayMs ?? 4000;
  const perAttemptTimeout = opts.perAttemptTimeoutMs ?? 120_000;
  const label = opts.label ?? "ai_gateway";

  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), perAttemptTimeout);

    // Combina o signal externo (se existir) com o nosso de timeout
    const externalSignal = init.signal;
    if (externalSignal) {
      if (externalSignal.aborted) ctrl.abort();
      else externalSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }

    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);

      if (res.ok || !RETRYABLE_STATUS.has(res.status)) {
        if (attempt > 1) {
          console.log(`[${label}] recuperado na tentativa ${attempt} status=${res.status}`);
        }
        return res;
      }

      // status retryável
      lastResponse = res;
      const retryAfter = res.headers.get("retry-after");
      // consome corpo p/ liberar conexão (Deno pode vazar sem isso)
      try { await res.text(); } catch { /* ignore */ }

      if (attempt < maxAttempts) {
        const delay = pickDelay(attempt, baseDelay, maxDelay, retryAfter);
        console.warn(`[${label}] tentativa ${attempt}/${maxAttempts} status=${res.status} → backoff ${delay}ms`);
        await sleep(delay);
        continue;
      }

      console.error(`[${label}] esgotou ${maxAttempts} tentativas — último status=${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const isAbort = (err as { name?: string })?.name === "AbortError";
      const msg = err instanceof Error ? err.message : String(err);

      if (attempt < maxAttempts) {
        const delay = pickDelay(attempt, baseDelay, maxDelay, null);
        console.warn(
          `[${label}] tentativa ${attempt}/${maxAttempts} ${isAbort ? "timeout/abort" : "network"}=${msg} → backoff ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }

      console.error(`[${label}] falha definitiva após ${maxAttempts} tentativas: ${msg}`);
      // Se temos uma resposta anterior, devolve; caso contrário, propaga
      if (lastResponse) return lastResponse;
      throw err;
    }
  }

  // safety net (não deveria chegar aqui)
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error(`[${label}] falha desconhecida`);
}
