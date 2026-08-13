# MD-PORT-01 — Schema de Banco de Dados e RLS

## Objetivo

Fornecer o SQL executável, completo e fiel às migrations reais do projeto, para recriar 100% do
schema Postgres/Supabase usado pela plataforma BEx: tabelas, enum `app_role`, funções
(`has_role`, `handle_new_user`, `update_updated_at_column`), triggers, GRANTs e políticas RLS.

## Escopo

Tabelas: `profiles`, `user_roles`, `companies`, `audit_documents`, `audit_reports`,
`pipeline_documents`, `ocr_results`, `balancete_data`, `contabil_dictionary`,
`pipeline_embeddings`, `dataset_validated`, `pipeline_analysis_results`, `ai_cost_config`,
`ai_usage_logs`, `audit_account_cache`, `audits`, `balancetes`, `balancete_lines`, `bs_dados`,
`indicadores`, `insights`, `audit_logs`, `account_mapping`, `kanitz_scores`,
`balancete_consolidado`, `ai_jobs`, `ai_gateway_config`.

## Pré-requisitos

- Postgres 15+ (Supabase managed).
- Extensões: `pgcrypto` (gen_random_uuid), `vector` (pgvector), `pgmq`.
- Ordem obrigatória por tabela: **CREATE TABLE → índices → GRANT (se aplicável) → ENABLE RLS →
  CREATE POLICY → CREATE TRIGGER**.

---

## 1. Extensões

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgmq;
```

## 2. Enum `app_role` e infraestrutura de autenticação

```sql
CREATE TYPE public.app_role AS ENUM (
  'gestor_ia','auditor_chefe','coordenadora','consultor',
  'magistrado','recuperanda','usuario','empresa'
);

-- 2.1 profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2.2 user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2.3 has_role — função SECURITY DEFINER usada em TODAS as policies do sistema
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated, service_role;

-- 2.4 RLS profiles
CREATE POLICY "p_sel_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "p_upd_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "p_ins_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "p_sel_mgr" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));
CREATE POLICY "p_upd_mgr" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));
CREATE POLICY "p_ins_mgr" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));

-- 2.5 RLS user_roles
CREATE POLICY "r_sel" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "r_ins" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));
CREATE POLICY "r_upd" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));
CREATE POLICY "r_del" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora'));

-- 2.6 handle_new_user — trigger em auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2.7 update_updated_at_column — usada por praticamente todas as tabelas do sistema
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

## 3. `companies`

```sql
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  sector TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_companies_created_by ON public.companies(created_by);
CREATE INDEX idx_companies_name ON public.companies(name);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_all_auth" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "companies_insert_auth" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "companies_update_owner_or_mgr" ON public.companies FOR UPDATE TO authenticated
  USING (auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenadora'::app_role)
    OR public.has_role(auth.uid(), 'auditor_chefe'::app_role));
CREATE POLICY "companies_delete_owner_or_mgr" ON public.companies FOR DELETE TO authenticated
  USING (auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenadora'::app_role)
    OR public.has_role(auth.uid(), 'auditor_chefe'::app_role));

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

## 4. `audit_documents` e `audit_reports`

```sql
CREATE TABLE public.audit_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  format TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'completed',
  conformidade INTEGER NOT NULL DEFAULT 0,
  riscos INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'baixo',
  batch_id TEXT,
  source TEXT NOT NULL DEFAULT 'usuario',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_documents_company ON public.audit_documents(company_id);
CREATE INDEX idx_audit_documents_created_by ON public.audit_documents(created_by);
CREATE INDEX idx_audit_documents_created_at ON public.audit_documents(created_at DESC);

ALTER TABLE public.audit_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_documents_select_own_or_mgr" ON public.audit_documents FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora') OR public.has_role(auth.uid(), 'auditor_chefe'));
CREATE POLICY "audit_documents_insert_own" ON public.audit_documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "audit_documents_update_own_or_mgr" ON public.audit_documents FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora') OR public.has_role(auth.uid(), 'auditor_chefe'));
CREATE POLICY "audit_documents_delete_own_or_mgr" ON public.audit_documents FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora') OR public.has_role(auth.uid(), 'auditor_chefe'));

