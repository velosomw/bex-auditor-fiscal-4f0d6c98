
-- Revoke EXECUTE from anon and authenticated on internal SECURITY DEFINER helpers.
-- These are admin/internal functions invoked by edge functions (service_role) and
-- should not be callable from client JWTs.
REVOKE EXECUTE ON FUNCTION public.ai_cost_diagnostics() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_claim_batch(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_dlq_peek(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_dlq_purge(bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_queue_stats() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_retry(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_timeseries(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_ai_cost(text, numeric, numeric, numeric, numeric) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
