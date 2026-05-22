// Cancela assinatura ou alterna renovação automática
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaUser = createClient(supaUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error } = await supaUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (error || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;
    const { action } = await req.json();

    const supa = createClient(supaUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await supa.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
    if (!sub) return new Response(JSON.stringify({ error: "no subscription" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let update: Record<string, any> = {};
    if (action === "cancel") {
      update = { auto_renew: false, canceled_at: new Date().toISOString(), status: sub.current_period_end ? sub.status : "canceled" };
    } else if (action === "toggle_autorenew") {
      update = { auto_renew: !sub.auto_renew };
    } else if (action === "reactivate") {
      update = { auto_renew: true, canceled_at: null };
    } else {
      return new Response(JSON.stringify({ error: "invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: updated } = await supa.from("subscriptions").update(update).eq("id", sub.id).select().single();
    return new Response(JSON.stringify({ ok: true, subscription: updated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
