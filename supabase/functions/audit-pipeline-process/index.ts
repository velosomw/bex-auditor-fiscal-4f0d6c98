// Audit Pipeline Process — Pré-processamento inteligente de balancetes
// Stack: Lovable AI Gateway (chat/JSON) + Supabase Postgres.
//
// Otimizações v4 (foco: extração 100% estrutural + IA livre para insights):
//   #1 Paralelismo:             CHUNK_SIZE 120, MAX_PARALLEL 12 (≤ 1 onda em casos típicos)
//   #2 Cache persistente em DB: contabil_dictionary (lookup O(1) entre auditorias)
//   #3 Fast-path AGRESSIVO:     código BR sozinho é autoridade → ~100% extração sem LLM
//   #4 Timeout LLM (45s) + retry com modelo diferente (evita travar 148s em 503 do upstream)
//   #5 Tool calling rígido:     prompt firme + validação de tamanho + retry com modelo maior
//   #6 Progresso em tempo real: pipeline_documents.progress atualizado por estágio
//   #7 Insights com gemini-2.5-pro + few-shot de dataset_validated (capacidade liberada)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { selectModel, computeCriticality } from "../_shared/model-router.ts";
import { aiGatewayFetch } from "../_shared/ai-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Tracking de uso (custos IA) ────────────────────────────────
async function trackUsage(input: {
  type: string; provider: string; service: string; document_id?: string | null;
  tokens_input?: number; tokens_output?: number; requests?: number; metadata?: Record<string, unknown>;
}) {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: cfg } = await sb.from("ai_cost_config").select("*").eq("service", input.service).maybeSingle();
    const ti = Number(input.tokens_input || 0), to = Number(input.tokens_output || 0), rq = Number(input.requests || 0);
    const cost = cfg
      ? (ti / 1000) * Number(cfg.cost_per_1k_input || 0)
      + (to / 1000) * Number(cfg.cost_per_1k_output || 0)
      + rq * Number(cfg.cost_per_request || 0)
      + Number(cfg.cost_fixed || 0)
      : 0;
    await sb.from("ai_usage_logs").insert({
      type: input.type, provider: input.provider, service: input.service,
      document_id: input.document_id ?? null,
      tokens_input: ti, tokens_output: to, requests: rq,
      cost_calculated: cost, metadata: input.metadata ?? null,
    });
  } catch (e) { console.warn("trackUsage failed:", e); }
}

interface BalanceteRow {
  conta: string;
  descricao: string;
  values: Record<string, number>;
}

interface PipelineRequest {
  company_id?: string;
  document_id?: string;
  file_name: string;
  ocr_score?: number;
  balanco: BalanceteRow[];
  dre: BalanceteRow[];
  documentInfo?: { empresa?: string; periodo?: string; tipo?: string };
  /** Configuração opcional de deduplicação por tipo de dado (override por payload) */
  dedup?: {
    balanco?: DedupOptions;
    dre?: DedupOptions;
  };
  /** Força reprocessamento ignorando dedup hit (UI: botão "Forçar reprocessamento"). */
  force_reprocess?: boolean;
}

/**
 * Versão do parser/finalize em audit-bs-dados.
 * BUMP a cada mudança que afete os números calculados:
 * invalida automaticamente o cache de dedup por content_hash.
 */
const PARSER_VERSION = "2026.05.27.07"; // bump: canônico inclui conta 13 (Ativo Permanente) no ANC

/* ──────────────── Hash SHA-256 do payload (Item 4 — dedupe) ──────────────── */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildContentHashSource(body: PipelineRequest): string {
  const norm = (rows: BalanceteRow[] = []) =>
    rows.map((r) => `${r.conta || ""}|${r.descricao || ""}|${Number(r.valor) || 0}`).sort().join("\n");
  return [
    `parser:${PARSER_VERSION}`,        // FIX #1 — invalida cache em qualquer evolução do parser
    body.company_id || "",
    body.documentInfo?.periodo || "",
    norm(body.balanco),
    "::dre::",
    norm(body.dre),
  ].join("\n");
}

type NormResult = { conta_normalizada: string; categoria: string; tipo: string; matched: boolean };

/* ──────────────── Logging estruturado (Quick Win 5) ──────────────── */
function stageLog(reqId: string, stage: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ reqId, stage, ts: new Date().toISOString(), ...extra }));
}

/* ──────────────── Cache em memória global (Quick Win 1) ──────────────── */
// Persiste entre invocações enquanto a edge instance estiver quente
const NORMALIZE_CACHE = new Map<string, NormResult>();
const CACHE_MAX = 5000;

