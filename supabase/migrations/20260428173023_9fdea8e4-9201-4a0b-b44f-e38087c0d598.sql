
-- Tabela de configuração de custos por provedor/serviço
CREATE TABLE public.ai_cost_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  service TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  cost_per_1k_input NUMERIC NOT NULL DEFAULT 0,
  cost_per_1k_output NUMERIC NOT NULL DEFAULT 0,
  cost_per_request NUMERIC NOT NULL DEFAULT 0,
  cost_fixed NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_cost_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_cost_config_select_auth"
  ON public.ai_cost_config FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_cost_config_insert_mgr"
  ON public.ai_cost_config FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));

CREATE POLICY "ai_cost_config_update_mgr"
  ON public.ai_cost_config FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));

CREATE POLICY "ai_cost_config_delete_mgr"
  ON public.ai_cost_config FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));

CREATE TRIGGER ai_cost_config_updated_at
  BEFORE UPDATE ON public.ai_cost_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de logs de uso (histórico imutável)
CREATE TABLE public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'balancete' | 'relatorio' | 'ocr' | 'embedding' | 'mapping' | 'insight'
  provider TEXT NOT NULL,
  service TEXT NOT NULL, -- 'gemini_flash', 'gemini_pro', 'document_ai', 'embedding'
  document_id UUID,
  tokens_input NUMERIC NOT NULL DEFAULT 0,
  tokens_output NUMERIC NOT NULL DEFAULT 0,
  requests NUMERIC NOT NULL DEFAULT 0,
  cost_calculated NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_logs_service ON public.ai_usage_logs(service);
CREATE INDEX idx_ai_usage_logs_type ON public.ai_usage_logs(type);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_logs_select_auth"
  ON public.ai_usage_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_usage_logs_insert_auth"
  ON public.ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Não permitir UPDATE/DELETE para preservar histórico
-- (apenas gestor pode deletar para limpeza pontual)
CREATE POLICY "ai_usage_logs_delete_mgr"
  ON public.ai_usage_logs FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role));

-- Seed com preços padrão (USD), atualizáveis via UI
INSERT INTO public.ai_cost_config (provider, service, label, cost_per_1k_input, cost_per_1k_output, cost_per_request, cost_fixed) VALUES
  ('google', 'gemini_flash', 'Gemini 2.5 Flash', 0.000075, 0.0003, 0, 0),
  ('google', 'gemini_pro', 'Gemini 2.5 Pro', 0.00125, 0.005, 0, 0),
  ('google', 'document_ai', 'Google Document AI', 0, 0, 0.0015, 0),
  ('google', 'embedding', 'Gemini Embedding', 0.000025, 0, 0, 0),
  ('internal', 'storage', 'Supabase Storage/DB', 0, 0, 0, 0.0002);
