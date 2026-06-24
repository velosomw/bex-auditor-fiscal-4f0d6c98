// Tests a prompt against either Lovable AI Gateway or GCP Gemini (failover).
// Used in /gestor-ia/agentes > API Gateway tab.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callLovable(prompt: string, model: string) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const t0 = Date.now();
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, latency_ms: Date.now() - t0, body: text.slice(0, 2000) };
}

async function callGCP(prompt: string, model: string, endpoint: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY ausente — configure o secret para usar o modo GCP");
  const t0 = Date.now();
  const url = `${endpoint.replace(/\/$/, "")}/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, latency_ms: Date.now() - t0, body: text.slice(0, 2000) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supaUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supaUrl, service);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isGestor = (roles ?? []).some((r: any) => r.role === "gestor_ia");
    if (!isGestor) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = (body.prompt ?? "Olá, responda em uma frase: tudo certo?").toString();
    const mode = body.mode === "gcp" ? "gcp" : "lovable";

    const { data: cfg } = await admin.from("ai_gateway_config").select("*").eq("id", true).maybeSingle();
    const lovableModel = cfg?.default_model ?? "google/gemini-3-flash-preview";
    const gcpModel = cfg?.gcp_model ?? "gemini-2.5-flash";
    const endpoint = cfg?.gcp_endpoint ?? "https://generativelanguage.googleapis.com/v1beta";

    const result = mode === "gcp"
      ? await callGCP(prompt, gcpModel, endpoint)
      : await callLovable(prompt, lovableModel);

    return new Response(JSON.stringify({ ok: true, mode, model: mode === "gcp" ? gcpModel : lovableModel, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
