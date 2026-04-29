-- ============================================================================
-- MD MASTER — Banco SQL Multi-Empresa para Auditoria Financeira
-- ============================================================================

-- 1) AUDITS — tronco da auditoria por empresa (versionável)
CREATE TABLE public.audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Auditoria',
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','completed','failed','archived')),
  version INTEGER NOT NULL DEFAULT 1,
  variant TEXT NOT NULL DEFAULT 'completo',
  meses_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audits_company ON public.audits(company_id);
CREATE INDEX idx_audits_created_by ON public.audits(created_by);
CREATE INDEX idx_audits_status ON public.audits(status);

ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY audits_sel ON public.audits FOR SELECT TO authenticated
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(),'gestor_ia'::app_role)
  OR has_role(auth.uid(),'coordenadora'::app_role)
  OR has_role(auth.uid(),'auditor_chefe'::app_role)
);
CREATE POLICY audits_ins ON public.audits FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);
CREATE POLICY audits_upd ON public.audits FOR UPDATE TO authenticated
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(),'gestor_ia'::app_role)
  OR has_role(auth.uid(),'coordenadora'::app_role)
  OR has_role(auth.uid(),'auditor_chefe'::app_role)
);
CREATE POLICY audits_del ON public.audits FOR DELETE TO authenticated
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(),'gestor_ia'::app_role)
  OR has_role(auth.uid(),'coordenadora'::app_role)
);

CREATE TRIGGER audits_set_updated_at BEFORE UPDATE ON public.audits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) BALANCETES — cada balancete carregado dentro de uma auditoria
CREATE TABLE public.balancetes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  pipeline_document_id UUID,            -- liga ao documento original (sem FK forte: pipeline_documents pode ser limpa)
  file_name TEXT NOT NULL,
  mes_referencia DATE NOT NULL,         -- usar dia 01 do mês de referência
  content_hash TEXT,
  total_linhas INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_balancetes_audit ON public.balancetes(audit_id);
CREATE INDEX idx_balancetes_mes ON public.balancetes(audit_id, mes_referencia);
CREATE INDEX idx_balancetes_hash ON public.balancetes(content_hash);

ALTER TABLE public.balancetes ENABLE ROW LEVEL SECURITY;

CREATE POLICY balancetes_sel ON public.balancetes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancetes.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role)
    OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY balancetes_ins ON public.balancetes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by AND EXISTS (
  SELECT 1 FROM public.audits a WHERE a.id = balancetes.audit_id AND a.created_by = auth.uid()
));
CREATE POLICY balancetes_upd ON public.balancetes FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancetes.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY balancetes_del ON public.balancetes FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancetes.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role))));

-- 3) BALANCETE_LINES — linhas extraídas com classificação IA
CREATE TABLE public.balancete_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balancete_id UUID NOT NULL REFERENCES public.balancetes(id) ON DELETE CASCADE,
  conta TEXT NOT NULL,
  descricao TEXT,
  ref1 TEXT,                            -- Ref Capital BEX (A, B, AA…)
  saldo NUMERIC NOT NULL DEFAULT 0,
  categoria TEXT,
  subcategoria TEXT,
  classification_layer TEXT,            -- L1_exact, L2_embedding, L3_regex, L4_llm
  confidence NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_blines_balancete ON public.balancete_lines(balancete_id);
CREATE INDEX idx_blines_ref1 ON public.balancete_lines(ref1);
CREATE UNIQUE INDEX uq_blines_balancete_conta ON public.balancete_lines(balancete_id, conta);

ALTER TABLE public.balancete_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY blines_sel ON public.balancete_lines FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.balancetes b
  JOIN public.audits a ON a.id = b.audit_id
  WHERE b.id = balancete_lines.balancete_id
    AND (a.created_by = auth.uid()
      OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role)
      OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY blines_ins ON public.balancete_lines FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.balancetes b
  JOIN public.audits a ON a.id = b.audit_id
  WHERE b.id = balancete_lines.balancete_id AND a.created_by = auth.uid()));
CREATE POLICY blines_upd ON public.balancete_lines FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.balancetes b
  JOIN public.audits a ON a.id = b.audit_id
  WHERE b.id = balancete_lines.balancete_id
    AND (a.created_by = auth.uid()
      OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY blines_del ON public.balancete_lines FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.balancetes b
  JOIN public.audits a ON a.id = b.audit_id
  WHERE b.id = balancete_lines.balancete_id
    AND (a.created_by = auth.uid()
      OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));