CREATE TRIGGER trg_audit_documents_updated BEFORE UPDATE ON public.audit_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.audit_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'completo',
  file_name TEXT NOT NULL DEFAULT '',
  file_size BIGINT NOT NULL DEFAULT 0,
  format TEXT NOT NULL DEFAULT 'pdf',
  status TEXT NOT NULL DEFAULT 'completed',
  conformidade INTEGER NOT NULL DEFAULT 0,
  riscos INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'baixo',
  batch_id TEXT,
  source TEXT NOT NULL DEFAULT 'usuario',
  ai_analysis JSONB,
  parsed_data JSONB,
  source_documents JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_reports_company ON public.audit_reports(company_id);
CREATE INDEX idx_audit_reports_created_by ON public.audit_reports(created_by);
CREATE INDEX idx_audit_reports_created_at ON public.audit_reports(created_at DESC);

ALTER TABLE public.audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_reports_select_own_or_mgr" ON public.audit_reports FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora') OR public.has_role(auth.uid(), 'auditor_chefe'));
CREATE POLICY "audit_reports_insert_own" ON public.audit_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "audit_reports_update_own_or_mgr" ON public.audit_reports FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora') OR public.has_role(auth.uid(), 'auditor_chefe'));
CREATE POLICY "audit_reports_delete_own_or_mgr" ON public.audit_reports FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora') OR public.has_role(auth.uid(), 'auditor_chefe'));

CREATE TRIGGER trg_audit_reports_updated BEFORE UPDATE ON public.audit_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

## 5. Pipeline bruto: `pipeline_documents`, `ocr_results`, `balancete_data`, `contabil_dictionary`, `pipeline_embeddings`, `dataset_validated`, `pipeline_analysis_results`

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.pipeline_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','normalizing','processing','completed','failed')),
  progress TEXT,
  content_hash TEXT,
  parser_version TEXT,
  error_message TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pipeline_documents_company_status ON public.pipeline_documents(company_id, status);
CREATE INDEX idx_pipeline_documents_hash ON public.pipeline_documents(content_hash);
CREATE INDEX idx_pipeline_documents_created_by ON public.pipeline_documents(created_by);

ALTER TABLE public.pipeline_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY pd_sel ON public.pipeline_documents FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(),'gestor_ia')
    OR public.has_role(auth.uid(),'coordenadora') OR public.has_role(auth.uid(),'auditor_chefe'));
CREATE POLICY pd_ins ON public.pipeline_documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY pd_upd ON public.pipeline_documents FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(),'gestor_ia')
    OR public.has_role(auth.uid(),'coordenadora'));
CREATE TRIGGER trg_pd_updated BEFORE UPDATE ON public.pipeline_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_documents;

CREATE TABLE public.ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.pipeline_documents(id) ON DELETE CASCADE,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocr_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ocr_results_document ON public.ocr_results(document_id);
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY ocr_sel ON public.ocr_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pipeline_documents d WHERE d.id = ocr_results.document_id
    AND (d.created_by = auth.uid() OR public.has_role(auth.uid(),'gestor_ia')
      OR public.has_role(auth.uid(),'coordenadora'))));
CREATE POLICY ocr_ins ON public.ocr_results FOR INSERT TO service_role WITH CHECK (true);

CREATE TABLE public.balancete_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.pipeline_documents(id) ON DELETE CASCADE,
  conta TEXT NOT NULL,
  descricao TEXT,
  conta_normalizada TEXT,
  categoria TEXT,
  tipo TEXT,
  valores JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_balancete_data_document ON public.balancete_data(document_id);
