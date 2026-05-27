ALTER TABLE public.bs_dados
  ADD COLUMN IF NOT EXISTS realizavel_longo_prazo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS investimentos numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intangivel numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_by_group jsonb,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS validation_diagnostics jsonb;

COMMENT ON COLUMN public.bs_dados.realizavel_longo_prazo IS 'Subgrupo do ANC: Realizável a Longo Prazo (refs P, Q, R, S, T). Usado em Liquidez Geral.';
COMMENT ON COLUMN public.bs_dados.investimentos IS 'Subgrupo do ANC: Investimentos (ref B1).';
COMMENT ON COLUMN public.bs_dados.intangivel IS 'Subgrupo do ANC: Intangível (ref D1). Imobilizado fica em `imobilizado`.';
COMMENT ON COLUMN public.bs_dados.confidence_by_group IS 'Score de confiança por grupo (AC, ANC, PC, PNC, PL).';
COMMENT ON COLUMN public.bs_dados.validation_status IS 'ok | warn | needs_review — baseado em desvio Ativo vs Passivo+PL.';
COMMENT ON COLUMN public.bs_dados.validation_diagnostics IS 'Diagnóstico estruturado da validação contábil (desvio, contribuintes, flags).';