-- 1. Adicionar colunas em ai_cost_config
ALTER TABLE public.ai_cost_config
  ADD COLUMN IF NOT EXISTS cost_per_page numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

-- 2. Adicionar colunas em ai_usage_logs
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS pages numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_id uuid;

-- 3. Índices de performance
CREATE INDEX IF NOT EXISTS idx_ai_usage_type ON public.ai_usage_logs(type);
CREATE INDEX IF NOT EXISTS idx_ai_usage_service ON public.ai_usage_logs(service);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON public.ai_usage_logs(created_at);

-- 4. Função de cálculo de custo
CREATE OR REPLACE FUNCTION public.calculate_ai_cost(
  p_service text,
  p_tokens_input numeric,
  p_tokens_output numeric,
  p_requests numeric,
  p_pages numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg record;
  total numeric := 0;
BEGIN
  SELECT * INTO cfg
  FROM public.ai_cost_config
  WHERE service = p_service AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  total :=
    COALESCE((p_tokens_input / 1000.0) * cfg.cost_per_1k_input, 0) +
    COALESCE((p_tokens_output / 1000.0) * cfg.cost_per_1k_output, 0) +
    COALESCE(p_requests * cfg.cost_per_request, 0) +
    COALESCE(p_pages * cfg.cost_per_page, 0) +
    COALESCE(cfg.cost_fixed, 0);

  RETURN total;
END;
$$;

-- 5. Trigger auto-cálculo (recalcula se vier zerado)
CREATE OR REPLACE FUNCTION public.trg_calculate_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cost_calculated IS NULL OR NEW.cost_calculated = 0 THEN
    NEW.cost_calculated := public.calculate_ai_cost(
      NEW.service,
      NEW.tokens_input,
      NEW.tokens_output,
      NEW.requests,
      NEW.pages
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_insert_ai_cost ON public.ai_usage_logs;
CREATE TRIGGER before_insert_ai_cost
BEFORE INSERT ON public.ai_usage_logs
FOR EACH ROW
EXECUTE FUNCTION public.trg_calculate_cost();

-- 6. View agregada
CREATE OR REPLACE VIEW public.ai_cost_summary AS
SELECT
  type,
  service,
  SUM(tokens_input) AS total_input_tokens,
  SUM(tokens_output) AS total_output_tokens,
  SUM(pages) AS total_pages,
  SUM(requests) AS total_requests,
  SUM(cost_calculated) AS total_cost
FROM public.ai_usage_logs
GROUP BY type, service;

-- 7. Função de diagnóstico
CREATE OR REPLACE FUNCTION public.ai_cost_diagnostics()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'maior_custo_servico',
      (SELECT service FROM public.ai_cost_summary ORDER BY total_cost DESC NULLS LAST LIMIT 1),
    'custo_total',
      (SELECT COALESCE(SUM(cost_calculated), 0) FROM public.ai_usage_logs),
    'custo_por_tipo',
      (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
       FROM (
         SELECT type, SUM(cost_calculated) AS total
         FROM public.ai_usage_logs
         GROUP BY type
       ) t)
  ) INTO result;

  RETURN result;
END;
$$;

-- 8. Seeds atualizados 2026 (upsert por service)
INSERT INTO public.ai_cost_config (provider, service, label, cost_per_1k_input, cost_per_1k_output, cost_per_request, cost_per_page, cost_fixed, currency, active, notes)
VALUES
  ('google', 'gemini_2_5_flash', 'Gemini 2.5 Flash (parsing/mapping)', 0.00035, 0.00070, 0, 0, 0, 'USD', true, 'Modelo barato e rápido — usado em balancete e mapping em alta escala.'),
  ('google', 'gemini_2_5_pro',   'Gemini 2.5 Pro (insights/relatório)', 0.0035, 0.0105, 0, 0, 0, 'USD', true, 'Modelo de raciocínio — usar apenas em insights finais e relatórios.'),
  ('google', 'embedding',        'Vertex AI Embeddings', 0.00010, 0, 0, 0, 0, 'USD', true, 'Embeddings para busca semântica e dicionário contábil.'),
  ('google', 'document_ai',      'Google Document AI (OCR)', 0, 0, 0, 0.015, 0, 'USD', true, 'OCR por página — varia entre $0.01 e $0.03 conforme processor.'),
  ('internal', 'storage_supabase','Storage Lovable Cloud', 0, 0, 0, 0, 0.0002, 'USD', true, 'Custo fixo estimado por execução (storage).'),
  ('internal', 'infra_compute',  'Infra / Compute', 0, 0, 0, 0, 0.0005, 'USD', true, 'Custo fixo estimado de compute por execução.')
ON CONFLICT (service) DO UPDATE SET
  provider = EXCLUDED.provider,
  label = EXCLUDED.label,
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  cost_per_request = EXCLUDED.cost_per_request,
  cost_per_page = EXCLUDED.cost_per_page,
  cost_fixed = EXCLUDED.cost_fixed,
  currency = EXCLUDED.currency,
  active = EXCLUDED.active,
  notes = EXCLUDED.notes,
  updated_at = now();