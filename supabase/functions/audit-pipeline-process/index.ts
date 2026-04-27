// Audit Pipeline Process — Pré-processamento inteligente de balancetes
// Stack: Lovable AI Gateway (chat/JSON) + Supabase Postgres.
//
// Quick Wins aplicados (v2):
//   1. Cache em memória (hash da descrição) → evita LLM calls repetidos
//   2. Paralelismo aumentado (CHUNK_SIZE 80, MAX_PARALLEL 6)
//   3. Deduplicação pré-LLM (descrições idênticas processadas 1x)
//   4. Heurística PL melhorada (Capital Social / Reservas / Lucros / Prejuízos)
//   5. Logging estruturado por estágio (timestamps + métricas)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

/* ──────────────── Normalização semântica em lote via LLM ──────────────── */
const CHUNK_SIZE = 80; // Quick Win 2: era 40
const MAX_PARALLEL = 6; // Quick Win 2: era 4

async function normalizeChunk(
  rows: Array<{ conta: string; descricao: string }>,
  dictText: string,
): Promise<NormResult[]> {
  const inputList = rows.map((r, i) => `${i}. ${r.descricao || r.conta}`).join("\n");

  const systemPrompt = `Você é um CONTADOR ESPECIALISTA em classificação contábil brasileira (CPC/IFRS/NBC TA/Lei 6.404/76).

TAREFA: Padronizar e classificar contas de um balancete usando SIMILARIDADE SEMÂNTICA (não literal).

REGRAS CRÍTICAS:
1. Para cada conta, retorne:
   - conta_normalizada: termo padrão consolidado (ex.: "Bcos c/Mvto" → "Bancos Conta Movimento"; "Dupl. Desct." → "Duplicatas Descontadas")
   - categoria: uma de [ativo_circulante, ativo_nao_circulante, passivo_circulante, passivo_nao_circulante, patrimonio_liquido, receita, custo, despesa]
   - tipo: uma de [ativo, passivo, pl, receita, despesa]
   - matched: true se mapeou via dicionário/exemplo, false se inferiu por contexto
2. ATENÇÃO ESPECIAL AO PATRIMÔNIO LÍQUIDO: Capital Social, Reservas (Legal/Estatutária/Capital/Lucros), Lucros Acumulados, Lucros do Exercício, Prejuízos Acumulados, Ajustes de Avaliação Patrimonial, Ações em Tesouraria → SEMPRE tipo="pl", categoria="patrimonio_liquido". NUNCA classifique "Lucros Acumulados" como receita.
3. Use SIMILARIDADE SEMÂNTICA — contas equivalentes devem ter o MESMO termo padrão.
4. NÃO invente categorias novas.
5. Sinais de risco: factoring, FIDC, duplicatas descontadas → categoria correta + termo padronizado.
6. Mantenha a MESMA ORDEM das contas de entrada.

DICIONÁRIO CONTÁBIL DE REFERÊNCIA:
${dictText || "(vazio — use seu conhecimento contábil)"}`;

  const userPrompt = `Normalize estas ${rows.length} contas mantendo EXATAMENTE a mesma ordem do input:\n\n${inputList}\n\nRetorne via tool call return_normalized_accounts.`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_normalized_accounts",
            description: "Retorna lista de contas normalizadas na mesma ordem do input.",
            parameters: {
              type: "object",
              properties: {
                accounts: {
                  type: "array",
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
  });

  if (!r.ok) {
    console.warn("LLM normalize HTTP", r.status, (await r.text()).slice(0, 300));
    return rows.map((row) => {
      const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
      return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false };
    });
  }

  try {
    const j = await r.json();
    const tc = j.choices?.[0]?.message?.tool_calls?.[0];
    const args = JSON.parse(tc?.function?.arguments || "{}");
    const accounts = args.accounts as NormResult[];
    if (!Array.isArray(accounts) || accounts.length !== rows.length) {
      throw new Error(`tamanho inesperado: ${accounts?.length} vs ${rows.length}`);
    }
    return accounts;
  } catch (e) {
    console.warn("LLM normalize parse error", e);
    return rows.map((row) => {
      const { tipo, categoria } = classifyAccount(row.descricao || row.conta);
      return { conta_normalizada: row.descricao || row.conta, categoria, tipo, matched: false };
    });
  }
}

