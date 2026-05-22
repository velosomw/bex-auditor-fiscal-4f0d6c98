// Cria cobrança PIX mensal Enterprise via AbacatePay
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ABACATE_BASE = "https://api.abacatepay.com/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ABACATEPAY_API_KEY");
    if (!apiKey) throw new Error("ABACATEPAY_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supaUser = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsErr } = await supaUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;
    const userEmail = (claims.claims.email as string) || "";

    const supa = createClient(supaUrl, serviceKey);

    // Plano Enterprise
    const { data: plan, error: planErr } = await supa.from("subscription_plans").select("*").eq("code", "enterprise").single();
    if (planErr || !plan) throw new Error("Plano Enterprise não encontrado");

    // Profile p/ nome
    const { data: profile } = await supa.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
    const customerName = profile?.full_name || userEmail.split("@")[0] || "Cliente";

    // Cria/obtém subscription
    let { data: sub } = await supa.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
    if (!sub) {
      const ins = await supa.from("subscriptions").insert({ user_id: userId, plan_code: "enterprise", status: "pending" }).select().single();
      sub = ins.data!;
    } else {
      await supa.from("subscriptions").update({ plan_code: "enterprise", status: "pending" }).eq("id", sub.id);
    }

    // Cria PIX QR Code (cobrança avulsa mensal — renovação via webhook + cron)
    const periodStart = new Date();
    const periodEnd = new Date(); periodEnd.setMonth(periodEnd.getMonth() + 1);
    const expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + 24);

    const pixResp = await fetch(`${ABACATE_BASE}/pixQrCode/create`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: plan.price_cents,
        expiresIn: 86400, // 24h
        description: `Assinatura ${plan.name} BEx Auditoria — ${periodStart.toLocaleDateString("pt-BR")}`,
        customer: {
          name: customerName,
          email: userEmail,
          cellphone: "11999999999",
          taxId: "00000000000",
        },
      }),
    });
    const pixData = await pixResp.json();
    if (!pixResp.ok) {
      console.error("AbacatePay error:", pixData);
      throw new Error(pixData?.error || pixData?.message || "Falha ao criar PIX na AbacatePay");
    }

    const billing = pixData.data || pixData;
    const billingId = billing.id || billing.pixId;
    const qrCode = billing.brCodeBase64 || billing.brCode || billing.qrCode;
    const copyPaste = billing.brCode || billing.copyPaste || billing.pixCopyPaste;

    const { data: invoice, error: invErr } = await supa.from("subscription_invoices").insert({
      subscription_id: sub.id,
      user_id: userId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      amount_cents: plan.price_cents,
      status: "pending",
      abacatepay_billing_id: billingId,
      pix_qr_code: qrCode,
      pix_copy_paste: copyPaste,
      expires_at: expiresAt.toISOString(),
      metadata: billing,
    }).select().single();

    if (invErr) throw invErr;

    return new Response(JSON.stringify({
      invoice_id: invoice.id,
      billing_id: billingId,
      qr_code_base64: qrCode,
      pix_copy_paste: copyPaste,
      amount_cents: plan.price_cents,
      expires_at: expiresAt.toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("create-billing error:", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
