-- 1) Preços reais Gemini 2.5 (Nov/2025) em USD por 1k tokens
-- Gemini 2.5 Flash: $0.000075/1k input, $0.0003/1k output (mantém — já correto)
-- Gemini 2.5 Pro:   $0.00125/1k input,  $0.01/1k output (corrige bug anterior)
-- Document AI OCR:  $0.0015/página (Form Parser) — atual $0.009 está alto
-- Embedding (text-embedding-004): $0.0001/1k tokens (atual $0.009/1k está 90× alto)

UPDATE public.ai_cost_config
SET cost_per_1k_input = 0.00125,
    cost_per_1k_output = 0.01,
    notes = 'Gemini 2.5 Pro - preços reais Google (Nov/2025), até 200k tokens'
WHERE service = 'gemini_pro';

UPDATE public.ai_cost_config
SET cost_per_1k_input = 0.000075,
    cost_per_1k_output = 0.0003,
    notes = 'Gemini 2.5 Flash - preços reais Google (Nov/2025)'
WHERE service = 'gemini_flash';

UPDATE public.ai_cost_config
SET cost_per_page = 0.0015,
    notes = 'Document AI Form Parser - $0.0015/página (volume <1M)'
WHERE service = 'document_ai';

UPDATE public.ai_cost_config
SET cost_per_1k_input = 0.0001,
    notes = 'text-embedding-004 - $0.0001/1k tokens'
WHERE service = 'embedding';

-- 2) Neutralizar os 3 logs de gemini_flash com custo inflado (~R$ 1,15 por 35k tokens)
-- Custo correto seria: 35700 * 0.000075 / 1000 + 3000 * 0.0003 / 1000 ≈ $0.0036
-- Inserimos ajustes negativos para zerar o excesso sem violar imutabilidade dos logs originais.
INSERT INTO public.ai_usage_logs (type, provider, service, document_id, tokens_input, tokens_output, requests, pages, cost_calculated, metadata)
SELECT
  'adjustment',
  l.provider,
  l.service,
  l.document_id,
  0, 0, 0, 0,
  -- delta: corretoEsperado - custoRegistrado
  (
    (l.tokens_input::numeric / 1000) * 0.000075 +
    (l.tokens_output::numeric / 1000) * 0.0003
  ) - l.cost_calculated,
  jsonb_build_object(
    'reason', 'price_table_correction_2025_11',
    'source_log_id', l.id::text,
    'original_cost', l.cost_calculated,
    'corrected_cost', (l.tokens_input::numeric / 1000) * 0.000075 + (l.tokens_output::numeric / 1000) * 0.0003
  )
FROM public.ai_usage_logs l
WHERE l.service = 'gemini_flash'
  AND l.cost_calculated > 0.5
  AND NOT EXISTS (
    SELECT 1 FROM public.ai_usage_logs adj
    WHERE adj.type = 'adjustment'
      AND adj.metadata->>'source_log_id' = l.id::text
      AND adj.metadata->>'reason' = 'price_table_correction_2025_11'
  );