/* Wrapper: cache + dedup + chunk + paralelização (Quick Wins 1, 2, 3) */
async function normalizeAccountsLLM(
  rows: Array<{ conta: string; descricao: string }>,
  // deno-lint-ignore no-explicit-any
  dictionary: any[],
  reqId: string,
): Promise<NormResult[]> {
  if (rows.length === 0) return [];

  const dictText = (dictionary || [])
    .slice(0, 80)
    .map((d) => `- "${d.termo_original}" → "${d.termo_padrao}" [${d.categoria}]`)
    .join("\n");

  // Resultado final por índice
  const finalResults: NormResult[] = new Array(rows.length);

  // Quick Win 1+3: cache lookup + dedup
  const uniqueByDesc = new Map<string, { row: { conta: string; descricao: string }; indices: number[] }>();
  let cacheHits = 0;

  rows.forEach((row, idx) => {
    const desc = row.descricao || row.conta;
    const cached = cacheGet(desc);
    if (cached) {
      finalResults[idx] = cached;
      cacheHits++;
      return;
    }
    const key = cacheKey(desc);
    const existing = uniqueByDesc.get(key);
    if (existing) {
      existing.indices.push(idx);
    } else {
      uniqueByDesc.set(key, { row, indices: [idx] });
    }
  });

  const uniqueRows = Array.from(uniqueByDesc.values()).map((v) => v.row);
  const dedupSavings = rows.length - cacheHits - uniqueRows.length;

  stageLog(reqId, "normalize.dedup", {
    total: rows.length,
    cache_hits: cacheHits,
    unique_to_process: uniqueRows.length,
    dedup_savings: dedupSavings,
  });

  if (uniqueRows.length === 0) {
    stageLog(reqId, "normalize.complete", { llm_calls: 0, source: "100%_cache" });
    return finalResults;
  }

  // Chunkifica + paraleliza (Quick Win 2)
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
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
    const wave = chunks.slice(i, i + MAX_PARALLEL);
    const settled = await Promise.all(wave.map((c) => normalizeChunk(c, dictText)));
    settled.forEach((s) => allLLMResults.push(...s));
  }
  stageLog(reqId, "normalize.llm_done", {
    duration_ms: Date.now() - t0,
    llm_processed: allLLMResults.length,
  });

  // Distribui resultado LLM para todos os índices (cache + originais)
  uniqueRows.forEach((row, i) => {
    const desc = row.descricao || row.conta;
    const result = allLLMResults[i];
    if (!result) return;
    cacheSet(desc, result);
    const entry = uniqueByDesc.get(cacheKey(desc));
    entry?.indices.forEach((idx) => {
      finalResults[idx] = result;
    });
  });

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