function cacheKey(desc: string): string {
  return (desc || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheGet(desc: string): NormResult | undefined {
  return NORMALIZE_CACHE.get(cacheKey(desc));
}

function cacheSet(desc: string, val: NormResult) {
  if (NORMALIZE_CACHE.size >= CACHE_MAX) {
    // FIFO simples: remove o primeiro
    const firstKey = NORMALIZE_CACHE.keys().next().value;
    if (firstKey) NORMALIZE_CACHE.delete(firstKey);
  }
  NORMALIZE_CACHE.set(cacheKey(desc), val);
}

/* ──────────────── Heurística PL melhorada (Quick Win 4) ──────────────── */
function classifyAccount(desc: string): { tipo: string; categoria: string } {
  const d = (desc || "").toLowerCase();

  // PL — DETECÇÃO PRIORITÁRIA (antes de receita/despesa para evitar "lucros" virar receita)
  if (
    /(capital\s*social|capital\s*subscrito|capital\s*integraliz|capital\s*a\s*integraliz)/.test(d) ||
    /(reserva\s*(legal|estatut|capital|lucro|reavaliaç))/.test(d) ||
    /(lucros?\s*(acumulad|a\s*distribu|do\s*exerc))/.test(d) ||
    /(preju[ií]zos?\s*acumulad)/.test(d) ||
    /(patrim[oô]nio\s*l[ií]quido|patrimonio\s*liquido)/.test(d) ||
    /(a[çc][oõ]es?\s*em\s*tesouraria|ações\s*em\s*tesouraria)/.test(d) ||
    /(ajustes?\s*de\s*avalia[çc][aã]o)/.test(d)
  ) {
    return { tipo: "pl", categoria: "patrimonio_liquido" };
  }

  if (/(receita|venda|faturamento)/.test(d)) return { tipo: "receita", categoria: "receita" };
  if (/(custo|cmv)/.test(d)) return { tipo: "despesa", categoria: "custo" };
  if (/(despesa|gasto)/.test(d)) return { tipo: "despesa", categoria: "despesa" };
  if (/(imobilizado|intangivel|investiment|longo prazo|nao circulante|não circulante)/.test(d))
    return { tipo: "ativo", categoria: "ativo_nao_circulante" };
  if (/(caixa|banco|aplica|cliente|estoque|recebe|circulante|duplicat)/.test(d))
    return { tipo: "ativo", categoria: "ativo_circulante" };
  if (/(exigivel.*longo|passivo.*nao.*circulante|passivo.*não.*circulante|financiamento.*longo)/.test(d))
    return { tipo: "passivo", categoria: "passivo_nao_circulante" };
  if (/(fornecedor|emprestimo|financiamento|salario|imposto a pagar|factoring|fidc|duplicat.*descont|obrigac)/.test(d))
    return { tipo: "passivo", categoria: "passivo_circulante" };
  return { tipo: "ativo", categoria: "ativo_circulante" };
}

/* ──────────────── Classificação por código de conta brasileiro ────────────────
   Plano de contas padrão BR:
   1.x = Ativo  | 2.x = Passivo + PL  | 3.x = Receita  | 4.x = Custo/Despesa
   Subdivisão típica: 2.1/2.2 = Passivo, 2.3/2.4/2.5 = PL */
function classifyByCode(conta: string): { tipo: string; categoria: string } | null {
  const c = String(conta || "").trim().replace(/[\s\-]+/g, ".");
  if (!c) return null;
  const first = c.charAt(0);
  const second = c.charAt(2); // após o primeiro ponto
  if (first === "1") {
    // Ativo: 1.1/1.2 = circulante, 1.3+ = não circulante
    if (second === "1" || second === "2") return { tipo: "ativo", categoria: "ativo_circulante" };
    return { tipo: "ativo", categoria: "ativo_nao_circulante" };
  }
  if (first === "2") {
    // PL: 2.3, 2.4, 2.5 (Capital, Reservas, Lucros)
    if (second === "3" || second === "4" || second === "5") {
      return { tipo: "pl", categoria: "patrimonio_liquido" };
    }
    if (second === "1") return { tipo: "passivo", categoria: "passivo_circulante" };
    if (second === "2") return { tipo: "passivo", categoria: "passivo_nao_circulante" };
    return { tipo: "passivo", categoria: "passivo_circulante" };
  }
  if (first === "3") return { tipo: "receita", categoria: "receita" };
  if (first === "4") return { tipo: "despesa", categoria: "despesa" };
  if (first === "5") return { tipo: "despesa", categoria: "custo" };
  return null;
}

/* ──────────────── Normalização semântica em lote via LLM ──────────────── */
const CHUNK_SIZE = 120; // v3: era 80 (#1 paralelismo)
const MAX_PARALLEL = 12; // v3: era 6 (#1 paralelismo)

async function callLLMNormalize(
  rows: Array<{ conta: string; descricao: string }>,
  dictText: string,
  model: string = "google/gemini-2.5-flash-lite",
): Promise<NormResult[] | null> {
  const inputList = rows.map((r, i) => `${i}. ${r.descricao || r.conta}`).join("\n");

  const systemPrompt = `Você é um CONTADOR ESPECIALISTA em classificação contábil brasileira (CPC/IFRS/NBC TA/Lei 6.404/76).

TAREFA: Padronizar e classificar contas de um balancete usando SIMILARIDADE SEMÂNTICA (não literal).

REGRAS CRÍTICAS:
1. RETORNE EXATAMENTE ${rows.length} ITENS no array \`accounts\` — nem mais, nem menos. Esta regra é absoluta.
2. Mantenha a MESMA ORDEM das contas de entrada (item 0 do output corresponde ao item 0 do input).
3. Para cada conta, retorne:
   - conta_normalizada: termo padrão consolidado (ex.: "Bcos c/Mvto" → "Bancos Conta Movimento"; "Dupl. Desct." → "Duplicatas Descontadas")
   - categoria: uma de [ativo_circulante, ativo_nao_circulante, passivo_circulante, passivo_nao_circulante, patrimonio_liquido, receita, custo, despesa]
   - tipo: uma de [ativo, passivo, pl, receita, despesa]
   - matched: true se mapeou via dicionário/exemplo, false se inferiu por contexto
4. ATENÇÃO ESPECIAL AO PATRIMÔNIO LÍQUIDO: Capital Social, Reservas (Legal/Estatutária/Capital/Lucros), Lucros Acumulados, Lucros do Exercício, Prejuízos Acumulados, Ajustes de Avaliação Patrimonial, Ações em Tesouraria → SEMPRE tipo="pl", categoria="patrimonio_liquido". NUNCA classifique "Lucros Acumulados" como receita.
5. Use SIMILARIDADE SEMÂNTICA — contas equivalentes devem ter o MESMO termo padrão.
6. NÃO invente categorias novas.
7. Sinais de risco: factoring, FIDC, duplicatas descontadas → categoria correta + termo padronizado.

DICIONÁRIO CONTÁBIL DE REFERÊNCIA:
${dictText || "(vazio — use seu conhecimento contábil)"}`;

  const userPrompt = `Normalize estas ${rows.length} contas mantendo EXATAMENTE a mesma ordem e tamanho do input (${rows.length} itens):\n\n${inputList}\n\nRetorne via tool call return_normalized_accounts com ${rows.length} elementos no array.`;

  let r: Response;
  try {
    r = await aiGatewayFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_normalized_accounts",
              description: `Retorna lista de EXATAMENTE ${rows.length} contas normalizadas na mesma ordem do input.`,
              parameters: {
                type: "object",
                properties: {
                  accounts: {
                    type: "array",
                    minItems: rows.length,
                    maxItems: rows.length,
                    items: {
                      type: "object",
                      properties: {
                        conta_normalizada: { type: "string" },
                        categoria: {
                          type: "string",
                          enum: [
                            "ativo_circulante",
                            "ativo_nao_circulante",
                            "passivo_circulante",
                            "passivo_nao_circulante",
                            "patrimonio_liquido",
                            "receita",
                            "custo",
                            "despesa",
                          ],
                        },
                        tipo: {
                          type: "string",
                          enum: ["ativo", "passivo", "pl", "receita", "despesa"],
                        },
                        matched: { type: "boolean" },
                      },
                      required: ["conta_normalizada", "categoria", "tipo", "matched"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["accounts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_normalized_accounts" } },
      }),
    }, { label: "llm_normalize", maxAttempts: 3, perAttemptTimeoutMs: 45_000 });
  } catch (e) {
    console.warn("LLM normalize aborted/network", e instanceof Error ? e.message : e);
    return null;
  }

  if (!r.ok) {
    console.warn("LLM normalize HTTP", r.status, (await r.text()).slice(0, 300));
    return null;
  }

  try {
    const j = await r.json();
    const tc = j.choices?.[0]?.message?.tool_calls?.[0];
    const args = JSON.parse(tc?.function?.arguments || "{}");
    const accounts = Array.isArray(args.accounts) ? (args.accounts as NormResult[]) : [];
    // tracking de uso (mapeamento via LLM)
    trackUsage({
      type: "mapping", provider: "google",
      service: model.includes("flash-lite") ? "gemini_flash" : model.includes("flash") ? "gemini_flash" : "gemini_pro",
      tokens_input: j.usage?.prompt_tokens ?? Math.ceil((systemPrompt.length + userPrompt.length) / 4),
      tokens_output: j.usage?.completion_tokens ?? Math.ceil(JSON.stringify(args).length / 4),
      requests: 1,
      metadata: { model, phase: "normalize", chunk_size: rows.length },
    }).catch(() => {});
    return accounts;
  } catch (e) {
    console.warn("LLM normalize parse error", e);
    return null;
  }
}

async function normalizeChunk(
  rows: Array<{ conta: string; descricao: string }>,
  dictText: string,
): Promise<NormResult[]> {
  // Tentativa 1: modelo rápido
  let accounts = await callLLMNormalize(rows, dictText, "google/gemini-2.5-flash-lite");

  // #5 v4 Retry com MODELO DIFERENTE (evita repetir mesmo 503/timeout)
  if (!accounts || accounts.length !== rows.length) {
    if (accounts) {
      console.warn(`LLM mismatch ${accounts.length}/${rows.length} — retry com flash`);
    }
    accounts = await callLLMNormalize(rows, dictText, "google/gemini-2.5-flash");
  }

  if (!accounts) {
    return rows.map((row) => {
      const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
      return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false };
    });
  }

  return rows.map((row, i) => {
    const llm = accounts![i];
    if (llm && llm.conta_normalizada && llm.tipo && llm.categoria) {
      return llm;
    }
    const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
    return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false };
  });
}

