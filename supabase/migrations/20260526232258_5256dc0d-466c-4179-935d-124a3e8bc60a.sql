ALTER TABLE public.pipeline_documents ADD COLUMN IF NOT EXISTS parser_version text;
ALTER TABLE public.bs_dados ADD COLUMN IF NOT EXISTS patrimonio_liquido_bruto numeric;