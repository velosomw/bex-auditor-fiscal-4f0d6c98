
-- Restrict SECURITY DEFINER functions from anon/public; keep only what frontend needs

-- Internal/admin helpers (already gate by has_role inside, but revoke API access)
REVOKE EXECUTE ON FUNCTION public.ai_cost_diagnostics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_claim_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_dlq_peek(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_dlq_purge(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_queue_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_retry(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_jobs_timeseries(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_ai_cost(text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Grant to service_role only (edge functions use service role)
GRANT EXECUTE ON FUNCTION public.ai_cost_diagnostics() TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_jobs_claim_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_jobs_dlq_peek(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_jobs_dlq_purge(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_jobs_queue_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_jobs_retry(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_jobs_timeseries(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_ai_cost(text, numeric, numeric, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

-- Restrict match_* RPCs to authenticated users only (not anon)
REVOKE EXECUTE ON FUNCTION public.match_contabil_dictionary(vector, double precision, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_dataset_validated(vector, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_contabil_dictionary(vector, double precision, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_dataset_validated(vector, double precision, integer) TO authenticated, service_role;