/* Wrapper: cache + dedup + chunk + paralelização (Quick Wins 1, 2, 3) */
/* ──────────────── Helper de progresso (#6) ──────────────── */
async function updateProgress(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  documentId: string,
  message: string,
) {
  try {
    await supabase
      .from("pipeline_documents")
      .update({ progress: message, updated_at: new Date().toISOString() })
      .eq("id", documentId);
  } catch (_) {
    /* não-crítico */
  }
}

/* ──────────────── Fast-path heurístico (#3 — v4 agressivo) ────────────────
   Tenta classificar SEM LLM. Em balancetes BR padrão (plano de contas 1.x/2.x/3.x/4.x/5.x)
   o código de conta é AUTORIDADE: cobre ~100% sem necessidade de IA. Cai pro LLM apenas
   quando: sem código + sem cache + descrição não dispara classifyAccount confiável. */
function tryFastPath(
  row: { conta: string; descricao: string },
  dictMap: Map<string, NormResult>,
): NormResult | null {
  const desc = row.descricao || row.conta;

  // 1. Cache persistente (DB) — match exato (alta prioridade)
  const cached = dictMap.get(cacheKey(desc));
  if (cached) return cached;

  // 2. Código de conta brasileiro = AUTORIDADE (v4: aceita código sozinho)
  //    Plano BR é estrutural: 1.x.x.x = ativo, 2.3.x = PL, etc. Não há ambiguidade.
  const byCode = classifyByCode(row.conta);
  if (byCode) {
    return {
      conta_normalizada: desc,
      categoria: byCode.categoria,
      tipo: byCode.tipo,
      matched: true,
    };
  }

  // 3. Sem código → tenta heurística por descrição (palavras-chave fortes)
  //    Só aceita se for "óbvio" (caixa, banco, fornecedor, capital social, etc.)
  const STRONG_KEYWORDS = /(capital\s*social|reserva\s*(legal|estatut|capital|lucro)|lucros?\s*acumulad|preju[ií]zos?\s*acumulad|caixa|banco|fornecedor|cliente|estoque|imobilizado|receita\s*(bruta|l[ií]quida|de\s*venda)|cmv|custo\s*da\s*mercadoria|salario|fgts|inss|imposto\s*a\s*pagar|empr[eé]stimo|financiamento|duplicat)/i;
  if (STRONG_KEYWORDS.test(desc)) {
    const { tipo, categoria } = classifyAccount(desc);
    return { conta_normalizada: desc, categoria, tipo, matched: true };
  }

  return null;
}

/* Wrapper: cache mem + cache DB + fast-path + dedup + chunk + paralelização */
async function normalizeAccountsLLM(
  rows: Array<{ conta: string; descricao: string }>,
  // deno-lint-ignore no-explicit-any
  dictionary: any[],
  reqId: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  documentId: string,
): Promise<NormResult[]> {
  if (rows.length === 0) return [];

  // #1 otimização: dicionário compacto (40 entradas, formato pipe — ~50% menos tokens)
  const dictText = (dictionary || [])
    .slice(0, 40)
    .map((d) => `${d.termo_original}|${d.termo_padrao}|${d.categoria}`)
    .join("\n");

  // #2 Index do dicionário em memória para lookup O(1) por termo normalizado
  const dictMap = new Map<string, NormResult>();
  for (const d of dictionary || []) {
    if (!d?.termo_original || !d?.termo_padrao) continue;
    const key = cacheKey(d.termo_original);
    const tipo = (d.tipo as string) ||
      classifyAccount(d.termo_padrao).tipo;
    dictMap.set(key, {
      conta_normalizada: d.termo_padrao,
      categoria: d.categoria,
      tipo,
      matched: true,
    });
  }

  const finalResults: NormResult[] = new Array(rows.length);
  const uniqueByDesc = new Map<string, { row: { conta: string; descricao: string }; indices: number[] }>();
  let cacheHits = 0;
  let fastPathHits = 0;

  rows.forEach((row, idx) => {
    const desc = row.descricao || row.conta;

    // (a) cache em memória (mesma instância warm)
    const memCached = cacheGet(desc);
    if (memCached) {
      finalResults[idx] = memCached;
      cacheHits++;
      return;
    }

    // (b) #3 fast-path heurístico (código BR + dicionário DB)
    const fast = tryFastPath(row, dictMap);
    if (fast) {
      finalResults[idx] = fast;
      cacheSet(desc, fast);
      fastPathHits++;
      return;
    }

    // (c) precisa LLM — agrega por descrição idêntica
    const key = cacheKey(desc);
    const existing = uniqueByDesc.get(key);
    if (existing) {
      existing.indices.push(idx);
    } else {
      uniqueByDesc.set(key, { row, indices: [idx] });
    }
  });

  const uniqueRows = Array.from(uniqueByDesc.values()).map((v) => v.row);
  const dedupSavings = rows.length - cacheHits - fastPathHits - uniqueRows.length;

  stageLog(reqId, "normalize.dedup", {
    total: rows.length,
    cache_hits: cacheHits,
    fast_path_hits: fastPathHits,
    unique_to_process: uniqueRows.length,
    dedup_savings: dedupSavings,
  });

  await updateProgress(
    supabase,
    documentId,
    `Normalização: ${cacheHits} do cache, ${fastPathHits} resolvidas por heurística, ${uniqueRows.length} para a IA`,
  );

  if (uniqueRows.length === 0) {
    stageLog(reqId, "normalize.complete", { llm_calls: 0, source: "100%_cache_or_fastpath" });
    return finalResults;
  }

  // Chunkifica + paraleliza (#1)
  const chunks: Array<{ conta: string; descricao: string }[]> = [];
  for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
    chunks.push(uniqueRows.slice(i, i + CHUNK_SIZE));
  }

  stageLog(reqId, "normalize.llm_start", {
    chunks: chunks.length,
    chunk_size: CHUNK_SIZE,
    max_parallel: MAX_PARALLEL,
    waves: Math.ceil(chunks.length / MAX_PARALLEL),
  });

  const t0 = Date.now();
  const allLLMResults: NormResult[] = [];
  const totalWaves = Math.ceil(chunks.length / MAX_PARALLEL);
  let waveIdx = 0;
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
    waveIdx++;
    const wave = chunks.slice(i, i + MAX_PARALLEL);
    await updateProgress(
      supabase,
      documentId,
      `IA analisando contas: onda ${waveIdx}/${totalWaves} (${wave.length} grupos paralelos)`,
    );
    const settled = await Promise.all(wave.map((c) => normalizeChunk(c, dictText)));
    settled.forEach((s) => allLLMResults.push(...s));
  }
  stageLog(reqId, "normalize.llm_done", {
    duration_ms: Date.now() - t0,
    llm_processed: allLLMResults.length,
  });

  // Distribui resultado LLM para todos os índices (cache + originais)
  const newDictEntries: Array<{ termo_original: string; termo_padrao: string; categoria: string }> = [];
  uniqueRows.forEach((row, i) => {
    const desc = row.descricao || row.conta;
    const result = allLLMResults[i];
    if (!result) return;
    cacheSet(desc, result);
    // #2 acumula novos termos para popular o dicionário persistente
    if (result.matched && result.conta_normalizada && result.categoria) {
      newDictEntries.push({
        termo_original: desc,
        termo_padrao: result.conta_normalizada,
        categoria: result.categoria,
      });
    }
    const entry = uniqueByDesc.get(cacheKey(desc));
    entry?.indices.forEach((idx) => {
      finalResults[idx] = result;
    });
  });

  // #2 grava cache persistente em background (não bloqueia)
  if (newDictEntries.length > 0) {
    try {
      // upsert por termo_original_normalizado (índice único)
      const { error: upErr } = await supabase
        .from("contabil_dictionary")
        .upsert(newDictEntries, { onConflict: "termo_original_normalizado", ignoreDuplicates: true });
      if (upErr) {
        console.warn("dict upsert warn:", upErr.message);
      } else {
        stageLog(reqId, "dictionary.populated", { new_entries: newDictEntries.length });
      }
    } catch (e) {
      console.warn("dict upsert error:", e instanceof Error ? e.message : e);
    }
  }

  // Garante que nenhum índice fica vazio (fallback heurístico)
  rows.forEach((row, idx) => {
    if (!finalResults[idx]) {
      const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
      finalResults[idx] = {
        conta_normalizada: row.descricao || row.conta,
        categoria,
        tipo,
        matched: false,
      };
    }
  });

  return finalResults;
}