ALTER TABLE public.balancete_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY bd_sel ON public.balancete_data FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pipeline_documents d WHERE d.id = balancete_data.document_id
    AND (d.created_by = auth.uid() OR public.has_role(auth.uid(),'gestor_ia'))));
CREATE POLICY bd_ins ON public.balancete_data FOR INSERT TO service_role WITH CHECK (true);

CREATE TABLE public.contabil_dictionary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  termo_original TEXT NOT NULL,
  termo_padrao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  tipo TEXT,
  embedding vector(768),
  hits INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contabil_dictionary_termo ON public.contabil_dictionary(termo_original);
CREATE INDEX idx_contabil_dictionary_embedding ON public.contabil_dictionary
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
ALTER TABLE public.contabil_dictionary ENABLE ROW LEVEL SECURITY;
CREATE POLICY cd_sel ON public.contabil_dictionary FOR SELECT TO authenticated USING (true);
CREATE POLICY cd_ins ON public.contabil_dictionary FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT ON public.contabil_dictionary TO service_role;

CREATE TABLE public.pipeline_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_id UUID,
  content TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pipeline_embeddings_vec ON public.pipeline_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
ALTER TABLE public.pipeline_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY pe_sel ON public.pipeline_embeddings FOR SELECT TO authenticated USING (true);
CREATE POLICY pe_ins ON public.pipeline_embeddings FOR INSERT TO service_role WITH CHECK (true);

CREATE TABLE public.dataset_validated (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID,
  conta TEXT NOT NULL,
  categoria_validada TEXT NOT NULL,
  validated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dataset_validated ENABLE ROW LEVEL SECURITY;
CREATE POLICY dv_sel ON public.dataset_validated FOR SELECT TO authenticated USING (true);
CREATE POLICY dv_ins ON public.dataset_validated FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = validated_by);

CREATE TABLE public.pipeline_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.pipeline_documents(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  scores JSONB,
  few_shot_examples JSONB,
  normalized JSONB,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_par_document ON public.pipeline_analysis_results(document_id);
CREATE INDEX idx_par_company ON public.pipeline_analysis_results(company_id);
ALTER TABLE public.pipeline_analysis_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY par_sel ON public.pipeline_analysis_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = pipeline_analysis_results.company_id
    AND (c.created_by = auth.uid() OR public.has_role(auth.uid(),'gestor_ia'))));
CREATE POLICY par_ins ON public.pipeline_analysis_results FOR INSERT TO service_role WITH CHECK (true);
```

## 6. `audit_account_cache`

```sql
CREATE TABLE IF NOT EXISTS public.audit_account_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid,
  cnpj text,
  periodo text,
  conta_original text NOT NULL,
  conta_original_normalizada text NOT NULL,
  conta_normalizada text NOT NULL,
  categoria text,
  subcategoria text,
  layer text NOT NULL DEFAULT 'L2_embedding',
  similarity numeric DEFAULT 0,
  hits integer NOT NULL DEFAULT 1,
  last_value numeric,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_account_cache_unique
  ON public.audit_account_cache (
    COALESCE(company_id::text, ''), COALESCE(periodo, ''), conta_original_normalizada
  );
CREATE INDEX IF NOT EXISTS audit_account_cache_lookup ON public.audit_account_cache (company_id, periodo);
CREATE INDEX IF NOT EXISTS audit_account_cache_norm ON public.audit_account_cache (conta_original_normalizada);

ALTER TABLE public.audit_account_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY aac_sel ON public.audit_account_cache FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenadora'::app_role) OR has_role(auth.uid(), 'auditor_chefe'::app_role)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = audit_account_cache.company_id
      AND (c.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
        OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY aac_ins ON public.audit_account_cache FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY aac_upd ON public.audit_account_cache FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenadora'::app_role) OR has_role(auth.uid(), 'auditor_chefe'::app_role));
CREATE POLICY aac_del ON public.audit_account_cache FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));

