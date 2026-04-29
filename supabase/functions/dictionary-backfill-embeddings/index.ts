// Item 6: Backfill de embeddings para os 529 termos do contabil_dictionary.
// Custo único estimado: ~US$ 0,05.
// Modelo: google/text-embedding-004 via Lovable AI Gateway (sem API key extra).
// Idempotente: só processa rows com embedding IS NULL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function embed(text: string): Promise<number[] | null> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({ model: "google/text-embedding-004", input: text }),
    });
    if (!r.ok) {
      console.warn("embed failed", r.status, await r.text().catch(() => ""));
      return null;
    }
    const j = await r.json();
    return j?.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.warn("embed error", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: só usuários logados disparam
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (!claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit) || 600, 1000);
  const dryRun = Boolean(body.dryRun);

  const { data: rows, error } = await sb
    .from("contabil_dictionary")
    .select("id, termo_original, termo_padrao, categoria")
    .is("embedding", null)
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const total = rows?.length ?? 0;
  if (dryRun) {
    return new Response(JSON.stringify({ dryRun: true, pending: total }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let ok = 0;
  let fail = 0;
  // Pequeno paralelismo (3) para evitar rate limit
  const batchSize = 3;
  for (let i = 0; i < total; i += batchSize) {
    const chunk = rows!.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (r: any) => {
        const text = `${r.termo_original ?? ""} | ${r.termo_padrao ?? ""} | ${r.categoria ?? ""}`.trim();
        if (!text) {
          fail++;
          return;
        }
        const emb = await embed(text);
        if (!emb) {
          fail++;
          return;
        }
        const { error: uErr } = await sb
          .from("contabil_dictionary")
          .update({ embedding: emb as any })
          .eq("id", r.id);
        if (uErr) {
          console.warn("update failed", uErr.message);
          fail++;
        } else {
          ok++;
        }
      }),
    );
  }

  // Log de custo (estimativa: ~$0.0001 por embedding em text-embedding-004)
  const estimatedCostUsd = ok * 0.0001;
  await sb.from("ai_usage_logs").insert({
    type: "backfill",
    provider: "google",
    service: "embedding",
    tokens_input: ok * 32, // ~32 tokens por termo
    tokens_output: 0,
    requests: ok,
    cost_calculated: estimatedCostUsd,
    metadata: { task: "dictionary_backfill", total, ok, fail },
    created_by: claims.claims.sub,
  });

  return new Response(
    JSON.stringify({ total, ok, fail, estimatedCostUsd }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