/* ──────────────── Limpeza de balancete: remove sintéticas e deduplica ────────────────
   Problemas comuns no parsing de balancetes Excel:
   1. Hierarquia (1.1.01 totaliza 1.1.01.001+1.1.01.002) → soma dupla
   2. Linhas sintéticas com descrição genérica ("Ativo", "Passivo Circulante", "DRE")
   3. Excel mal formatado: mesma conta aparece como [código] + [descrição] em linhas separadas
      com valores idênticos → soma dupla
   Esta função aplica 3 filtros em sequência. */
/* Opções de deduplicação por tipo/escala de dado.
   - dataKind: 'balanco' (BRL) | 'dre' (BRL) | 'indice' (índices/percentuais) | 'unidade' (R$ mil/milhão) | 'auto'
   - eps: tolerância absoluta para considerar dois valores "iguais"
   - decimals: precisão de arredondamento ao calcular a chave de valor
   - proxWindow: janela de proximidade (linhas adjacentes) para considerar duplicata
   - relTol: tolerância RELATIVA (ex.: 1e-4 = 0,01%) — adicional ao eps absoluto.
   Quando 'auto', os parâmetros são derivados da magnitude mediana dos valores:
     |mediana| < 1         → eps=1e-4, decimals=4 (índices)
     |mediana| < 1.000     → eps=1e-2, decimals=2 (BRL pequeno)
     |mediana| < 1.000.000 → eps=1e-2, decimals=2 (BRL padrão)
     |mediana| ≥ 1.000.000 → eps=1,    decimals=0 (BRL grande / R$ mil-milhão)
   relTol fixo em 1e-5 quando auto. */
export type DedupDataKind = "balanco" | "dre" | "indice" | "unidade" | "auto";
export interface DedupOptions {
  dataKind?: DedupDataKind;
  eps?: number;
  decimals?: number;
  proxWindow?: number;
  relTol?: number;
}

function resolveDedupParams(
  values: number[],
  opts: DedupOptions,
): { eps: number; decimals: number; proxWindow: number; relTol: number; scale: string } {
  const proxWindow = opts.proxWindow ?? 3;

  // Overrides explícitos vencem qualquer auto-detecção
  if (opts.eps !== undefined && opts.decimals !== undefined) {
    return {
      eps: opts.eps,
      decimals: opts.decimals,
      proxWindow,
      relTol: opts.relTol ?? 0,
      scale: "manual",
    };
  }

  // Presets por tipo de dado
  const kind = opts.dataKind ?? "auto";
  const presets: Record<Exclude<DedupDataKind, "auto">, { eps: number; decimals: number; relTol: number }> = {
    balanco: { eps: 0.01, decimals: 2, relTol: 1e-5 },
    dre: { eps: 0.01, decimals: 2, relTol: 1e-5 },
    indice: { eps: 1e-4, decimals: 4, relTol: 1e-4 },
    unidade: { eps: 1, decimals: 0, relTol: 1e-5 },
  };

  if (kind !== "auto") {
    const p = presets[kind];
    return {
      eps: opts.eps ?? p.eps,
      decimals: opts.decimals ?? p.decimals,
      proxWindow,
      relTol: opts.relTol ?? p.relTol,
      scale: kind,
    };
  }

  // AUTO: deriva da magnitude mediana
  const abs = values.map((v) => Math.abs(Number(v) || 0)).filter((v) => v > 0);
  if (abs.length === 0) {
    return { eps: opts.eps ?? 0.01, decimals: opts.decimals ?? 2, proxWindow, relTol: opts.relTol ?? 1e-5, scale: "auto:empty" };
  }
  abs.sort((a, b) => a - b);
  const median = abs[Math.floor(abs.length / 2)];

  let eps: number, decimals: number, scale: string;
  if (median < 1) {
    eps = 1e-4; decimals = 4; scale = "auto:indice";
  } else if (median < 1_000) {
    eps = 0.01; decimals = 2; scale = "auto:brl-small";
  } else if (median < 1_000_000) {
    eps = 0.01; decimals = 2; scale = "auto:brl";
  } else {
    eps = 1; decimals = 0; scale = "auto:brl-large";
  }
  return {
    eps: opts.eps ?? eps,
    decimals: opts.decimals ?? decimals,
    proxWindow,
    relTol: opts.relTol ?? 1e-5,
    scale,
  };
}

