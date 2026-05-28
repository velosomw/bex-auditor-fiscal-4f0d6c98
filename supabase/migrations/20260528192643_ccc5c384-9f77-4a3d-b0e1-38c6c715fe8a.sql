
-- Tighten audit_logs INSERT: restrict to service_role and management roles only.
DROP POLICY IF EXISTS "alogs_ins" ON public.audit_logs;
CREATE POLICY "alogs_ins" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenadora'::app_role)
    OR has_role(auth.uid(), 'auditor_chefe'::app_role)
  );

-- Tighten login_attempts SELECT: restrict to authenticated users explicitly.
DROP POLICY IF EXISTS "Gestor IA pode visualizar todas as tentativas de login" ON public.login_attempts;
CREATE POLICY "Gestor IA pode visualizar todas as tentativas de login"
  ON public.login_attempts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role));
