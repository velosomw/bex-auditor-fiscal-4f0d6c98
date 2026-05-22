// Webhook AbacatePay — atualiza status de faturas e assinaturas
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const expectedSecret = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("webhook-secret") || new URL(req.url).searchParams.get("webhookSecret");
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "invalid webhook secret" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = await req.json();
    console.log("[abacatepay-webhook] event:", JSON.stringify(payload));

    const event = payload.event || payload.type || "";
    const data = payload.data || payload;
    const billingId = data?.pixQrCode?.id || data?.billing?.id || data?.id;
    if (!billingId) return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: invoice } = await supa.from("subscription_invoices").select("*").eq("abacatepay_billing_id", billingId).maybeSingle();
    if (!invoice) return new Response(JSON.stringify({ ok: true, no_invoice: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (event.includes("paid") || event.includes("PAID")) {
      await supa.from("subscription_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoice.id);
      await supa.from("subscriptions").update({
        status: "active",
        plan_code: "enterprise",
        current_period_start: invoice.period_start,
        current_period_end: invoice.period_end,
      }).eq("id", invoice.subscription_id);
    } else if (event.includes("expired") || event.includes("EXPIRED")) {
      await supa.from("subscription_invoices").update({ status: "expired" }).eq("id", invoice.id);
    } else if (event.includes("failed") || event.includes("FAILED")) {
      await supa.from("subscription_invoices").update({ status: "failed" }).eq("id", invoice.id);
      await supa.from("subscriptions").update({ status: "past_due" }).eq("id", invoice.subscription_id);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