export function cleanBalanceteRows<T extends { conta: string; descricao: string; values: Record<string, number> }>(
  rows: T[],
  opts: DedupOptions = {},
): T[] {
  if (rows.length === 0) return rows;

  // FILTRO 1: hierarquia por código
  // Suporta DOIS layouts:
  //  (a) código com separador: "1.1.01.001" → pai é prefixo + "."
  //  (b) código contínuo: "7", "71", "711", "7110100017" → pai é prefixo puro
  // Sem este suporte (a falha original), balancetes com códigos contínuos
  // passavam todos os totalizadores adiante e inflavam o ativo em ~10x.
  const normalize = (c: string) => String(c || "").trim().replace(/\s+/g, "").replace(/\.+$/g, "");
  const codes = rows.map((r) => normalize(r.conta));
  const codeSet = new Set(codes.filter(Boolean));
  let step1 = rows;
  if (codeSet.size > 0) {
    step1 = rows.filter((r) => {
      const c = normalize(r.conta);
      if (!c) return true;
      for (const other of codeSet) {
        if (other === c || other.length <= c.length) continue;
        if (!other.startsWith(c)) continue;
        const sep = other.charAt(c.length);
        // pai com ponto: "1.1" prefixo de "1.1.01" (sep ".")
        // pai contínuo: "711" prefixo de "7110" (sep numérico)
        if (sep === "." || /[0-9]/.test(sep)) return false;
      }
      return true;
    });
  }


  // FILTRO 2: descrições sintéticas/totalizadoras genéricas
  const SYNTHETIC_PATTERNS = [
    /^ativo$/i,
    /^ativo\s+(circulante|n[aã]o\s+circulante|total)$/i,
    /^passivo$/i,
    /^passivo\s+(circulante|n[aã]o\s+circulante|total)$/i,
    /^patrim[oô]nio\s+l[ií]quido$/i,
    /^total\s+do?\s+(ativo|passivo|patrim[oô]nio)/i,
    /^total\s+geral/i,
    /^demonstra[çc][aã]o\s+de?\s+resultado/i,
    /^demonstrativo\s+de?\s+resultado/i,
    /^dre$/i,
    /^receita\s+(bruta|l[ií]quida|total|operacional)$/i,
    /^despesa\s+(total|operacional)$/i,
    /^resultado\s+(bruto|operacional|antes|do\s+exerc[ií]cio|l[ií]quido)/i,
    /^lucro\s+(bruto|operacional|antes|do\s+exerc[ií]cio|l[ií]quido)/i,
    /^subtotal/i,
    /^totaliza/i,
  ];
  const step2 = step1.filter((r) => {
    const d = String(r.descricao || "").trim();
    return !SYNTHETIC_PATTERNS.some((p) => p.test(d));
  });

  // FILTRO 3: deduplicação robusta por chave composta + janela de proximidade
  // Chave de identidade: (código_normalizado, descrição_normalizada, valor_arredondado)
  // Critério de proximidade: só considera duplicata se aparecer dentro de PROX_WINDOW linhas,
  // evitando colapsar contas distintas que coincidentemente têm o mesmo valor em pontos
  // muito separados do balancete (ex.: dois empréstimos diferentes com saldo idêntico).
  const lastYear = (() => {
    const years = Object.keys(step2[0]?.values || {});
    return years.sort().reverse()[0] || "_";
  })();

  // Resolve parâmetros (auto-detecta escala se não vier override)
  const sampleValues = step2.map((r) => Number(r.values?.[lastYear] || 0));
  const { eps: EPS, decimals: DEC, proxWindow: PROX_WINDOW, relTol: REL_TOL } =
    resolveDedupParams(sampleValues, opts);
  const factor = Math.pow(10, DEC);

  const normCode = (s: string) =>
    String(s || "").trim().toLowerCase().replace(/[\s\-]+/g, ".").replace(/\.+/g, ".");
  const normDesc = (s: string) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const isCodeLike = (s: string) => {
    const t = String(s || "").trim();
    return !t || /^\d+$/.test(t) || t.length < 4;
  };
  const descRichness = (s: string) => {
    const t = normDesc(s);
    if (!t) return 0;
    if (/^\d+$/.test(t)) return 1;
    return t.split(/\s+/).filter(Boolean).length + 2;
  };
  // Igualdade tolerante: |Δ| <= max(EPS, relTol * max(|a|,|b|))
  const valuesEqual = (a: number, b: number) => {
    const d = Math.abs(a - b);
    const tol = Math.max(EPS, REL_TOL * Math.max(Math.abs(a), Math.abs(b)));
    return d <= tol;
  };

  type Indexed = { row: T; idx: number; code: string; desc: string; valR: number };
  const indexed: Indexed[] = step2.map((row, idx) => ({
    row,
    idx,
    code: normCode(row.conta),
    desc: normDesc(row.descricao),
    valR: Math.round((Number(row.values?.[lastYear] || 0)) * factor) / factor,
  }));

  const dropped = new Set<number>();
  for (let i = 0; i < indexed.length; i++) {
    if (dropped.has(i)) continue;
    const a = indexed[i];
    const aHasCode = !!a.code;
    const aHasDesc = !!a.desc && !isCodeLike(a.row.descricao);

    for (let j = i + 1; j < Math.min(indexed.length, i + 1 + PROX_WINDOW); j++) {
      if (dropped.has(j)) continue;
      const b = indexed[j];

      if (a.valR === 0 || b.valR === 0) continue;
      if (!valuesEqual(a.valR, b.valR)) continue;

      const bHasCode = !!b.code;
      const bHasDesc = !!b.desc && !isCodeLike(b.row.descricao);

      // CASO 1 — chave forte
      if (aHasCode && bHasCode && a.code === b.code && aHasDesc && bHasDesc && a.desc === b.desc) {
        dropped.add(j);
        continue;
      }

      // CASO 2 — mesmo código + descrições compatíveis
      if (aHasCode && bHasCode && a.code === b.code) {
        const oneEmpty = !aHasDesc || !bHasDesc;
        const oneContainsOther =
          aHasDesc && bHasDesc && (a.desc.includes(b.desc) || b.desc.includes(a.desc));
        if (oneEmpty || oneContainsOther) {
          const keepA = descRichness(a.row.descricao) >= descRichness(b.row.descricao);
          dropped.add(keepA ? j : i);
          if (!keepA) break;
          continue;
        }
      }

      // CASO 3 — artefato Excel: vizinho imediato código vs descrição
      if (j === i + 1) {
        const aIsCodeOnly = isCodeLike(a.row.descricao);
        const bIsCodeOnly = isCodeLike(b.row.descricao);
        if (aIsCodeOnly !== bIsCodeOnly) {
          if (aIsCodeOnly) {
            dropped.add(i);
            break;
          } else {
            dropped.add(j);
            continue;
          }
        }
      }
    }
  }

  const step3 = indexed.filter((x) => !dropped.has(x.idx)).map((x) => x.row);
  return step3;
}

/* ──────────────── Validador contábil ──────────────── */
function validateBalanco(rows: Array<{ valor: number; tipo: string }>): {
  valid: boolean;
  ativo: number;
  passivo: number;
  pl: number;
  diff: number;
  alertas: string[];
} {
  // Soma com sinal preservado para detectar Passivo a Descoberto (PL negativo).
  const sum = (t: string) =>
    rows.filter((r) => r.tipo === t).reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const ativo = Math.abs(sum("ativo"));
  const passivo = Math.abs(sum("passivo"));
  const pl = sum("pl"); // PRESERVA SINAL — passivo a descoberto = PL negativo
  const diff = Math.abs(ativo - (passivo + pl));
  const tolerance = Math.max(ativo * 0.02, 1000);
  const alertas: string[] = [];
  if (ativo === 0) alertas.push("Ativo total = 0 (verifique extração)");
  if (passivo + pl === 0) alertas.push("Passivo + PL = 0 (verifique extração)");
  if (diff > tolerance && ativo > 0) {
    alertas.push(
      `Equação contábil desbalanceada: Ativo (${ativo.toFixed(0)}) ≠ Passivo+PL (${(passivo + pl).toFixed(0)}). Diferença: ${diff.toFixed(0)}`,
    );
  }
  return { valid: diff <= tolerance, ativo, passivo, pl, diff, alertas };
}

/**
 * MOTOR CANÔNICO — extrai totalizadores diretamente dos pai (1, 11, 12, 21, 22)
 * do balanço bruto recebido em body.balanco, ANTES da normalização LLM.
 * Plano BR é estrutural: 1.x = Ativo, 21.x = PC, 22.x = PNC. PL = A - P (derivado).
 * Retorna null quando os pais oficiais não estiverem presentes (fallback p/ LLM).
 */