CREATE TRIGGER trg_aac_updated_at BEFORE UPDATE ON public.audit_account_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

## 7. Núcleo de auditoria multi-mês: `audits`, `balancetes`, `balancete_lines`, `bs_dados`, `indicadores`, `insights`, `audit_logs`, `account_mapping`

```sql
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
  USING (auth.uid() = created_by OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role) OR has_role(auth.uid(),'auditor_chefe'::app_role));
CREATE POLICY audits_ins ON public.audits FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY audits_upd ON public.audits FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role) OR has_role(auth.uid(),'auditor_chefe'::app_role));
CREATE POLICY audits_del ON public.audits FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(),'gestor_ia'::app_role)
    OR has_role(auth.uid(),'coordenadora'::app_role));
CREATE TRIGGER audits_set_updated_at BEFORE UPDATE ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.balancetes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  pipeline_document_id UUID,
  file_name TEXT NOT NULL,
  mes_referencia DATE NOT NULL,
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
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role) OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY balancetes_ins ON public.balancetes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND EXISTS (
    SELECT 1 FROM public.audits a WHERE a.id = balancetes.audit_id AND a.created_by = auth.uid()));
CREATE POLICY balancetes_upd ON public.balancetes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancetes.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY balancetes_del ON public.balancetes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancetes.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));

CREATE TABLE public.balancete_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balancete_id UUID NOT NULL REFERENCES public.balancetes(id) ON DELETE CASCADE,
  conta TEXT NOT NULL,
  descricao TEXT,
  ref1 TEXT,
  saldo_anterior NUMERIC,
  debito NUMERIC,
  credito NUMERIC,
  saldo_atual NUMERIC NOT NULL DEFAULT 0,
  is_synthetic BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_balancete_lines_balancete ON public.balancete_lines(balancete_id);
CREATE INDEX idx_balancete_lines_conta ON public.balancete_lines(balancete_id, conta);

ALTER TABLE public.balancete_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY blines_sel ON public.balancete_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.balancetes b JOIN public.audits a ON a.id = b.audit_id
    WHERE b.id = balancete_lines.balancete_id
      AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
        OR has_role(auth.uid(),'coordenadora'::app_role) OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY blines_ins ON public.balancete_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.balancetes b JOIN public.audits a ON a.id = b.audit_id
    WHERE b.id = balancete_lines.balancete_id AND a.created_by = auth.uid()));
CREATE POLICY blines_upd ON public.balancete_lines FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.balancetes b JOIN public.audits a ON a.id = b.audit_id
    WHERE b.id = balancete_lines.balancete_id
      AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
        OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY blines_del ON public.balancete_lines FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.balancetes b JOIN public.audits a ON a.id = b.audit_id
    WHERE b.id = balancete_lines.balancete_id
      AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
        OR has_role(auth.uid(),'coordenadora'::app_role))));

CREATE TABLE public.bs_dados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  mes DATE NOT NULL,
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
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role) OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY bs_ins ON public.bs_dados FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = bs_dados.audit_id AND a.created_by = auth.uid()));
CREATE POLICY bs_upd ON public.bs_dados FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = bs_dados.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY bs_del ON public.bs_dados FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = bs_dados.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE TRIGGER bs_set_updated_at BEFORE UPDATE ON public.bs_dados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role) OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY ind_ins ON public.indicadores FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = indicadores.audit_id AND a.created_by = auth.uid()));
CREATE POLICY ind_upd ON public.indicadores FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = indicadores.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY ind_del ON public.indicadores FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = indicadores.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));

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
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role) OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY ins_ins ON public.insights FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = insights.audit_id AND a.created_by = auth.uid()));
CREATE POLICY ins_upd ON public.insights FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = insights.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));
CREATE POLICY ins_del ON public.insights FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = insights.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES public.audits(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  message TEXT,
  payload JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_audit ON public.audit_logs(audit_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY alogs_sel ON public.audit_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = audit_logs.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));
-- v2260522: INSERT restrito ao dono da audit ou papéis privilegiados
CREATE POLICY alogs_ins ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.audits a WHERE a.id = audit_logs.audit_id AND a.created_by = auth.uid())
  OR public.has_role(auth.uid(), 'gestor_ia'::public.app_role)
  OR public.has_role(auth.uid(), 'coordenadora'::public.app_role)
);

CREATE TABLE public.account_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  conta_original TEXT NOT NULL,
  ref1 TEXT,
  categoria TEXT,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_account_mapping_audit ON public.account_mapping(audit_id);

ALTER TABLE public.account_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY am_sel ON public.account_mapping FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = account_mapping.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role))));
CREATE POLICY am_ins ON public.account_mapping FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = account_mapping.audit_id AND a.created_by = auth.uid()));
```

