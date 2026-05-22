
-- 1) audit_logs INSERT: restrict to owner of referenced audit (or privileged roles)
DROP POLICY IF EXISTS alogs_ins ON public.audit_logs;
CREATE POLICY alogs_ins ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.audits a WHERE a.id = audit_logs.audit_id AND a.created_by = auth.uid())
  OR public.has_role(auth.uid(), 'gestor_ia'::public.app_role)
  OR public.has_role(auth.uid(), 'coordenadora'::public.app_role)
);

-- 2) login_attempts INSERT: only allow service_role to insert (server-side logging)
DROP POLICY IF EXISTS la_ins ON public.login_attempts;
CREATE POLICY la_ins ON public.login_attempts
FOR INSERT TO service_role
WITH CHECK (true);

-- 3) email-assets storage bucket: explicit UPDATE/DELETE policies (managers only)
DROP POLICY IF EXISTS email_assets_managers_update ON storage.objects;
CREATE POLICY email_assets_managers_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'email-assets' AND (public.has_role(auth.uid(), 'gestor_ia'::public.app_role) OR public.has_role(auth.uid(), 'coordenadora'::public.app_role)))
WITH CHECK (bucket_id = 'email-assets' AND (public.has_role(auth.uid(), 'gestor_ia'::public.app_role) OR public.has_role(auth.uid(), 'coordenadora'::public.app_role)));

DROP POLICY IF EXISTS email_assets_managers_delete ON storage.objects;
CREATE POLICY email_assets_managers_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'email-assets' AND (public.has_role(auth.uid(), 'gestor_ia'::public.app_role) OR public.has_role(auth.uid(), 'coordenadora'::public.app_role)));