-- 4) BS_DADOS — fonte única consolidada (CORE)
CREATE TABLE public.bs_dados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  mes DATE NOT NULL,                    -- dia 01 do mês
  receita_liquida NUMERIC NOT NULL DEFAULT 0,
  cmv NUMERIC NOT NULL DEFAULT 0,
  despesas NUMERIC NOT NULL DEFAULT 0,
  resultado NUMERIC NOT NULL DEFAULT 0,
  ativo_circulante NUMERIC NOT NULL DEFAULT 0,
  passivo_circulante NUMERIC NOT NULL DEFAULT 0,
  estoques NUMERIC NOT NULL DEFAULT 0,
  disponivel NUMERIC NOT NULL DEFAULT 0,
  divida_tributaria NUMERIC NOT NULL DEFAULT 0,
  divida_trabalhista NUMERIC NOT NULL DEFAULT 0,
  divida_financeira NUMERIC NOT NULL DEFAULT 0,
  fornecedores NUMERIC NOT NULL DEFAULT 0,
  credores_rj NUMERIC NOT NULL DEFAULT 0,
  divida_total NUMERIC NOT NULL DEFAULT 0,
  errors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (audit_id, mes)
);
CREATE INDEX idx_bs_audit ON public.bs_dados(audit_id);
CREATE INDEX idx_bs_audit_mes ON public.bs_dados(audit_id, mes);

ALTER TABLE public.bs_dados ENABLE ROW LEVEL SECURITY;

CREATE POLICY bs_sel ON public.bs_dados FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = bs_dados.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role)
    OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY bs_ins ON public.bs_dados FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.audits a
  WHERE a.id = bs_dados.audit_id AND a.created_by = auth.uid()));
CREATE POLICY bs_upd ON public.bs_dados FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = bs_dados.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY bs_del ON public.bs_dados FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = bs_dados.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role))));

CREATE TRIGGER bs_set_updated_at BEFORE UPDATE ON public.bs_dados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) INDICADORES — métricas derivadas por mês
CREATE TABLE public.indicadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  mes DATE NOT NULL,
  cmv_percent NUMERIC,
  despesa_percent NUMERIC,
  cmv_despesa_percent NUMERIC,
  resultado_percent NUMERIC,
  liquidez_corrente NUMERIC,
  liquidez_seca NUMERIC,
  liquidez_imediata NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (audit_id, mes)
);
CREATE INDEX idx_indicadores_audit ON public.indicadores(audit_id);
CREATE INDEX idx_indicadores_audit_mes ON public.indicadores(audit_id, mes);

ALTER TABLE public.indicadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY ind_sel ON public.indicadores FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = indicadores.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role)
    OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY ind_ins ON public.indicadores FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.audits a
  WHERE a.id = indicadores.audit_id AND a.created_by = auth.uid()));
CREATE POLICY ind_upd ON public.indicadores FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = indicadores.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY ind_del ON public.indicadores FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = indicadores.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role))));

-- 6) INSIGHTS — diagnóstico textual + JSONB
CREATE TABLE public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  diagnostico TEXT,
  problemas JSONB,
  positivos JSONB,
  riscos JSONB,
  recomendacoes JSONB,
  tendencia TEXT,
  generated_by TEXT DEFAULT 'gemini-2.5-flash',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_insights_audit ON public.insights(audit_id);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY ins_sel ON public.insights FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = insights.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role)
    OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY ins_ins ON public.insights FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.audits a
  WHERE a.id = insights.audit_id AND a.created_by = auth.uid()));
CREATE POLICY ins_upd ON public.insights FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = insights.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY ins_del ON public.insights FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = insights.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role))));

-- 7) AUDIT_LOGS — trilha interna do pipeline (append-only)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES public.audits(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL,                 -- upload, parse, classify, bs_build, indicators, insights
  status TEXT NOT NULL,                -- ok, warn, error
  message TEXT,
  payload JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_audit ON public.audit_logs(audit_id);
CREATE INDEX idx_audit_logs_etapa ON public.audit_logs(audit_id, etapa);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY alogs_sel ON public.audit_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = audit_logs.audit_id
  AND (a.created_by = auth.uid()
    OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role)
    OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY alogs_ins ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
-- sem update/delete: trilha imutável (gestor pode limpar via service role se necessário)

-- 8) ACCOUNT_MAPPING — base de aprendizado IA
CREATE TABLE public.account_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name TEXT NOT NULL,
  original_normalized TEXT,
  ref1 TEXT,
  categoria TEXT NOT NULL,
  subcategoria TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  hits INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'auto',          -- auto | user_correction | seed
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_account_mapping_norm ON public.account_mapping(original_normalized) WHERE original_normalized IS NOT NULL;
CREATE INDEX idx_account_mapping_cat ON public.account_mapping(categoria);

ALTER TABLE public.account_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY am_sel ON public.account_mapping FOR SELECT TO authenticated USING (true);
CREATE POLICY am_ins ON public.account_mapping FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY am_upd ON public.account_mapping FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'gestor_ia'::app_role)
  OR has_role(auth.uid(),'coordenadora'::app_role)
  OR has_role(auth.uid(),'auditor_chefe'::app_role)
);
CREATE POLICY am_del ON public.account_mapping FOR DELETE TO authenticated
USING (
  has_role(auth.uid(),'gestor_ia'::app_role)
  OR has_role(auth.uid(),'coordenadora'::app_role)
);

CREATE TRIGGER am_set_updated_at BEFORE UPDATE ON public.account_mapping
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
