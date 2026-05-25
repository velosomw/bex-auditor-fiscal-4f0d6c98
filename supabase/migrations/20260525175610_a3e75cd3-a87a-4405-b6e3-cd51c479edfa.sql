-- Estende bs_dados com colunas calculadas pela edge function mas que não eram persistidas.
-- Inclui campos de balanço completo (ANC, PNC, PL, totais), DRE estendida (despesas financeiras,
-- depreciação, amortização) e valores brutos pré-cap para auditoria visual (estoques/dívida).
ALTER TABLE public.bs_dados
  ADD COLUMN IF NOT EXISTS ativo_nao_circulante numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passivo_nao_circulante numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS patrimonio_liquido numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ativo_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passivo_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS despesas_financeiras numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciacao numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amortizacao numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contas_receber numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS imobilizado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outras_obrigacoes numeric NOT NULL DEFAULT 0,
  -- Valores brutos antes do cap (para UI mostrar antes/depois)
  ADD COLUMN IF NOT EXISTS estoques_bruto numeric,
  ADD COLUMN IF NOT EXISTS divida_total_bruto numeric;

COMMENT ON COLUMN public.bs_dados.patrimonio_liquido IS 'PL preserva sinal (pode ser negativo em passivo a descoberto).';
COMMENT ON COLUMN public.bs_dados.estoques_bruto IS 'Valor de estoques antes do cap automático (>85% AC); NULL quando não houve cap.';
COMMENT ON COLUMN public.bs_dados.divida_total_bruto IS 'Dívida total bruta antes do cap (>110% passivo); NULL quando não houve cap.';