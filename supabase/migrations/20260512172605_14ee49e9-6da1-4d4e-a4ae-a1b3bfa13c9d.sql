
-- RPCs for AI Jobs queue monitoring (gestor panel)

CREATE OR REPLACE FUNCTION public.ai_jobs_queue_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_can boolean;
  v_stats jsonb;
  v_pgmq_count bigint := 0;
  v_dlq_count bigint := 0;
BEGIN
  v_can := has_role(auth.uid(), 'gestor_ia'::app_role)
        OR has_role(auth.uid(), 'coordenadora'::app_role)
        OR has_role(auth.uid(), 'auditor_chefe'::app_role);
  IF NOT v_can THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'queued',     COUNT(*) FILTER (WHERE status = 'queued'),
    'processing', COUNT(*) FILTER (WHERE status = 'processing'),
    'completed',  COUNT(*) FILTER (WHERE status = 'completed'),
    'failed',     COUNT(*) FILTER (WHERE status = 'failed'),
    'total',      COUNT(*),
    'avg_duration_ms', COALESCE(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)
                                FILTER (WHERE status = 'completed'), 0),
    'last_24h_failed', COUNT(*) FILTER (WHERE status = 'failed' AND finished_at > now() - interval '24 hours'),
    'last_24h_completed', COUNT(*) FILTER (WHERE status = 'completed' AND finished_at > now() - interval '24 hours')
  ) INTO v_stats
  FROM public.ai_jobs;

  BEGIN
    SELECT COUNT(*) INTO v_pgmq_count FROM pgmq.q_bex_ai_jobs;
  EXCEPTION WHEN OTHERS THEN v_pgmq_count := 0; END;

  BEGIN
    SELECT COUNT(*) INTO v_dlq_count FROM pgmq.q_bex_ai_jobs_dlq;
  EXCEPTION WHEN OTHERS THEN v_dlq_count := 0; END;

  RETURN v_stats || jsonb_build_object(
    'pgmq_pending', v_pgmq_count,
    'dlq_pending',  v_dlq_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_jobs_dlq_peek(p_limit int DEFAULT 50)
RETURNS TABLE(msg_id bigint, enqueued_at timestamptz, read_ct int, message jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'gestor_ia'::app_role)
       OR has_role(auth.uid(), 'coordenadora'::app_role)
       OR has_role(auth.uid(), 'auditor_chefe'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT q.msg_id, q.enqueued_at, q.read_ct, q.message
  FROM pgmq.q_bex_ai_jobs_dlq q
  ORDER BY q.enqueued_at DESC
  LIMIT p_limit;
EXCEPTION WHEN undefined_table THEN
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_jobs_retry(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.ai_jobs%ROWTYPE;
  v_msg_id bigint;
BEGIN
  IF NOT (has_role(auth.uid(), 'gestor_ia'::app_role)
       OR has_role(auth.uid(), 'coordenadora'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_job FROM public.ai_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found'; END IF;

  UPDATE public.ai_jobs
     SET status = 'queued',
         attempts = 0,
         error_message = NULL,
         started_at = NULL,
         finished_at = NULL,
         queued_at = now()
   WHERE id = p_job_id;

  SELECT pgmq.send('bex_ai_jobs', jsonb_build_object('job_id', p_job_id)) INTO v_msg_id;
  UPDATE public.ai_jobs SET pgmq_msg_id = v_msg_id WHERE id = p_job_id;

  RETURN jsonb_build_object('ok', true, 'msg_id', v_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_jobs_dlq_purge(p_msg_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'gestor_ia'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  PERFORM pgmq.delete('bex_ai_jobs_dlq', p_msg_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_jobs_queue_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_jobs_dlq_peek(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_jobs_retry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_jobs_dlq_purge(bigint) TO authenticated;