## 8. `kanitz_scores`

```sql
CREATE TABLE IF NOT EXISTS public.kanitz_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL,
  mes DATE NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  rating TEXT NOT NULL DEFAULT 'B - Atenção',
  x1 NUMERIC, x2 NUMERIC, x3 NUMERIC, x4 NUMERIC, x5 NUMERIC,
  ativo_total NUMERIC,
  patrimonio_liquido NUMERIC,
  insight TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (audit_id, mes)
);
CREATE INDEX IF NOT EXISTS idx_kanitz_scores_audit ON public.kanitz_scores(audit_id);
CREATE INDEX IF NOT EXISTS idx_kanitz_scores_mes ON public.kanitz_scores(mes);

ALTER TABLE public.kanitz_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kz_sel" ON public.kanitz_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(), 'gestor_ia'::app_role)
      OR has_role(auth.uid(), 'coordenadora'::app_role) OR has_role(auth.uid(), 'auditor_chefe'::app_role))));
CREATE POLICY "kz_ins" ON public.kanitz_scores FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id AND a.created_by = auth.uid()));
CREATE POLICY "kz_upd" ON public.kanitz_scores FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(), 'gestor_ia'::app_role)
      OR has_role(auth.uid(), 'coordenadora'::app_role))));
CREATE POLICY "kz_del" ON public.kanitz_scores FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(), 'gestor_ia'::app_role)
      OR has_role(auth.uid(), 'coordenadora'::app_role))));
```

## 9. `balancete_consolidado`

```sql
CREATE TABLE public.balancete_consolidado (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id uuid NOT NULL,
  balancete_id uuid,
  mes_referencia date NOT NULL,
  codigo text NOT NULL,
  descricao text,
  ref_capital text,
  saldo_atual numeric NOT NULL DEFAULT 0,
  saldo_anterior numeric,
  debito numeric,
  credito numeric,
  is_leaf boolean NOT NULL DEFAULT true,
  fonte text NOT NULL DEFAULT 'parser_xlsx',
  file_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_balancete_consolidado_audit ON public.balancete_consolidado(audit_id);
CREATE INDEX idx_balancete_consolidado_mes ON public.balancete_consolidado(audit_id, mes_referencia);
CREATE INDEX idx_balancete_consolidado_codigo ON public.balancete_consolidado(audit_id, codigo);

ALTER TABLE public.balancete_consolidado ENABLE ROW LEVEL SECURITY;

CREATE POLICY bc_sel ON public.balancete_consolidado FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancete_consolidado.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role) OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY bc_ins ON public.balancete_consolidado FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancete_consolidado.audit_id AND a.created_by = auth.uid()));
CREATE POLICY bc_upd ON public.balancete_consolidado FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancete_consolidado.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role) OR has_role(auth.uid(),'auditor_chefe'::app_role))));
CREATE POLICY bc_del ON public.balancete_consolidado FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancete_consolidado.audit_id
    AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
      OR has_role(auth.uid(),'coordenadora'::app_role))));
```

## 10. Custos de IA: `ai_cost_config`, `ai_usage_logs`

