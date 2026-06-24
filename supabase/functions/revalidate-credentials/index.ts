import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Role =
  | "gestor_ia"
  | "auditor_chefe"
  | "coordenadora"
  | "usuario"
  | "empresa"
  | "contabilidade";

const SEED: { email: string; password: string; full_name: string; roles: Role[] }[] = [
  { email: "wagner.velosom@gmail.com", password: "Bx9mK47w@bex2025#Gia$", full_name: "Gestor IA (Primário)", roles: ["gestor_ia"] },
  { email: "gestor@gestor.com.br", password: "Jx6mB42s@bex2025#Gia$", full_name: "Gestor IA (Teste)", roles: ["gestor_ia"] },
  { email: "coordenador@bexcontabil.com.br", password: "Hm4dR92x@bex2025#Aud$", full_name: "Auditor Chefe / Coordenador", roles: ["auditor_chefe", "coordenadora"] },
  { email: "usuario@usuario.com.br", password: "Tp7kW31z@bex2025#Usr$", full_name: "Usuário", roles: ["usuario"] },
  { email: "empresax@empresa.com.br", password: "Qn9fL85v@bex2025#Emp$", full_name: "Empresa X", roles: ["empresa"] },
  { email: "empresay@empresa.com.br", password: "Qn9fL85v@bex2025#EmpY$", full_name: "Empresa Y", roles: ["empresa"] },
  { email: "empresaz@empresa.com.br", password: "Qn9fL85v@bex2025#EmpZ$", full_name: "Empresa Z", roles: ["empresa"] },
  { email: "contabilidade@empresa.com.br", password: "Cn8jR53k@bex2025#Cnt$", full_name: "Contabilidade", roles: ["contabilidade"] },
  { email: "ti@brasilexpert.com.br", password: "Cn8jR53k@bex2025#Rvr$", full_name: "Contabilidade (Luiz Rovero)", roles: ["contabilidade"] },
  { email: "wagner.veloso@outlook.com", password: "Cn8jR53k@bex2025#WgT$", full_name: "Contabilidade (Wagner Teste)", roles: ["contabilidade"] },
  { email: "contabilidade1000@contabil.com.br", password: "Cn8jR53k@bex2025#C1k$", full_name: "Contabilidade (1000)", roles: ["contabilidade"] },
  { email: "wagnerxpto@xpto.com", password: "Cn8jR53k@bex2025#Xpt$", full_name: "Contabilidade (XPTO)", roles: ["contabilidade"] },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const results: any[] = [];

  // Find all users (paginated)
  const emailToId = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) if (u.email) emailToId.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
    page++;
  }

  for (const u of SEED) {
    try {
      let userId = emailToId.get(u.email.toLowerCase());
      if (userId) {
        const { error } = await admin.auth.admin.updateUserById(userId, {
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.full_name },
        });
        if (error) throw error;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.full_name },
        });
        if (error) throw error;
        userId = data.user!.id;
      }

      await admin.from("profiles").upsert(
        { user_id: userId, full_name: u.full_name },
        { onConflict: "user_id" }
      );

      await admin.from("user_roles").delete().eq("user_id", userId);
      for (const role of u.roles) {
        await admin.from("user_roles").insert({ user_id: userId, role });
      }

      results.push({ email: u.email, status: "ok", user_id: userId });
    } catch (e: any) {
      results.push({ email: u.email, status: "error", error: e.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