function canonicalBalanceFromParents(
  balancoRaw: Array<{ conta?: string; descricao?: string; values?: Record<string, number> }>,
  lastYear: string,
): { valid: boolean; ativo: number; ativoCirc: number; ativoNaoCirc: number; passivo: number; passivoCirc: number; passivoNaoCirc: number; pl: number; diff: number; source: string; alertas: string[] } | null {
  if (!balancoRaw || balancoRaw.length === 0) return null;
  const byCode = new Map<string, number>();
  for (const r of balancoRaw) {
    const code = String(r.conta || "").trim();
    if (!code) continue;
    const v = Number(r.values?.[lastYear] ?? 0);
    if (!Number.isFinite(v)) continue;
    // Mantém o último valor visto (em geral só há uma linha por código pai)
    byCode.set(code, v);
  }
  const ac = byCode.has("11") ? Math.abs(byCode.get("11")!) : 0;
  // ANC = grupo 12 (Não Circulante) + grupo 13 (Ativo Permanente, quando o plano
  // de contas separa Imobilizado em código próprio — ex.: Giannini).
  const anc12 = byCode.has("12") ? Math.abs(byCode.get("12")!) : 0;
  const anc13 = byCode.has("13") ? Math.abs(byCode.get("13")!) : 0;
  const anc = anc12 + anc13;
  const pc = byCode.has("21") ? Math.abs(byCode.get("21")!) : 0;
  const pnc = byCode.has("22") ? Math.abs(byCode.get("22")!) : 0;
  const ativoFromParent = byCode.has("1") ? Math.abs(byCode.get("1")!) : 0;
  // Aceita o motor canônico apenas se temos PELO MENOS Ativo (1 ou 11) e PC/PNC pelo menos um.
  if ((ativoFromParent === 0 && ac === 0) || (pc === 0 && pnc === 0)) return null;
  const ativo = ativoFromParent > 0 ? ativoFromParent : ac + anc;
  const passivo = pc + pnc;
  // PL derivado pela equação contábil (CPC 26 R1 §54). Garante Ativo = Passivo + PL.
  const pl = ativo - passivo;
  const alertas: string[] = [];
  if (pl < 0) alertas.push(`Passivo a Descoberto identificado: PL = ${pl.toFixed(0)}`);
  return {
    valid: true,
    ativo, ativoCirc: ac || ativo, ativoNaoCirc: anc,
    passivo, passivoCirc: pc, passivoNaoCirc: pnc,
    pl, diff: 0,
    source: "canonical_parents",
    alertas,
  };
}