```sql
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

CREATE POLICY "ai_cost_config_select_auth" ON public.ai_cost_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_cost_config_insert_mgr" ON public.ai_cost_config FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));
CREATE POLICY "ai_cost_config_update_mgr" ON public.ai_cost_config FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));
CREATE POLICY "ai_cost_config_delete_mgr" ON public.ai_cost_config FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));

CREATE TRIGGER ai_cost_config_updated_at BEFORE UPDATE ON public.ai_cost_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  service TEXT NOT NULL,
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
CREATE POLICY "ai_usage_logs_select_auth" ON public.ai_usage_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_usage_logs_insert_auth" ON public.ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ai_usage_logs_delete_mgr" ON public.ai_usage_logs FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role));

INSERT INTO public.ai_cost_config (provider, service, label, cost_per_1k_input, cost_per_1k_output, cost_per_request, cost_fixed) VALUES
  ('google', 'gemini_flash', 'Gemini 2.5 Flash', 0.000075, 0.0003, 0, 0),
  ('google', 'gemini_pro', 'Gemini 2.5 Pro', 0.00125, 0.005, 0, 0),
  ('google', 'document_ai', 'Google Document AI', 0, 0, 0.0015, 0),
  ('google', 'embedding', 'Gemini Embedding', 0.000025, 0, 0, 0),
  ('internal', 'storage', 'Supabase Storage/DB', 0, 0, 0, 0.0002);

-- View de custo agregado (SECURITY INVOKER — hardening 2026-05-19)
CREATE VIEW public.ai_cost_summary WITH (security_invoker=true) AS
SELECT service, provider, date_trunc('day', created_at) AS day,
       SUM(cost_calculated) AS total_cost, SUM(requests) AS total_requests,
       SUM(tokens_input) AS total_tokens_input, SUM(tokens_output) AS total_tokens_output
FROM public.ai_usage_logs
GROUP BY service, provider, date_trunc('day', created_at);
```

## 11. Fila de IA: `ai_jobs` + pgmq + `ai_jobs_claim_batch`

```sql
CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('insight','report','custom')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  priority smallint NOT NULL DEFAULT 5,
  requested_by uuid NOT NULL,
  document_id uuid,
  company_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_message text,
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 3,
  pgmq_msg_id bigint,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_jobs_status_priority_idx ON public.ai_jobs (status, priority DESC, queued_at ASC);
CREATE INDEX IF NOT EXISTS ai_jobs_requested_by_idx ON public.ai_jobs (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_jobs_company_idx ON public.ai_jobs (company_id, status);

CREATE TRIGGER trg_ai_jobs_updated BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_jobs_insert_own" ON public.ai_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by);
CREATE POLICY "ai_jobs_select_own_or_mgr" ON public.ai_jobs FOR SELECT TO authenticated
  USING (auth.uid() = requested_by OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenadora'::app_role) OR public.has_role(auth.uid(), 'auditor_chefe'::app_role));
CREATE POLICY "ai_jobs_update_mgr" ON public.ai_jobs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenadora'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_jobs;

CREATE OR REPLACE FUNCTION public.ai_jobs_claim_batch(p_limit int DEFAULT 3)
RETURNS SETOF public.ai_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_jobs AS (
    SELECT id FROM public.ai_jobs
    WHERE status = 'queued' AND attempts < max_attempts
    ORDER BY priority DESC, queued_at ASC
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_jobs j
     SET status = 'processing', started_at = now(), attempts = j.attempts + 1
    FROM next_jobs n WHERE j.id = n.id
  RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_jobs_claim_batch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_jobs_claim_batch(int) TO service_role;

-- Filas pgmq (idempotente)
DO $$ BEGIN PERFORM pgmq.create('bex_ai_jobs'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('bex_ai_jobs_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
```

> `enqueue_email`/`read_email_batch`/`delete_email` são RPCs genéricas de fila (nome herdado do
> módulo de e-mail, reaproveitadas para `bex_ai_jobs`) — ver MD-PORT-02 §4 para as assinaturas
> completas usadas por `enqueue-ai-job` e `process-ai-jobs-queue`.

