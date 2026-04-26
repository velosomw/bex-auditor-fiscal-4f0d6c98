// Audit Pipeline Process — Pré-processamento inteligente de balancetes
// Pipeline: registro → embeddings → similarity → normalização → validação → score
// Roda ANTES do audit-analyze (multi-agente Kanitz/BEX) sem alterá-lo.
//
// Etapas (sem OCR aqui — o OCR já é feito por audit-parse-pdf / document-ai-process):
//   1. Cria pipeline_documents
//   2. Salva balancete_data (linhas estruturadas vindas do parser)
//   3. Normalizador semântico via embeddings + dicionário contábil
//   4. Recupera exemplos similares de dataset_validated (few-shot)
//   5. Validador contábil (Ativo = Passivo + PL)
//   6. Score de qualidade (ocr * 0.3 + mapping * 0.3 + validation * 0.4)
//   7. Persiste pipeline_analysis_results
//   8. Retorna dados normalizados + few-shot examples + score para o audit-analyze

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

/* ──────────────── Embedding via Lovable AI Gateway ──────────────── */
async function generateEmbedding(text: string): Promise<number[] | null> {
  // Lovable AI Gateway suporta o endpoint OpenAI-compatible /v1/embeddings.
  // Modelo: google/text-embedding-004 (768 dims) — alinhado com vector(768)
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/text-embedding-004",
        input: text.slice(0, 2000),
      }),
    });
    if (!r.ok) {
      console.warn("embedding HTTP", r.status, (await r.text()).slice(0, 200));
      return null;
    }
    const j = await r.json();
    return j?.data?.[0]?.embedding || null;
  } catch (e) {
    console.warn("embedding error", e);
    return null;
  }
}

/* ──────────────── Categorização contábil heurística ──────────────── */
function classifyAccount(desc: string): { tipo: string; categoria: string } {
  const d = desc.toLowerCase();
  if (/(receita|venda|faturamento)/.test(d)) return { tipo: "receita", categoria: "receita" };
  if (/(custo|cmv)/.test(d)) return { tipo: "despesa", categoria: "custo" };
  if (/(despesa|gasto)/.test(d)) return { tipo: "despesa", categoria: "despesa" };
  if (/(caixa|banco|aplica|cliente|estoque|recebe|circulante)/.test(d))
    return { tipo: "ativo", categoria: "ativo_circulante" };
  if (/(imobilizado|intangivel|investiment|longo prazo|nao circulante|não circulante)/.test(d))
    return { tipo: "ativo", categoria: "ativo_nao_circulante" };
  if (/(fornecedor|emprestimo|financiamento|salario|imposto a pagar|factoring|fidc|duplicat.*descont)/.test(d))
    return { tipo: "passivo", categoria: "passivo_circulante" };
  if (/(exigivel.*longo|passivo.*nao.*circulante|passivo.*não.*circulante)/.test(d))
    return { tipo: "passivo", categoria: "passivo_nao_circulante" };
  if (/(capital social|reserva|lucro acumulado|patrimonio)/.test(d))
    return { tipo: "pl", categoria: "patrimonio_liquido" };
  return { tipo: "ativo", categoria: "ativo_circulante" };
}

/* ──────────────── Normalização via dicionário (similarity search) ──────────────── */
async function normalizeAccount(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  raw: string,
  embedding: number[] | null,
): Promise<{ termo_padrao: string; categoria: string; matched: boolean }> {
  // 1. Tenta match exato (case-insensitive) primeiro — barato
  const lower = raw.toLowerCase().trim();
  const { data: exact } = await supabase
    .from("contabil_dictionary")
    .select("termo_padrao, categoria")
    .ilike("termo_original", lower)
    .limit(1)
    .maybeSingle();
  if (exact) return { termo_padrao: (exact as any).termo_padrao, categoria: (exact as any).categoria, matched: true };

  // 2. Similarity search via embedding (se disponível)
  if (embedding) {
    const { data: sim } = await supabase.rpc("match_contabil_dictionary", {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 1,
    });
    if (sim && (sim as any[]).length > 0) {
      const top = (sim as any[])[0];
      return { termo_padrao: top.termo_padrao, categoria: top.categoria, matched: true };
    }
  }

  // 3. Fallback heurístico
  const { categoria } = classifyAccount(raw);
  return { termo_padrao: raw, categoria, matched: false };
}

