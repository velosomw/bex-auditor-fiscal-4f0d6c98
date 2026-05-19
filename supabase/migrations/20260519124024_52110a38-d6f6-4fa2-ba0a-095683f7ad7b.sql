
-- 1) Recriar view ai_cost_summary como SECURITY INVOKER
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_viewdef('public.ai_cost_summary'::regclass, true) INTO v_def;
  EXECUTE 'DROP VIEW IF EXISTS public.ai_cost_summary CASCADE';
  EXECUTE 'CREATE VIEW public.ai_cost_summary WITH (security_invoker=true) AS ' || v_def;
END $$;

-- 2) Restringir bucket email-assets: remover policies amplas de SELECT em storage.objects ligadas a esse bucket
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='storage' AND c.relname='objects'
      AND pg_get_expr(p.polqual, p.polrelid) ILIKE '%email-assets%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.polname);
  END LOOP;
END $$;

-- Política mínima: somente leitura de objetos específicos (anon e auth) — necessário para emails embutidos
CREATE POLICY "email_assets_public_read_object"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'email-assets');

-- Bloquear LIST/listagem via storage.buckets (não exibir o bucket)
-- Buckets públicos no Supabase ainda permitem GET por key — a política acima preserva isso,
-- mas não há policy de "list objects" sem service role.

-- 3) login_attempts (se existir) — endurecer política
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='login_attempts') THEN
    -- remover INSERT permissivo anônimo se existir
    EXECUTE 'DROP POLICY IF EXISTS login_attempts_insert_anon ON public.login_attempts';
    EXECUTE 'DROP POLICY IF EXISTS la_ins ON public.login_attempts';
    -- recriar com restrição mínima
    EXECUTE $p$CREATE POLICY la_ins ON public.login_attempts FOR INSERT TO anon, authenticated WITH CHECK (status IN ('success','failed','blocked') AND length(coalesce(email,'')) BETWEEN 3 AND 320)$p$;
  END IF;
END $$;
