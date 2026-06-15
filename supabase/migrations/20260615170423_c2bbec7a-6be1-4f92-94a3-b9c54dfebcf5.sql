ALTER TABLE public.report_global_quotas
  ADD COLUMN IF NOT EXISTS meses_extracao_gratuito integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS meses_extracao_pago integer NOT NULL DEFAULT 12;