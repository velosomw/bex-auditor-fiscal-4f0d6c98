
-- 1. login_attempts: drop overly permissive INSERT policy
DROP POLICY IF EXISTS "Permitir inserção de tentativas de login" ON public.login_attempts;

-- 2. pipeline_embeddings: restrict SELECT to owners/managers
DROP POLICY IF EXISTS pe_sel ON public.pipeline_embeddings;
CREATE POLICY pe_sel ON public.pipeline_embeddings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pipeline_documents pd
    WHERE pd.id = pipeline_embeddings.document_id
      AND (
        pd.created_by = auth.uid()
        OR has_role(auth.uid(), 'gestor_ia'::app_role)
        OR has_role(auth.uid(), 'coordenadora'::app_role)
        OR has_role(auth.uid(), 'auditor_chefe'::app_role)
      )
  )
);

-- 3. suppressed_emails: allow managers to review via RLS
DROP POLICY IF EXISTS suppressed_emails_select_mgr ON public.suppressed_emails;
CREATE POLICY suppressed_emails_select_mgr ON public.suppressed_emails
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenadora'::app_role)
);

-- 4. realtime.messages: restrict topic subscriptions to owners of referenced resources
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS realtime_authenticated_owned_topics ON realtime.messages;
CREATE POLICY realtime_authenticated_owned_topics ON realtime.messages
FOR SELECT TO authenticated
USING (
  -- ai_job_<uuid>: only the requester (or managers) can subscribe
  (
    realtime.topic() LIKE 'ai_job_%'
    AND EXISTS (
      SELECT 1 FROM public.ai_jobs j
      WHERE realtime.topic() = 'ai_job_' || j.id::text
        AND (
          j.requested_by = auth.uid()
          OR has_role(auth.uid(), 'gestor_ia'::app_role)
          OR has_role(auth.uid(), 'coordenadora'::app_role)
          OR has_role(auth.uid(), 'auditor_chefe'::app_role)
        )
    )
  )
  OR (
    realtime.topic() LIKE 'pipeline-doc-%'
    AND EXISTS (
      SELECT 1 FROM public.pipeline_documents pd
      WHERE realtime.topic() = 'pipeline-doc-' || pd.id::text
        AND (
          pd.created_by = auth.uid()
          OR has_role(auth.uid(), 'gestor_ia'::app_role)
          OR has_role(auth.uid(), 'coordenadora'::app_role)
          OR has_role(auth.uid(), 'auditor_chefe'::app_role)
        )
    )
  )
  OR (
    realtime.topic() = 'ai_jobs_monitor'
    AND (
      has_role(auth.uid(), 'gestor_ia'::app_role)
      OR has_role(auth.uid(), 'coordenadora'::app_role)
      OR has_role(auth.uid(), 'auditor_chefe'::app_role)
    )
  )
);
