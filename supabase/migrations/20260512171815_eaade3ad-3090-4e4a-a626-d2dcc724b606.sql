
-- ============================================================
-- BEx — Fila assíncrona de jobs de IA (insights + relatórios)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('insight','report','custom')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  priority smallint NOT NULL DEFAULT 5,
  requested_by uuid NOT NULL,
  document_id uuid,
  company_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_message text,
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 3,
  pgmq_msg_id bigint,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_jobs_status_priority_idx
  ON public.ai_jobs (status, priority DESC, queued_at ASC);
CREATE INDEX IF NOT EXISTS ai_jobs_requested_by_idx
  ON public.ai_jobs (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_jobs_company_idx
  ON public.ai_jobs (company_id, status);

-- updated_at trigger (reusa função padrão do projeto)
DROP TRIGGER IF EXISTS trg_ai_jobs_updated ON public.ai_jobs;
CREATE TRIGGER trg_ai_jobs_updated
BEFORE UPDATE ON public.ai_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_jobs_insert_own"
ON public.ai_jobs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "ai_jobs_select_own_or_mgr"
ON public.ai_jobs FOR SELECT TO authenticated
USING (
  auth.uid() = requested_by
  OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
  OR public.has_role(auth.uid(), 'coordenadora'::app_role)
  OR public.has_role(auth.uid(), 'auditor_chefe'::app_role)
);

CREATE POLICY "ai_jobs_update_mgr"
ON public.ai_jobs FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor_ia'::app_role)
  OR public.has_role(auth.uid(), 'coordenadora'::app_role)
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_jobs;

-- ──────────────────────────────────────────────────
-- RPC: claim_batch — worker reserva jobs sem corrida
-- ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_jobs_claim_batch(p_limit int DEFAULT 3)
RETURNS SETOF public.ai_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_jobs AS (
    SELECT id
    FROM public.ai_jobs
    WHERE status = 'queued'
      AND attempts < max_attempts
    ORDER BY priority DESC, queued_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_jobs j
     SET status = 'processing',
         started_at = now(),
         attempts = j.attempts + 1
    FROM next_jobs n
   WHERE j.id = n.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_jobs_claim_batch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_jobs_claim_batch(int) TO service_role;

-- Garante que as filas pgmq existem (idempotente)
DO $$
BEGIN
  PERFORM pgmq.create('bex_ai_jobs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM pgmq.create('bex_ai_jobs_dlq');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
