// Returns AI gateway config + secret presence + queue health (Gestor IA only)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supaUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supaUrl, service);

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isGestor = (roles ?? []).some((r: any) => r.role === "gestor_ia" || r.role === "coordenadora");
    if (!isGestor) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await admin
      .from("ai_gateway_config")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    const secrets = {
      LOVABLE_API_KEY: !!Deno.env.get("LOVABLE_API_KEY"),
      GEMINI_API_KEY: !!Deno.env.get("GEMINI_API_KEY"),
      GOOGLE_DOCUMENT_AI_API_KEY: !!Deno.env.get("GOOGLE_DOCUMENT_AI_API_KEY"),
      SEND_EMAIL_HOOK_SECRET: !!Deno.env.get("SEND_EMAIL_HOOK_SECRET"),
    };

    let queueStats: any = null;
    try {
      const { data } = await admin.rpc("ai_jobs_queue_stats");
      queueStats = data;
    } catch (_) { /* ignore */ }

    // Email queue counts via pgmq (best-effort)
    let emailQueue: any = { pending: null, dlq: null };
    try {
      const { data: q } = await admin.rpc as any;
      // Try a raw query via Postgres function — if not present, leave null.
    } catch (_) { /* ignore */ }

    // Recent jobs (last 10)
    const { data: recent } = await admin
      .from("ai_jobs")
      .select("id,kind,status,attempts,queued_at,finished_at,error_message")
      .order("queued_at", { ascending: false })
      .limit(10);

    return new Response(JSON.stringify({
      ok: true,
      config: config ?? { mode: "lovable" },
      secrets,
      queueStats,
      emailQueue,
      recentJobs: recent ?? [],
      activeMode: (config?.mode === "gcp" && secrets.GEMINI_API_KEY) ? "gcp" : "lovable",
      gcpReady: secrets.GEMINI_API_KEY,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