/* ──────────────── Validador contábil ──────────────── */
function validateBalanco(rows: Array<{ valor: number; tipo: string }>): {
  valid: boolean;
  ativo: number;
  passivo: number;
  pl: number;
  diff: number;
  alertas: string[];
} {
  const sum = (t: string) =>
    rows.filter((r) => r.tipo === t).reduce((a, b) => a + Math.abs(Number(b.valor) || 0), 0);
  const ativo = sum("ativo");
  const passivo = sum("passivo");
  const pl = sum("pl");
  const diff = Math.abs(ativo - (passivo + pl));
  const tolerance = ativo * 0.02;
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

/* ──────────────── Handler ──────────────── */
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

    // 1. Registrar (ou reutilizar) documento
    let documentId: string;
    if (body.document_id) {
      const { data: existingDoc } = await supabase
        .from("pipeline_documents")
        .select("id")
        .eq("id", body.document_id)
        .maybeSingle();
      if (!existingDoc) throw new Error(`document_id ${body.document_id} não encontrado`);
      // deno-lint-ignore no-explicit-any
      documentId = (existingDoc as any).id;
      const updatePayload: Record<string, unknown> = { status: "normalizing" };
      if (body.company_id) updatePayload.company_id = body.company_id;
      await supabase.from("pipeline_documents").update(updatePayload).eq("id", documentId);
    } else {
      const { data: doc, error: docErr } = await supabase
        .from("pipeline_documents")
        .insert({
          company_id: body.company_id || null,
          file_name: body.file_name,
          file_type: body.file_name.split(".").pop() || "unknown",
          status: "normalizing",
          created_by: userId,
        })
        .select()
        .single();

      if (docErr || !doc) throw new Error(`Falha ao registrar documento: ${docErr?.message}`);
      // deno-lint-ignore no-explicit-any
      documentId = (doc as any).id;
    }
    stageLog(reqId, "document.ready", { document_id: documentId });

    // 2. Carregar dicionário
    const tDict = Date.now();
    const { data: dictionary } = await supabase
      .from("contabil_dictionary")
      .select("termo_original, termo_padrao, categoria")
      .limit(200);
    stageLog(reqId, "dictionary.loaded", {
      entries: dictionary?.length || 0,
      duration_ms: Date.now() - tDict,
    });

    // 3. Combinar balanço + DRE
    const allRows = [
      ...(body.balanco || []).map((r) => ({ ...r, _src: "balanco" as const })),
      ...(body.dre || []).map((r) => ({ ...r, _src: "dre" as const })),
    ];

    if (allRows.length === 0) {
      await supabase
        .from("pipeline_documents")
        .update({ status: "failed", error_message: "Sem linhas para processar" })
        .eq("id", documentId);
      return new Response(JSON.stringify({ error: "Sem linhas para processar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const years = Object.keys(body.balanco?.[0]?.values || body.dre?.[0]?.values || { _: 0 });
    const lastYear = years.sort().reverse()[0] || "_";

    // 4. Normalização em lote (com cache + dedup + paralelização)
    const tNorm = Date.now();
    const normalized = await normalizeAccountsLLM(
      allRows.map((r) => ({ conta: r.conta, descricao: r.descricao })),
      dictionary || [],
      reqId,
    );
    stageLog(reqId, "normalize.total", {
      duration_ms: Date.now() - tNorm,
      rows: allRows.length,
    });

    let mappedCount = 0;
    const normalizedRows = allRows.map((row, i) => {
      const n = normalized[i];
      if (n.matched) mappedCount++;
      const valor = Number(row.values?.[lastYear] || 0);
      return {
        conta_original: row.descricao || row.conta,
        conta_normalizada: n.conta_normalizada,
        valor,
        tipo: n.tipo,
        categoria: n.categoria,
        matched: n.matched,
      };
    });

    // 5. Persistir balancete_data
    if (normalizedRows.length > 0) {
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

    // 6. Validação contábil
    const validation = validateBalanco(normalizedRows);
    stageLog(reqId, "validation.done", {
      ativo: validation.ativo,
      passivo: validation.passivo,
      pl: validation.pl,
      diff: validation.diff,
      valid: validation.valid,
    });

    // 7. Few-shot
    const { data: fsRows } = await supabase
      .from("dataset_validated")
      .select("input_json, output_corrected")
      .order("created_at", { ascending: false })
      .limit(3);
    const fewShot = (fsRows || []).map((r) => ({
      // deno-lint-ignore no-explicit-any
      input: (r as any).input_json,
      // deno-lint-ignore no-explicit-any
      output: (r as any).output_corrected,
    }));

    // 8. Score
    const ocrScore = Math.max(0, Math.min(1, body.ocr_score ?? 0.85));
    const mappingScore = normalizedRows.length > 0 ? mappedCount / normalizedRows.length : 0;
    const validationScore = validation.valid
      ? 1
      : Math.max(0, 1 - validation.diff / Math.max(validation.ativo, 1));
    const qualityScore = ocrScore * 0.3 + mappingScore * 0.3 + validationScore * 0.4;

    // 9. Persistir analysis_results
    await supabase.from("pipeline_analysis_results").insert({
      document_id: documentId,
      indicadores: {
        ativo_total: validation.ativo,
        passivo_total: validation.passivo,
        pl: validation.pl,
        contas_total: normalizedRows.length,
        contas_mapeadas: mappedCount,
      },
      alertas: validation.alertas,
      ocr_score: ocrScore,
      mapping_score: mappingScore,
      validation_score: validationScore,
      quality_score: qualityScore,
    });

    await supabase.from("pipeline_documents").update({ status: "completed" }).eq("id", documentId);

    const totalMs = Date.now() - tStart;
    stageLog(reqId, "request.complete", {
      total_ms: totalMs,
      quality_score: qualityScore,
      cache_size: NORMALIZE_CACHE.size,
    });

    return new Response(
      JSON.stringify({
        document_id: documentId,
        normalized: normalizedRows,
        few_shot_examples: fewShot,
        validation,
        scores: {
          ocr: ocrScore,
          mapping: mappingScore,
          validation: validationScore,
          quality: qualityScore,
        },
        meta: {
          req_id: reqId,
          total_ms: totalMs,
          cache_size: NORMALIZE_CACHE.size,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
