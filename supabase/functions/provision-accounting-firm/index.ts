import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PendingCompany {
  name: string;
  cnpj?: string;
  city?: string;
  contact_name?: string;
  phone?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // --- Auth: must be gestor_ia / coordenadora / auditor_chefe ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser } } = await caller.auth.getUser();
    if (!callerUser) return json({ error: "Unauthorized" }, 401);

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .in("role", ["gestor_ia", "coordenadora", "auditor_chefe"]);
    if (!callerRoles || callerRoles.length === 0) return json({ error: "Forbidden" }, 403);

    // --- Input ---
    const body = await req.json().catch(() => ({}));
    const firm_id: string | undefined = body?.firm_id;
    const redirect_to: string | undefined = body?.redirect_to;
    if (!firm_id) return json({ error: "Missing firm_id" }, 400);

    // --- Load firm ---
    const { data: firm, error: firmErr } = await admin
      .from("accounting_firms")
      .select("id, name, email, cnpj, phone, status, user_id, metadata")
      .eq("id", firm_id)
      .maybeSingle();
    if (firmErr || !firm) return json({ error: "Firm not found" }, 404);
    if (firm.user_id) {
      return json({ error: "Esta contabilidade já está vinculada a um usuário." }, 409);
    }

    const email = String(firm.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Contabilidade sem e-mail" }, 400);

    // --- Create or fetch existing auth user ---
    let userId: string | null = null;
    const tempPassword =
      crypto.randomUUID() + "Aa1!" + crypto.randomUUID().slice(0, 8);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: firm.name },
    });

    if (createErr) {
      // If user already exists, locate it
      const msg = (createErr.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        const { data: list } = await admin.auth.admin.listUsers();
        const existing = list?.users?.find(
          (u) => (u.email || "").toLowerCase() === email,
        );
        if (!existing) return json({ error: createErr.message }, 400);
        userId = existing.id;
      } else {
        return json({ error: createErr.message }, 400);
      }
    } else {
      userId = created.user.id;
    }
    if (!userId) return json({ error: "Falha ao provisionar usuário" }, 500);

    // --- Role ---
    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "contabilidade" }, { onConflict: "user_id,role" });

    // --- Bind firm and activate ---
    await admin
      .from("accounting_firms")
      .update({ user_id: userId, status: "ativa" })
      .eq("id", firm.id);

    // --- Persist pending companies (from metadata.pending_companies) ---
    const pending: PendingCompany[] = Array.isArray(firm?.metadata?.pending_companies)
      ? firm.metadata.pending_companies
      : [];
    let companies_created = 0;
    if (pending.length > 0) {
      const rows = pending
        .filter((c) => c && c.name?.trim())
        .map((c) => ({
          name: c.name.trim(),
          cnpj: c.cnpj?.trim() || null,
          city: c.city?.trim() || null,
          contact_name: c.contact_name?.trim() || null,
          phone: c.phone?.trim() || null,
          accounting_firm_id: firm.id,
          created_by: userId,
          source: "site",
          status: "pendente",
        }));
      if (rows.length > 0) {
        const { error: insErr } = await admin.from("companies").insert(rows);
        if (!insErr) companies_created = rows.length;
      }
      // Clear pending bucket
      const newMeta = { ...(firm.metadata || {}) };
      delete newMeta.pending_companies;
      await admin.from("accounting_firms").update({ metadata: newMeta }).eq("id", firm.id);
    }

    // --- Send password recovery email so the user defines own password ---
    const finalRedirect =
      redirect_to ||
      `${supabaseUrl.replace("https://", "https://").replace(".supabase.co", "")}/reset-password`;
    let invite_sent = false;
    try {
      const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo: finalRedirect,
      });
      invite_sent = !resetErr;
    } catch (_e) {
      invite_sent = false;
    }

    return json({
      success: true,
      user_id: userId,
      companies_created,
      invite_sent,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
