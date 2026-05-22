import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list';

    if (action === 'list') {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;
      const all = data.users.map(u => ({ id: u.id, email: u.email, confirmed: !!u.email_confirmed_at, last_sign_in: u.last_sign_in_at }));
      return new Response(JSON.stringify({ all, total: data.users.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'reset') {
      const { email, password } = body;
      if (!email || !password) return new Response(JSON.stringify({ error: 'email+password required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const u = list.users.find(x => x.email === email);
      if (!u) return new Response(JSON.stringify({ error: 'user_not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { error } = await admin.auth.admin.updateUserById(u.id, { password, email_confirm: true });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, id: u.id, email }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
