-- Ajuste contábil universal: recalcula custo com preços atuais e insere delta como 'adjustment'
-- Aplica somente quando: log tem tokens > 0, custo gravado > 0, e divergência > 5×
INSERT INTO public.ai_usage_logs (type, provider, service, document_id, tokens_input, tokens_output, requests, pages, cost_calculated, metadata)
SELECT
  'adjustment',
  l.provider,
  l.service,
  l.document_id,
  0, 0, 0, 0,
  (calc.recalculated - l.cost_calculated),
  jsonb_build_object(
    'reason', 'price_table_correction_2025_11_full',
    'source_log_id', l.id::text,
    'original_cost', l.cost_calculated,
    'corrected_cost', calc.recalculated
  )
FROM public.ai_usage_logs l
JOIN public.ai_cost_config c ON c.service = l.service AND c.active = true
CROSS JOIN LATERAL (
  SELECT
    (l.tokens_input::numeric / 1000) * c.cost_per_1k_input
    + (l.tokens_output::numeric / 1000) * c.cost_per_1k_output
    + l.requests::numeric * c.cost_per_request
    + l.pages::numeric * c.cost_per_page
    + COALESCE(c.cost_fixed, 0) AS recalculated
) calc
WHERE l.type <> 'adjustment'
  AND l.cost_calculated > 0.01
  AND (l.tokens_input > 0 OR l.tokens_output > 0 OR l.pages > 0 OR l.requests > 0)
  -- Divergência > 5×
  AND (l.cost_calculated > calc.recalculated * 5 OR calc.recalculated > l.cost_calculated * 5)
  AND NOT EXISTS (
    SELECT 1 FROM public.ai_usage_logs adj
    WHERE adj.type = 'adjustment'
      AND adj.metadata->>'source_log_id' = l.id::text
      AND adj.metadata->>'reason' IN ('price_table_correction_2025_11', 'price_table_correction_2025_11_full')
  );