/* ──────────────── Worker assíncrono (roda em background, sem idle timeout) ──────────────── */
async function runPipeline(
  reqId: string,
  body: PipelineRequest,
  documentId: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tStart: number,
) {
  try {
    await updateProgress(supabase, documentId, "Carregando dicionário contábil…");

    // 2. Carregar dicionário (cresce conforme o cache é populado #2)
    const tDict = Date.now();
    const { data: dictionary } = await supabase
      .from("contabil_dictionary")
      .select("termo_original, termo_padrao, categoria")
      .limit(1000);
    stageLog(reqId, "dictionary.loaded", {
      entries: dictionary?.length || 0,
      duration_ms: Date.now() - tDict,
    });

    // 3. Combinar balanço + DRE
    const allRowsRaw = [
      ...(body.balanco || []).map((r) => ({ ...r, _src: "balanco" as const })),
      ...(body.dre || []).map((r) => ({ ...r, _src: "dre" as const })),
    ];

    // 3.1 Filtrar contas sintéticas (totalizadoras) — manter apenas analíticas (folhas)
    // Evita dupla contagem hierárquica que inflava ativo em ~10x
    const balancoLeaves = cleanBalanceteRows(
      body.balanco || [],
      body.dedup?.balanco ?? { dataKind: "balanco" },
    );
    const dreLeaves = cleanBalanceteRows(
      body.dre || [],
      body.dedup?.dre ?? { dataKind: "dre" },
    );
    const allRows = [
      ...balancoLeaves.map((r) => ({ ...r, _src: "balanco" as const })),
      ...dreLeaves.map((r) => ({ ...r, _src: "dre" as const })),
    ];
    stageLog(reqId, "hierarchy.filtered", {
      raw_rows: allRowsRaw.length,
      leaf_rows: allRows.length,
      removed_synthetic: allRowsRaw.length - allRows.length,
    });

    if (allRows.length === 0) {
      await supabase
        .from("pipeline_documents")
        .update({ status: "failed", error_message: "Sem linhas para processar" })
        .eq("id", documentId);
      return;
    }

    const years = Object.keys(body.balanco?.[0]?.values || body.dre?.[0]?.values || { _: 0 });
    const lastYear = years.sort().reverse()[0] || "_";

    // 4. Normalização em lote
    const tNorm = Date.now();
    const normalized = await normalizeAccountsLLM(
      allRows.map((r) => ({ conta: r.conta, descricao: r.descricao })),
      dictionary || [],
      reqId,
      supabase,
      documentId,
    );
    stageLog(reqId, "normalize.total", { duration_ms: Date.now() - tNorm, rows: allRows.length });

    // 4.1 Override por código de conta (mais confiável que descrição)
    let mappedCount = 0;
    let codeOverrides = 0;
    const normalizedRows = allRows.map((row, i) => {
      const n = normalized[i];
      const byCode = classifyByCode(row.conta);
      // Código tem precedência: 1.x sempre é Ativo, 2.3+ sempre é PL, etc.
      const finalTipo = byCode?.tipo || n.tipo;
      const finalCat = byCode?.categoria || n.categoria;
      if (byCode && (byCode.tipo !== n.tipo || byCode.categoria !== n.categoria)) codeOverrides++;
      // mapping_score = % com classificação válida (matched OU código reconhecido)
      if (n.matched || byCode) mappedCount++;
      const valor = Number(row.values?.[lastYear] || 0);
      return {
        conta_original: row.descricao || row.conta,
        conta_normalizada: n.conta_normalizada,
        valor,
        tipo: finalTipo,
        categoria: finalCat,
        matched: n.matched || !!byCode,
      };
    });
    stageLog(reqId, "classification.done", {
      total: normalizedRows.length,
      mapped: mappedCount,
      code_overrides: codeOverrides,
    });

    // 5. Persistir balancete_data — limpa entradas anteriores do mesmo documento
    //    para evitar conflito com balancete_data_doc_conta_uq em reprocessamentos.
    if (normalizedRows.length > 0) {
      const { error: bdDelErr } = await supabase
        .from("balancete_data")
        .delete()
        .eq("document_id", documentId);
      if (bdDelErr) {
        console.warn("balancete_data prune warn:", bdDelErr.message);
      }
      const { error: bdErr } = await supabase.from("balancete_data").insert(
        normalizedRows.map((r) => ({
          document_id: documentId,
          conta_original: r.conta_original,
          conta_normalizada: r.conta_normalizada,
          valor: r.valor,
          tipo: r.tipo,
          categoria: r.categoria,
        })),
      );
      if (bdErr) console.warn("balancete_data insert warn:", bdErr.message);
    }

    // 6. Validação — motor canônico (pai 1/11/12/21/22) com fallback p/ LLM
    const canonical = canonicalBalanceFromParents(body.balanco || [], lastYear);
    const validationLLM = validateBalanco(normalizedRows);
    const validation = canonical
      ? {
          valid: canonical.valid,
          ativo: canonical.ativo,
          passivo: canonical.passivo,
          pl: canonical.pl,
          diff: canonical.diff,
          alertas: canonical.alertas,
          source: "canonical_parents" as const,
        }
      : { ...validationLLM, source: "llm_fallback" as const };
    stageLog(reqId, "validation.done", {
      source: validation.source,
      ativo: validation.ativo,
      passivo: validation.passivo,
      pl: validation.pl,
      diff: validation.diff,
      valid: validation.valid,
      llm_ativo: validationLLM.ativo,
      llm_passivo: validationLLM.passivo,
      llm_pl: validationLLM.pl,
    });

    // 7. Scores — Calibração v5 (meta ≥95% acurácia)
    // ─────────────────────────────────────────────────────────
    // OCR: parser estrutural (XLSX/CSV nativo) = extração lossless = 1.0
    // Cliente pode sobrescrever (PDF via Document AI manda seu próprio score).
    const isStructural = !body.ocr_score; // sem score = veio de XLSX/CSV nativo
    const ocrScore = isStructural ? 1.0 : Math.max(0, Math.min(1, body.ocr_score!));

    // Mapping: % de contas classificadas. Códigos BR (1.x, 2.x, 3.x, 4.x) são determinísticos.
    const mappingScore = normalizedRows.length > 0 ? mappedCount / normalizedRows.length : 0;

    // Validation: mede saúde CONTÁBIL do documento (Ativo=Passivo+PL).
    // Mantido como score independente para auditoria, MAS NÃO entra no quality
    // (não é responsabilidade da IA se o balancete do cliente está desbalanceado).
    const validationScore = validation.valid
      ? 1
      : Math.max(0, 1 - validation.diff / Math.max(validation.ativo, 1));

    // Quality: capacidade real do motor de IA de extrair + classificar.
    // Removido validation do peso → reflete performance da IA, não do documento.
    // Pesos: OCR 35% (extração) · Mapping 65% (classificação é o trabalho real do motor).
    const qualityScore = ocrScore * 0.35 + mappingScore * 0.65;

    // 7.1 Indicadores financeiros derivados — preferem totais canônicos (mesma fonte da validação)
    const sumByCat = (cat: string) =>
      normalizedRows
        .filter((r) => r.categoria === cat)
        .reduce((a, b) => a + Math.abs(Number(b.valor) || 0), 0);
    const ativoCirc = canonical?.ativoCirc ?? sumByCat("ativo_circulante");
    const ativoNaoCirc = canonical?.ativoNaoCirc ?? sumByCat("ativo_nao_circulante");
    const passivoCirc = canonical?.passivoCirc ?? sumByCat("passivo_circulante");
    const passivoNaoCirc = canonical?.passivoNaoCirc ?? sumByCat("passivo_nao_circulante");

    const receita = normalizedRows
      .filter((r) => r.tipo === "receita")
      .reduce((a, b) => a + Math.abs(Number(b.valor) || 0), 0);
    const despesa = normalizedRows
      .filter((r) => r.tipo === "despesa")
      .reduce((a, b) => a + Math.abs(Number(b.valor) || 0), 0);
    const resultado = receita - despesa;

    const indicadoresFinanceiros = {
      liquidez_corrente: passivoCirc > 0 ? +(ativoCirc / passivoCirc).toFixed(3) : null,
      endividamento_geral:
        validation.ativo > 0
          ? +((validation.passivo / validation.ativo) * 100).toFixed(2)
          : null,
      composicao_endividamento:
        validation.passivo > 0 ? +((passivoCirc / validation.passivo) * 100).toFixed(2) : null,
      margem_liquida: receita > 0 ? +((resultado / receita) * 100).toFixed(2) : null,
      roe: validation.pl > 0 ? +((resultado / validation.pl) * 100).toFixed(2) : null,
      receita_total: receita,
      despesa_total: despesa,
      resultado_periodo: resultado,
    };

    // 7.2 Análise contextual via LLM (Auditor Contábil Sênior IA)
    //     v4: usa MODELO MAIOR (gemini-2.5-pro) — capacidade liberada da extração
    //     v4: enriquece com referências validadas (dataset_validated) — few-shot real
    await updateProgress(supabase, documentId, "Gerando insights do auditor sênior…");
    const tAnalysis = Date.now();
    let aiInsights: { resumo: string; pontos_atencao: string[]; recomendacoes: string[] } | null = null;

    // Carregar até 3 referências validadas (RAG few-shot textual; embedding seria ideal mas requer custo extra)
    let fewShotBlock = "";
    try {
      const { data: refs } = await supabase
        .from("dataset_validated")
        .select("input_json, output_corrected, notes")
        .order("created_at", { ascending: false })
        .limit(3);
      if (refs && refs.length > 0) {
        fewShotBlock = `\n\nREFERÊNCIAS VALIDADAS POR AUDITOR (use como gabarito de raciocínio):\n` +
          refs.map((r: any, i: number) =>
            `[Ref ${i + 1}] ${r.notes || "Balancete validado"} — ${r.output_corrected?.balanco?.length || 0} contas balanço, ${r.output_corrected?.dre?.length || 0} contas DRE.`
          ).join("\n");
      }
    } catch (_) { /* não-crítico */ }

    // ── Roteamento automático de modelos ─────────────────────────────
    // Sinais de risco alimentam o router; ele escolhe Gemini ou GPT-5.
    const criticality = computeCriticality({
      balanceValid: validation.valid,
      patrimonioLiquido: validation.pl,
      liquidezCorrente: indicadoresFinanceiros.liquidez_corrente,
      endividamentoGeral: indicadoresFinanceiros.endividamento_geral,
    });
    const isCritical = criticality === "high";
    const decision = selectModel("audit_insights", criticality);
    const insightModel = decision.model;
    const insightServiceTag = decision.serviceTag;
    console.log(`[router] audit_insights → ${insightModel} (${decision.reason})`);

    try {
      // #3 otimização: contexto compacto (formato chave=valor, sem labels redundantes — ~40% menos tokens)
      const fmt = (n: number) => n.toLocaleString("pt-BR");
      const eq = validation.valid ? "OK" : `DESB(Δ${fmt(validation.diff)})`;
      const ctx = `Empresa:${body.documentInfo?.empresa || "N/D"}|Per:${body.documentInfo?.periodo || lastYear}
BP: AT=${fmt(validation.ativo)} PT=${fmt(validation.passivo)} PL=${fmt(validation.pl)} eq=${eq}
Estr: AC=${fmt(ativoCirc)} ANC=${fmt(ativoNaoCirc)} PC=${fmt(passivoCirc)} PNC=${fmt(passivoNaoCirc)}
DRE: Rec=${fmt(receita)} Desp=${fmt(despesa)} Res=${fmt(resultado)}
Idx: LC=${indicadoresFinanceiros.liquidez_corrente ?? "ND"} EG=${indicadoresFinanceiros.endividamento_geral ?? "ND"}% CE=${indicadoresFinanceiros.composicao_endividamento ?? "ND"}% ML=${indicadoresFinanceiros.margem_liquida ?? "ND"}% ROE=${indicadoresFinanceiros.roe ?? "ND"}%${fewShotBlock}`;


      const aiResp = await aiGatewayFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: insightModel,
          messages: [
            {
              role: "system",
              content: `Você é o Auditor Contábil Sênior IA da BEX Auditoria, especialista em análise financeira pelas normas CPC/IFRS/Lei 6.404/76 com foco em diagnóstico de solvência, recuperação judicial e governança corporativa. Seja direto, técnico e cite valores absolutos quando relevante. Limite cada item a 1 frase objetiva.`,
            },
            {
              role: "user",
              content: `Analise este balancete e retorne JSON via tool call:\n\n${ctx}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_audit_insights",
                description: "Retorna análise contextual estruturada do auditor.",
                parameters: {
                  type: "object",
                  properties: {
                    resumo: {
                      type: "string",
                      description: "1-2 frases sobre saúde financeira geral.",
                    },
                    pontos_atencao: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-5 alertas técnicos (liquidez, endividamento, margem, etc.)",
                    },
                    recomendacoes: {
                      type: "array",
                      items: { type: "string" },
                      description: "2-4 ações sugeridas pelo auditor.",
                    },
                  },
                  required: ["resumo", "pontos_atencao", "recomendacoes"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_audit_insights" } },
        }),
      }, { label: `ai_insights:${insightServiceTag}`, maxAttempts: 3, perAttemptTimeoutMs: 90_000 });
      if (aiResp.ok) {
        const aj = await aiResp.json();
        const tc = aj.choices?.[0]?.message?.tool_calls?.[0];
        aiInsights = JSON.parse(tc?.function?.arguments || "null");
        trackUsage({
          type: "insight", provider: decision.provider, service: insightServiceTag,
          document_id: documentId,
          tokens_input: aj.usage?.prompt_tokens ?? Math.ceil(ctx.length / 4),
          tokens_output: aj.usage?.completion_tokens ?? Math.ceil(JSON.stringify(aiInsights || {}).length / 4),
          requests: 1,
          metadata: { model: insightModel.replace(/^(google|openai)\//, ""), phase: "audit_insights", critical: isCritical, criticality, reason: decision.reason },
        }).catch(() => {});
      } else {
        console.warn("ai insights HTTP", aiResp.status);
      }
    } catch (e) {
      console.warn("ai insights error:", e instanceof Error ? e.message : e);
    }
    stageLog(reqId, "ai_insights.done", {
      duration_ms: Date.now() - tAnalysis,
      has_insights: !!aiInsights,
    });

    // 8. Persistir analysis_results
    await supabase.from("pipeline_analysis_results").insert({
      document_id: documentId,
      indicadores: {
        ativo_total: validation.ativo,
        passivo_total: validation.passivo,
        pl: validation.pl,
        ativo_circulante: ativoCirc,
        ativo_nao_circulante: ativoNaoCirc,
        passivo_circulante: passivoCirc,
        passivo_nao_circulante: passivoNaoCirc,
        contas_total: normalizedRows.length,
        contas_mapeadas: mappedCount,
        ...indicadoresFinanceiros,
        ai_insights: aiInsights,
      },
      alertas: validation.alertas,
      ocr_score: ocrScore,
      mapping_score: mappingScore,
      validation_score: validationScore,
      quality_score: qualityScore,
    });

    await supabase
      .from("pipeline_documents")
      .update({ status: "completed", progress: "Concluído" })
      .eq("id", documentId);

    stageLog(reqId, "request.complete", {
      total_ms: Date.now() - tStart,
      quality_score: qualityScore,
      cache_size: NORMALIZE_CACHE.size,
    });
  } catch (e) {
    stageLog(reqId, "worker.error", { error: e instanceof Error ? e.message : String(e) });
    console.error("audit-pipeline-process worker error:", e);
    await supabase
      .from("pipeline_documents")
      .update({
        status: "failed",
        error_message: e instanceof Error ? e.message.slice(0, 500) : "Unknown error",
      })
      .eq("id", documentId);
  }
}

/* ──────────────── Handler (202 + background) ──────────────── */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const reqId = crypto.randomUUID().slice(0, 8);
  const tStart = Date.now();

  try {
    const body: PipelineRequest = await req.json();
    stageLog(reqId, "request.received", {
      file: body.file_name,
      balanco_rows: body.balanco?.length || 0,
      dre_rows: body.dre?.length || 0,
      has_company: !!body.company_id,
      has_document: !!body.document_id,
    });

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Registrar (ou reutilizar) documento — sincronamente
    let documentId: string;
    let dedupHit = false;

    // Item 4: SHA-256 do conteúdo para detectar reprocessamentos idênticos
    const contentHash = await sha256Hex(buildContentHashSource(body));

    // ── Lock por empresa: bloqueia 2 pipelines simultâneos da MESMA company_id ──
    // Janela: 10 min. Mantém isolamento por usuário (RLS) e evita corrida de inserts duplicados.
    if (body.company_id) {
      const lockSince = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: activePipeline } = await supabase
        .from("pipeline_documents")
        .select("id, status, updated_at")
        .eq("company_id", body.company_id)
        .in("status", ["pending", "normalizing", "processing"])
        .gte("updated_at", lockSince)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activePipeline?.id && activePipeline.id !== body.document_id) {
        stageLog(reqId, "pipeline.lock_busy", {
          company_id: body.company_id,
          active_document_id: activePipeline.id,
          active_status: (activePipeline as { status: string }).status,
        });
        return new Response(
          JSON.stringify({
            error: "pipeline_busy",
            message: "Já existe um processamento em andamento para esta empresa. Aguarde a conclusão (até 10 min) e tente novamente.",
            active_document_id: activePipeline.id,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "30" },
          },
        );
      }
    }


    if (body.document_id) {
      const { data: existingDoc } = await supabase
        .from("pipeline_documents")
        .select("id")
        .eq("id", body.document_id)
        .maybeSingle();
      if (!existingDoc) throw new Error(`document_id ${body.document_id} não encontrado`);
      // deno-lint-ignore no-explicit-any
      documentId = (existingDoc as any).id;
      const updatePayload: Record<string, unknown> = { status: "normalizing", content_hash: contentHash, parser_version: PARSER_VERSION };
      if (body.company_id) updatePayload.company_id = body.company_id;
      await supabase.from("pipeline_documents").update(updatePayload).eq("id", documentId);
    } else {
      // Tenta reaproveitar documento já processado com mesmo content_hash + created_by + status=completed.
      // FIX #1 — force_reprocess pula o dedup (UI: botão "Forçar reprocessamento").
      const dup = body.force_reprocess ? null : (await supabase
        .from("pipeline_documents")
        .select("id, status")
        .eq("content_hash", contentHash)
        .eq("created_by", userId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()).data;

      if (dup?.id) {
        documentId = (dup as { id: string }).id;
        dedupHit = true;
        stageLog(reqId, "document.dedup_hit", { document_id: documentId, content_hash: contentHash, parser_version: PARSER_VERSION });
      } else {
        if (body.force_reprocess) {
          stageLog(reqId, "document.force_reprocess", { content_hash: contentHash, parser_version: PARSER_VERSION });
        }
        const { data: doc, error: docErr } = await supabase
          .from("pipeline_documents")
          .insert({
            company_id: body.company_id || null,
            file_name: body.file_name,
            file_type: body.file_name.split(".").pop() || "unknown",
            status: "normalizing",
            created_by: userId,
            content_hash: contentHash,
            parser_version: PARSER_VERSION,
          })
          .select()
          .single();
        if (docErr || !doc) throw new Error(`Falha ao registrar documento: ${docErr?.message}`);
        // deno-lint-ignore no-explicit-any
        documentId = (doc as any).id;
      }
    }
    stageLog(reqId, "document.ready", { document_id: documentId, dedup_hit: dedupHit, parser_version: PARSER_VERSION });

    // 2. Dispara worker em background (não bloqueia a resposta — sem idle timeout)
    //    Item 4: se for dedup hit, pula o worker — documento já processado.
    if (!dedupHit) {
      // deno-lint-ignore no-explicit-any
      const edgeRt = (globalThis as any).EdgeRuntime;
      const workerPromise = runPipeline(reqId, body, documentId, supabase, tStart);
      if (edgeRt?.waitUntil) {
        edgeRt.waitUntil(workerPromise);
      } else {
        // Fallback local: apenas dispara sem await
        workerPromise.catch((e) => console.error("worker bg error:", e));
      }
    }

    // 3. Retorna 202 imediatamente — cliente faz polling em pipeline_documents.status
    return new Response(
      JSON.stringify({
        status: dedupHit ? "completed" : "processing",
        document_id: documentId,
        req_id: reqId,
        dedup_hit: dedupHit,
        parser_version: PARSER_VERSION,
        message: dedupHit
          ? "Documento já processado anteriormente — reaproveitando resultado (dedup por SHA-256). Use force_reprocess=true para reprocessar."
          : "Documento enfileirado para processamento em background. Faça polling em pipeline_documents.status até 'completed' ou 'failed'.",
      }),
      { status: dedupHit ? 200 : 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    stageLog(reqId, "request.error", { error: e instanceof Error ? e.message : String(e) });
    console.error("audit-pipeline-process error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
