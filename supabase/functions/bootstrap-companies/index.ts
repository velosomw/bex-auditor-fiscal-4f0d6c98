import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Use auditor chefe as created_by for companies
    const auditorId = "2fd3f004-8ff2-423d-aee2-3574d1ca2ab2";

    const newUsers = [
      { email: "empresax@empresa.com.br", password: "EmpresaX@2026#Portal!", full_name: "Empresa X" },
      { email: "empresay@empresa.com.br", password: "EmpresaY@2026#Portal!", full_name: "Empresa Y" },
      { email: "empresaz@empresa.com.br", password: "EmpresaZ@2026#Portal!", full_name: "Empresa Z" },
    ];

    const createdUsers: any[] = [];
    for (const u of newUsers) {
      const { data: existing } = await admin.auth.admin.listUsers();
      const found = existing?.users?.find((x: any) => x.email === u.email);
      let userId = found?.id;
      if (!userId) {
        const { data, error } = await admin.auth.admin.createUser({
          email: u.email, password: u.password, email_confirm: true,
          user_metadata: { full_name: u.full_name },
        });
        if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
        userId = data.user.id;
      }
      await admin.from("profiles").upsert({ user_id: userId, full_name: u.full_name }, { onConflict: "user_id" });
      // role
      const { data: rolesExisting } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "empresa");
      if (!rolesExisting || rolesExisting.length === 0) {
        await admin.from("user_roles").insert({ user_id: userId, role: "empresa" });
      }
      createdUsers.push({ email: u.email, user_id: userId, password: u.password });
    }

    // Companies
    const companies = [
      { name: "Empresa Demonstração S.A.", cnpj: "00.000.000/0001-00", sector: "Indústria" },
      { name: "Empresa X Ltda.", cnpj: "11.111.111/0001-11", sector: "Varejo" },
      { name: "Empresa Y S.A.", cnpj: "22.222.222/0001-22", sector: "Serviços" },
      { name: "Empresa Z Holding", cnpj: "33.333.333/0001-33", sector: "Tecnologia" },
    ];

    const createdCompanies: any[] = [];
    for (const c of companies) {
      const { data: ex } = await admin.from("companies").select("id").eq("name", c.name).maybeSingle();
      if (ex) { createdCompanies.push({ ...c, id: ex.id, status: "exists" }); continue; }
      const { data, error } = await admin.from("companies").insert({ ...c, created_by: auditorId }).select().single();
      if (error) throw new Error(`company ${c.name}: ${error.message}`);
      createdCompanies.push({ ...data, status: "created" });
    }

    return new Response(JSON.stringify({ success: true, users: createdUsers, companies: createdCompanies }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
