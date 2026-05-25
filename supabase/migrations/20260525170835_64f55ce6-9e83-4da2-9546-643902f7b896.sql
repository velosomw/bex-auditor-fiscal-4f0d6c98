ALTER TABLE public.bs_dados
  ADD COLUMN IF NOT EXISTS ytd_flags jsonb;

COMMENT ON COLUMN public.bs_dados.ytd_flags IS
  'Flags YTD por m\u00eas: { is_ytd_input: bool (usu\u00e1rio marcou), ytd_desacumulado: bool (reconstru\u00e7\u00e3o exata aplicada), ytd_outlier_flag: bool (detec\u00e7\u00e3o autom\u00e1tica isolada, sem normaliza\u00e7\u00e3o), ytd_source_count: int (qtd de balancetes YTD consecutivos usados na subtra\u00e7\u00e3o) }';