ALTER TABLE public.kanitz_scores
  ADD COLUMN IF NOT EXISTS passivo_total numeric,
  ADD COLUMN IF NOT EXISTS isg numeric,
  ADD COLUMN IF NOT EXISTS isg_rating text,
  ADD COLUMN IF NOT EXISTS modelo_preferencial text CHECK (modelo_preferencial IN ('kanitz','isg'));