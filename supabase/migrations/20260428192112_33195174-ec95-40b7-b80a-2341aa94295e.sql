
-- 1) Inserir aliases hifenizados na tabela de preços (espelhando os underscore)
INSERT INTO public.ai_cost_config (provider, service, label, cost_per_1k_input, cost_per_1k_output, cost_per_request, cost_per_page, cost_fixed, currency, active)
SELECT provider, 'gemini-2.5-pro', label, cost_per_1k_input, cost_per_1k_output, cost_per_request, cost_per_page, cost_fixed, currency, active
FROM public.ai_cost_config WHERE service='gemini_2_5_pro'
ON CONFLICT (service) DO NOTHING;

INSERT INTO public.ai_cost_config (provider, service, label, cost_per_1k_input, cost_per_1k_output, cost_per_request, cost_per_page, cost_fixed, currency, active)
SELECT provider, 'gemini-2.5-flash', label, cost_per_1k_input, cost_per_1k_output, cost_per_request, cost_per_page, cost_fixed, currency, active
FROM public.ai_cost_config WHERE service='gemini_2_5_flash'
ON CONFLICT (service) DO NOTHING;

INSERT INTO public.ai_cost_config (provider, service, label, cost_per_1k_input, cost_per_1k_output, cost_per_request, cost_per_page, cost_fixed, currency, active)
SELECT provider, 'gemini-2.5-flash-lite', label, cost_per_1k_input, cost_per_1k_output, cost_per_request, cost_per_page, cost_fixed, currency, active
FROM public.ai_cost_config WHERE service='gemini_2_5_flash'
ON CONFLICT (service) DO NOTHING;

-- 2) Atualizar calculate_ai_cost para normalizar o nome (hífen/ponto -> underscore)
CREATE OR REPLACE FUNCTION public.calculate_ai_cost(p_service text, p_tokens_input numeric, p_tokens_output numeric, p_requests numeric, p_pages numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg record;
  total numeric := 0;
  norm_service text;
BEGIN
  -- Tenta primeiro o nome exato
  SELECT * INTO cfg
  FROM public.ai_cost_config
  WHERE service = p_service AND active = true
  LIMIT 1;

  -- Fallback: normaliza hífens e pontos para underscore
  IF NOT FOUND THEN
    norm_service := replace(replace(p_service, '-', '_'), '.', '_');
    SELECT * INTO cfg
    FROM public.ai_cost_config
    WHERE service = norm_service AND active = true
    LIMIT 1;
  END IF;

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
$function$;

-- 3) Inserir logs de ajuste para os 4 logs antigos zerados
INSERT INTO public.ai_usage_logs (type, provider, service, document_id, tokens_input, tokens_output, requests, pages, cost_calculated, metadata, created_by)
SELECT
  'adjustment',
  l.provider,
  l.service,
  l.document_id,
  0, 0, 0, 0,
  public.calculate_ai_cost(l.service, l.tokens_input, l.tokens_output, l.requests, l.pages) - l.cost_calculated,
  jsonb_build_object('source_log_id', l.id, 'reason', 'service_alias_fix', 'original', l.cost_calculated),
  l.created_by
FROM public.ai_usage_logs l
WHERE l.service IN ('gemini-2.5-pro','gemini-2.5-flash','gemini-2.5-flash-lite')
  AND l.cost_calculated = 0
  AND (l.tokens_input + l.tokens_output + l.requests + l.pages) > 0;
