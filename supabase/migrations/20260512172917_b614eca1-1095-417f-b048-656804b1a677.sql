
CREATE OR REPLACE FUNCTION public.ai_jobs_timeseries(p_window text DEFAULT '24h')
RETURNS TABLE(
  bucket timestamptz,
  enqueued bigint,
  completed bigint,
  failed bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_interval interval;
  v_step interval;
  v_trunc text;
BEGIN
  IF NOT (has_role(auth.uid(), 'gestor_ia'::app_role)
       OR has_role(auth.uid(), 'coordenadora'::app_role)
       OR has_role(auth.uid(), 'auditor_chefe'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_window = '7d' THEN
    v_interval := interval '7 days';
    v_step := interval '1 day';
    v_trunc := 'day';
  ELSE
    v_interval := interval '24 hours';
    v_step := interval '1 hour';
    v_trunc := 'hour';
  END IF;

  RETURN QUERY
  WITH series AS (
    SELECT generate_series(
      date_trunc(v_trunc, now() - v_interval),
      date_trunc(v_trunc, now()),
      v_step
    ) AS b
  ),
  enq AS (
    SELECT date_trunc(v_trunc, queued_at) AS b, COUNT(*) AS c
      FROM public.ai_jobs
     WHERE queued_at >= now() - v_interval
     GROUP BY 1
  ),
  done AS (
    SELECT date_trunc(v_trunc, finished_at) AS b, COUNT(*) AS c
      FROM public.ai_jobs
     WHERE status = 'completed' AND finished_at >= now() - v_interval
     GROUP BY 1
  ),
  fail AS (
    SELECT date_trunc(v_trunc, finished_at) AS b, COUNT(*) AS c
      FROM public.ai_jobs
     WHERE status = 'failed' AND finished_at >= now() - v_interval
     GROUP BY 1
  )
  SELECT s.b,
         COALESCE(e.c, 0)::bigint,
         COALESCE(d.c, 0)::bigint,
         COALESCE(f.c, 0)::bigint
    FROM series s
    LEFT JOIN enq e ON e.b = s.b
    LEFT JOIN done d ON d.b = s.b
    LEFT JOIN fail f ON f.b = s.b
   ORDER BY s.b;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_jobs_timeseries(text) TO authenticated;