## 12. `ai_gateway_config`

```sql
CREATE TABLE IF NOT EXISTS public.ai_gateway_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  mode text NOT NULL DEFAULT 'lovable' CHECK (mode IN ('lovable','gcp')),
  gcp_endpoint text DEFAULT 'https://generativelanguage.googleapis.com/v1beta',
  default_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  gcp_model text NOT NULL DEFAULT 'gemini-2.5-flash',
  webhook_signature_enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.ai_gateway_config (id) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.ai_gateway_config TO authenticated;
GRANT ALL ON public.ai_gateway_config TO service_role;

ALTER TABLE public.ai_gateway_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor IA can read gateway config" ON public.ai_gateway_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::public.app_role)
      OR public.has_role(auth.uid(), 'coordenadora'::public.app_role));
CREATE POLICY "Gestor IA can update gateway config" ON public.ai_gateway_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::public.app_role));
```

## 13. GRANTs consolidados (schema `public`)

```sql
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- anon: apenas o necessário para fluxo público (nenhuma tabela contábil é acessível por anon;
-- exceção documentada é o bucket de storage `email-assets`, ver MD-PORT-02).
REVOKE ALL ON public.ai_jobs_claim_batch(int) FROM anon;
```

## 14. Ordem de criação recomendada (dependência de FK)

```
1. extensões (pgcrypto, vector, pgmq)
2. app_role, profiles, user_roles, has_role, handle_new_user, update_updated_at_column
3. companies
4. audit_documents, audit_reports
5. pipeline_documents → ocr_results, balancete_data, contabil_dictionary,
   pipeline_embeddings, dataset_validated, pipeline_analysis_results
6. ai_cost_config, ai_usage_logs
7. audit_account_cache
8. audits → balancetes → balancete_lines, bs_dados, indicadores, insights,
   audit_logs, account_mapping
9. kanitz_scores
10. balancete_consolidado
11. ai_jobs (+ pgmq queues + ai_jobs_claim_batch)
12. ai_gateway_config
```

## Checklist de Implementação

- [ ] Rodar migrations na ordem da seção 14 em um banco vazio e confirmar 0 erros.
- [ ] Validar `SELECT has_role(auth.uid(), 'gestor_ia')` funciona sob `authenticated`.
- [ ] Validar trigger `on_auth_user_created` cria `profiles` automaticamente após signup.
- [ ] Validar `UNIQUE (audit_id, mes)` em `bs_dados`, `indicadores`, `kanitz_scores`.
- [ ] Validar índice `ivfflat` em `contabil_dictionary.embedding` e `pipeline_embeddings.embedding`.
- [ ] Validar `ai_jobs_claim_batch` só é executável por `service_role`.
- [ ] Confirmar `ALTER PUBLICATION supabase_realtime ADD TABLE` para `pipeline_documents` e `ai_jobs`.
- [ ] Rodar `pgmq.create('bex_ai_jobs')` e `pgmq.create('bex_ai_jobs_dlq')` idempotentemente.

## Critérios de Homologação

- Todas as 27 tabelas do inventário existem com RLS `ENABLE` e ao menos uma policy por operação
  (SELECT/INSERT/UPDATE/DELETE conforme aplicável).
- Um usuário `usuario` comum não consegue ler `audits` de outro `created_by` (teste negativo).
- Um usuário `gestor_ia` consegue ler/atualizar qualquer `audits`/`companies` (teste positivo).
- `service_role` consegue inserir em `ocr_results`, `balancete_data`, `pipeline_analysis_results`
  sem estar sujeito a RLS de usuário.
- `ai_jobs_claim_batch(3)` retorna no máximo 3 linhas e marca `status='processing'` de forma
  atômica sob concorrência (`FOR UPDATE SKIP LOCKED`).
