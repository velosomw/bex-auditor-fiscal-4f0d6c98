ALTER TABLE public.audit_reports
  ADD COLUMN IF NOT EXISTS balancete_entries jsonb,
  ADD COLUMN IF NOT EXISTS periodos text[];