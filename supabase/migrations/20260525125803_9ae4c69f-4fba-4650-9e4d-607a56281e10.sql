
INSERT INTO public.ai_cost_config (provider, service, label, cost_per_1k_input, cost_per_1k_output, currency, notes)
VALUES
  ('google', 'gemini_3_flash_lite', 'Gemini 3.1 Flash Lite Preview', 0.00005, 0.00015, 'USD', 'Preview pricing — revisar quando GA'),
  ('google', 'gemini_3_flash',      'Gemini 3.5 Flash',              0.0003,  0.0025,  'USD', 'Pricing oficial Google'),
  ('google', 'gemini_3_pro',        'Gemini 3.1 Pro Preview',        0.002,   0.012,   'USD', 'Preview pricing — revisar quando GA'),
  ('openai', 'gpt5',                'OpenAI GPT-5',                  0.00125, 0.01,    'USD', 'Pricing oficial OpenAI'),
  ('openai', 'gpt5_mini',           'OpenAI GPT-5 Mini',             0.00025, 0.002,   'USD', 'Pricing oficial OpenAI')
ON CONFLICT (service) DO UPDATE SET
  provider           = EXCLUDED.provider,
  label              = EXCLUDED.label,
  cost_per_1k_input  = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  currency           = EXCLUDED.currency,
  notes              = EXCLUDED.notes,
  active             = true;
