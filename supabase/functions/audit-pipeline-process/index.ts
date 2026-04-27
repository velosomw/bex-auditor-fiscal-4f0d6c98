// Audit Pipeline Process — Pré-processamento inteligente de balancetes
// Stack: Lovable AI Gateway (chat/JSON, sem embeddings) + Supabase Postgres.
//
// Pipeline:
//   1. Cria pipeline_documents
//   2. Normalização semântica via LLM (Gemini Flash) com dicionário injetado
//   3. Salva balancete_data
//   4. Validação contábil (Ativo ≈ Passivo + PL com tolerância 2%)
//   5. Few-shot examples recentes de dataset_validated
//   6. Score de qualidade composto
//   7. Persiste pipeline_analysis_results
//   8. Retorna dados normalizados + few-shot + score para o audit-analyze

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
  file_name: string;
  ocr_score?: number;
  balanco: BalanceteRow[];
  dre: BalanceteRow[];
  documentInfo?: { empresa?: string; periodo?: string; tipo?: string };
}

/* ──────────────── Categorização contábil heurística (fallback) ──────────────── */
function classifyAccount(desc: string): { tipo: string; categoria: string } {
  const d = (desc || "").toLowerCase();
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
  if (/(capital social|reserva|lucro acumulado|prejuizo acumulado|patrimonio)/.test(d))
    return { tipo: "pl", categoria: "patrimonio_liquido" };
  return { tipo: "ativo", categoria: "ativo_circulante" };
}

/* ──────────────── Normalização semântica em lote via LLM (com chunking + paralelização) ──────────────── */
const CHUNK_SIZE = 40; // contas por requisição — equilibra latência vs throughput
const MAX_PARALLEL = 4; // lotes simultâneos

async function normalizeChunk(
  rows: Array<{ conta: string; descricao: string }>,
  dictText: string,
): Promise<Array<{ conta_normalizada: string; categoria: string; tipo: string; matched: boolean }>> {
  const inputList = rows.map((r, i) => `${i}. ${r.descricao || r.conta}`).join("\n");

  const systemPrompt = `Você é um CONTADOR ESPECIALISTA em classificação contábil brasileira (CPC/IFRS/NBC TA/Lei 6.404/76).

TAREFA: Padronizar e classificar contas de um balancete usando SIMILARIDADE SEMÂNTICA (não literal).

REGRAS CRÍTICAS:
1. Para cada conta, retorne:
   - conta_normalizada: termo padrão consolidado (ex.: "Bcos c/Mvto" → "Bancos Conta Movimento"; "Dupl. Desct." → "Duplicatas Descontadas")
   - categoria: uma de [ativo_circulante, ativo_nao_circulante, passivo_circulante, passivo_nao_circulante, patrimonio_liquido, receita, custo, despesa]
   - tipo: uma de [ativo, passivo, pl, receita, despesa]
   - matched: true se mapeou via dicionário/exemplo, false se inferiu por contexto
2. Use SIMILARIDADE SEMÂNTICA — contas equivalentes devem ter o MESMO termo padrão (consistência).
3. NÃO invente categorias novas. NÃO crie subcontas inexistentes.
4. Identifique sinais de risco: factoring, FIDC, duplicatas descontadas, antecipação de recebíveis → categoria correta + termo padronizado.
5. Se a conta for ambígua → mantenha o nome original e marque matched=false.
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
      model: "google/gemini-2.5-flash",
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
    const accounts = args.accounts as Array<{
      conta_normalizada: string;
      categoria: string;
      tipo: string;
      matched: boolean;
    }>;
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

  try {
    const body: PipelineRequest = await req.json();

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

    // 1. Registrar documento
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
    const documentId = (doc as any).id;

    // 2. Carregar dicionário (uma vez)
    const { data: dictionary } = await supabase
      .from("contabil_dictionary")
      .select("termo_original, termo_padrao, categoria")
      .limit(200);

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

    // 4. Normalização em lote via LLM (uma chamada para tudo)
    const normalized = await normalizeAccountsLLM(
      allRows.map((r) => ({ conta: r.conta, descricao: r.descricao })),
      dictionary || [],
    );

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

    // 7. Few-shot: últimos 3 exemplos validados (sem embeddings — vetor indisponível)
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

    // 8. Score de qualidade
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

    await supabase.from("pipeline_documents").update({ status: "done" }).eq("id", documentId);

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
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("audit-pipeline-process error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
