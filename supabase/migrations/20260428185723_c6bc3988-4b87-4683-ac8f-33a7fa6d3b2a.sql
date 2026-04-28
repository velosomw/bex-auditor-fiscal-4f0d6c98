-- 1) Trigger BEFORE INSERT em ai_usage_logs para calcular custo automaticamente
DROP TRIGGER IF EXISTS trg_ai_usage_logs_calc_cost ON public.ai_usage_logs;
CREATE TRIGGER trg_ai_usage_logs_calc_cost
BEFORE INSERT ON public.ai_usage_logs
FOR EACH ROW
EXECUTE FUNCTION public.trg_calculate_cost();

-- 2) Logs-semente reais para popular dashboards (uso típico de auditoria)
INSERT INTO public.ai_usage_logs (provider, service, type, tokens_input, tokens_output, requests, pages, metadata)
VALUES
  ('google','document_ai','ocr',0,0,1,12, '{"seed":true,"doc":"balancete_2024"}'::jsonb),
  ('google','gemini-2.5-flash','analysis',8500,2400,1,0, '{"seed":true,"doc":"balancete_2024"}'::jsonb),
  ('google','document_ai','ocr',0,0,1,18, '{"seed":true,"doc":"dre_2024"}'::jsonb),
  ('google','gemini-2.5-pro','analysis',14200,5100,1,0, '{"seed":true,"doc":"dre_2024"}'::jsonb),
  ('google','document_ai','ocr',0,0,1,9, '{"seed":true,"doc":"balancete_2023"}'::jsonb),
  ('google','gemini-2.5-flash','analysis',6200,1900,1,0, '{"seed":true,"doc":"balancete_2023"}'::jsonb),
  ('google','gemini-2.5-pro','report',22000,8800,1,0, '{"seed":true,"doc":"relatorio_consolidado"}'::jsonb);