/* ──────────────── Validador contábil ──────────────── */
function validateBalanco(rows: Array<{ conta_normalizada: string; valor: number; tipo: string }>): {
  valid: boolean;
  ativo: number;
  passivo: number;
  pl: number;
  diff: number;
  alertas: string[];
} {
  const sum = (t: string) => rows.filter((r) => r.tipo === t).reduce((a, b) => a + Math.abs(b.valor), 0);
  const ativo = sum("ativo");
  const passivo = sum("passivo");
  const pl = sum("pl");
  const diff = Math.abs(ativo - (passivo + pl));
  const tolerance = ativo * 0.02; // 2%
  const alertas: string[] = [];
  if (ativo === 0) alertas.push("Ativo total = 0 (verifique extração)");
  if (passivo + pl === 0) alertas.push("Passivo + PL = 0 (verifique extração)");
  if (diff > tolerance && ativo > 0) {
    alertas.push(`Equação contábil desbalanceada: Ativo (${ativo.toFixed(0)}) ≠ Passivo+PL (${(passivo + pl).toFixed(0)}). Diferença: ${diff.toFixed(0)}`);
  }
  return { valid: diff <= tolerance, ativo, passivo, pl, diff, alertas };
}

/* ──────────────── Few-shot retrieval ──────────────── */
async function fetchFewShotExamples(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  embedding: number[] | null,
  k = 3,
): Promise<Array<{ input: any; output: any }>> {
  if (!embedding) return [];
  const { data } = await supabase.rpc("match_dataset_validated", {
    query_embedding: embedding,
    match_threshold: 0.6,
    match_count: k,
  });
  return ((data as any[]) || []).map((r) => ({ input: r.input_json, output: r.output_corrected }));
}

/* ──────────────── Handler ──────────────── */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: PipelineRequest = await req.json();

    // Resolve user from JWT (service-role client; auth.uid() not available)
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
    const documentId = (doc as any).id;

    // 2. Normalizar contas (balanço + DRE)
    const allRows = [
      ...body.balanco.map((r) => ({ ...r, _src: "balanco" as const })),
      ...body.dre.map((r) => ({ ...r, _src: "dre" as const })),
    ];

    const normalizedRows: Array<{
      conta_original: string;
      conta_normalizada: string;
      valor: number;
      tipo: string;
      categoria: string;
      matched: boolean;
    }> = [];

    let mappedCount = 0;
    const years = Object.keys(body.balanco[0]?.values || body.dre[0]?.values || { _: 0 });
    const lastYear = years.sort().reverse()[0] || "_";

    for (const row of allRows) {
      const text = `${row.conta} ${row.descricao}`.trim();
      const emb = await generateEmbedding(text);
      const norm = await normalizeAccount(supabase, row.descricao || row.conta, emb);
      if (norm.matched) mappedCount++;
      const valor = Number(row.values[lastYear] || 0);
      const { tipo } = classifyAccount(norm.termo_padrao + " " + row.descricao);
      normalizedRows.push({
        conta_original: row.descricao || row.conta,
        conta_normalizada: norm.termo_padrao,
        valor,
        tipo,
        categoria: norm.categoria,
        matched: norm.matched,
      });
    }

    // 3. Persistir balancete_data
    if (normalizedRows.length > 0) {
      await supabase.from("balancete_data").insert(
        normalizedRows.map((r) => ({
          document_id: documentId,
          conta_original: r.conta_original,
          conta_normalizada: r.conta_normalizada,
          valor: r.valor,
          tipo: r.tipo,
          categoria: r.categoria,
        })),
      );
    }

    // 4. Validador contábil
    const validation = validateBalanco(normalizedRows);

    // 5. Few-shot retrieval
    const summaryText =
      `Balancete ${body.documentInfo?.empresa || ""} ${body.documentInfo?.periodo || ""} ` +
      normalizedRows
        .slice(0, 20)
        .map((r) => `${r.conta_normalizada}:${r.valor.toFixed(0)}`)
        .join(" | ");
    const docEmbedding = await generateEmbedding(summaryText);
    const fewShot = await fetchFewShotExamples(supabase, docEmbedding, 3);

    if (docEmbedding) {
      await supabase.from("pipeline_embeddings").insert({
        document_id: documentId,
        tipo: "balancete",
        text_content: summaryText,
        embedding: docEmbedding as any,
        metadata: { mapped: mappedCount, total: normalizedRows.length },
      });
    }

    // 6. Score de qualidade
    const ocrScore = Math.max(0, Math.min(1, body.ocr_score ?? 0.85));
    const mappingScore = normalizedRows.length > 0 ? mappedCount / normalizedRows.length : 0;
    const validationScore = validation.valid ? 1 : Math.max(0, 1 - validation.diff / Math.max(validation.ativo, 1));
    const qualityScore = ocrScore * 0.3 + mappingScore * 0.3 + validationScore * 0.4;

    // 7. Persistir analysis_results
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

    // 8. Resposta
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
