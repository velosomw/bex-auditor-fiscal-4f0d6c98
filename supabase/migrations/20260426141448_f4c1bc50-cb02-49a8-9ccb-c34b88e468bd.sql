-- Extensão para embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Pipeline documents
CREATE TABLE public.pipeline_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL DEFAULT 'pdf',
  storage_path text,
  status text NOT NULL DEFAULT 'pending', -- pending|ocr|parsing|normalizing|analyzing|done|error
  error_message text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pipeline_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY pd_sel ON public.pipeline_documents FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora') OR has_role(auth.uid(),'auditor_chefe'));
CREATE POLICY pd_ins ON public.pipeline_documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY pd_upd ON public.pipeline_documents FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora') OR has_role(auth.uid(),'auditor_chefe'));
CREATE POLICY pd_del ON public.pipeline_documents FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora'));

CREATE TRIGGER pd_updated BEFORE UPDATE ON public.pipeline_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. OCR results
CREATE TABLE public.ocr_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.pipeline_documents(id) ON DELETE CASCADE,
  raw_text text,
  structured_json jsonb,
  ocr_score numeric DEFAULT 0,
  provider text DEFAULT 'google_document_ai',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY ocr_sel ON public.ocr_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pipeline_documents pd WHERE pd.id = document_id
    AND (auth.uid() = pd.created_by OR has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora') OR has_role(auth.uid(),'auditor_chefe'))));
CREATE POLICY ocr_ins ON public.ocr_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.pipeline_documents pd WHERE pd.id = document_id AND auth.uid() = pd.created_by));

-- 3. Balancete data (linhas estruturadas)
CREATE TABLE public.balancete_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.pipeline_documents(id) ON DELETE CASCADE,
  conta_original text NOT NULL,
  conta_normalizada text,
  valor numeric NOT NULL DEFAULT 0,
  tipo text, -- ativo|passivo|pl|receita|despesa
  nivel int DEFAULT 1,
  categoria text,
  subcategoria text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.balancete_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY bd_sel ON public.balancete_data FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pipeline_documents pd WHERE pd.id = document_id
    AND (auth.uid() = pd.created_by OR has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora') OR has_role(auth.uid(),'auditor_chefe'))));
CREATE POLICY bd_ins ON public.balancete_data FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.pipeline_documents pd WHERE pd.id = document_id AND auth.uid() = pd.created_by));
CREATE POLICY bd_upd ON public.balancete_data FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pipeline_documents pd WHERE pd.id = document_id
    AND (auth.uid() = pd.created_by OR has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora') OR has_role(auth.uid(),'auditor_chefe'))));
CREATE INDEX idx_bd_doc ON public.balancete_data(document_id);

-- 4. Dicionário contábil (768 dims = textembedding-gecko / Lovable AI default)
CREATE TABLE public.contabil_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  termo_original text NOT NULL,
  termo_padrao text NOT NULL,
  categoria text NOT NULL, -- ativo_circulante|ativo_nao_circulante|passivo_circulante|passivo_nao_circulante|patrimonio_liquido|receita|despesa|custo
  subcategoria text,
  embedding vector(768),
  frequencia int DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contabil_dictionary ENABLE ROW LEVEL SECURITY;
CREATE POLICY cd_sel ON public.contabil_dictionary FOR SELECT TO authenticated USING (true);
CREATE POLICY cd_ins ON public.contabil_dictionary FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora'));
CREATE POLICY cd_upd ON public.contabil_dictionary FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora'));
CREATE POLICY cd_del ON public.contabil_dictionary FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora'));
CREATE INDEX idx_cd_emb ON public.contabil_dictionary USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_cd_termo ON public.contabil_dictionary(termo_original);

-- 5. Pipeline embeddings (few-shot retrieval)
CREATE TABLE public.pipeline_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.pipeline_documents(id) ON DELETE CASCADE,
  tipo text NOT NULL, -- balancete|conta|insight
  text_content text,
  embedding vector(768),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pipeline_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY pe_sel ON public.pipeline_embeddings FOR SELECT TO authenticated USING (true);
CREATE POLICY pe_ins ON public.pipeline_embeddings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.pipeline_documents pd WHERE pd.id = document_id AND auth.uid() = pd.created_by));
CREATE INDEX idx_pe_emb ON public.pipeline_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- 6. Dataset validated (learning loop)
CREATE TABLE public.dataset_validated (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.pipeline_documents(id) ON DELETE SET NULL,
  input_json jsonb NOT NULL,
  output_corrected jsonb NOT NULL,
  embedding vector(768),
  corrected_by uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dataset_validated ENABLE ROW LEVEL SECURITY;
CREATE POLICY dv_sel ON public.dataset_validated FOR SELECT TO authenticated USING (true);
CREATE POLICY dv_ins ON public.dataset_validated FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = corrected_by);
CREATE POLICY dv_upd ON public.dataset_validated FOR UPDATE TO authenticated
  USING (auth.uid() = corrected_by OR has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora'));
CREATE INDEX idx_dv_emb ON public.dataset_validated USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- 7. Analysis results
CREATE TABLE public.pipeline_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.pipeline_documents(id) ON DELETE CASCADE,
  indicadores jsonb,
  alertas jsonb,
  ocr_score numeric DEFAULT 0,
  mapping_score numeric DEFAULT 0,
  validation_score numeric DEFAULT 0,
  quality_score numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pipeline_analysis_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY par_sel ON public.pipeline_analysis_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pipeline_documents pd WHERE pd.id = document_id
    AND (auth.uid() = pd.created_by OR has_role(auth.uid(),'gestor_ia') OR has_role(auth.uid(),'coordenadora') OR has_role(auth.uid(),'auditor_chefe'))));
CREATE POLICY par_ins ON public.pipeline_analysis_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.pipeline_documents pd WHERE pd.id = document_id AND auth.uid() = pd.created_by));

-- Seed do dicionário contábil (sem embeddings — serão gerados no primeiro uso)
INSERT INTO public.contabil_dictionary (termo_original, termo_padrao, categoria) VALUES
('caixa', 'Caixa', 'ativo_circulante'),
('caixa geral', 'Caixa', 'ativo_circulante'),
('bancos', 'Bancos Conta Movimento', 'ativo_circulante'),
('bancos c/movimento', 'Bancos Conta Movimento', 'ativo_circulante'),
('bcos c/mvto', 'Bancos Conta Movimento', 'ativo_circulante'),
('aplicacoes financeiras', 'Aplicações Financeiras', 'ativo_circulante'),
('aplic financeiras', 'Aplicações Financeiras', 'ativo_circulante'),
('clientes', 'Clientes / Duplicatas a Receber', 'ativo_circulante'),
('duplicatas a receber', 'Clientes / Duplicatas a Receber', 'ativo_circulante'),
('contas a receber', 'Clientes / Duplicatas a Receber', 'ativo_circulante'),
('estoques', 'Estoques', 'ativo_circulante'),
('estoque de mercadorias', 'Estoques', 'ativo_circulante'),
('mercadorias', 'Estoques', 'ativo_circulante'),
('impostos a recuperar', 'Impostos a Recuperar', 'ativo_circulante'),
('imobilizado', 'Imobilizado', 'ativo_nao_circulante'),
('ativo imobilizado', 'Imobilizado', 'ativo_nao_circulante'),
('depreciacao acumulada', 'Depreciação Acumulada', 'ativo_nao_circulante'),
('intangivel', 'Intangível', 'ativo_nao_circulante'),
('investimentos', 'Investimentos', 'ativo_nao_circulante'),
('realizavel a longo prazo', 'Realizável a Longo Prazo', 'ativo_nao_circulante'),
('fornecedores', 'Fornecedores', 'passivo_circulante'),
('emprestimos', 'Empréstimos e Financiamentos CP', 'passivo_circulante'),
('financiamentos', 'Empréstimos e Financiamentos CP', 'passivo_circulante'),
('duplicatas descontadas', 'Duplicatas Descontadas', 'passivo_circulante'),
('factoring', 'Factoring', 'passivo_circulante'),
('fidc', 'FIDC', 'passivo_circulante'),
('obrigacoes trabalhistas', 'Obrigações Trabalhistas', 'passivo_circulante'),
('salarios a pagar', 'Obrigações Trabalhistas', 'passivo_circulante'),
('obrigacoes tributarias', 'Obrigações Tributárias', 'passivo_circulante'),
('impostos a pagar', 'Obrigações Tributárias', 'passivo_circulante'),
('emprestimos longo prazo', 'Empréstimos e Financiamentos LP', 'passivo_nao_circulante'),
('exigivel a longo prazo', 'Exigível a Longo Prazo', 'passivo_nao_circulante'),
('capital social', 'Capital Social', 'patrimonio_liquido'),
('reservas de lucros', 'Reservas de Lucros', 'patrimonio_liquido'),
('lucros acumulados', 'Lucros/Prejuízos Acumulados', 'patrimonio_liquido'),
('receita bruta', 'Receita Bruta', 'receita'),
('receita liquida', 'Receita Líquida', 'receita'),
('receita operacional', 'Receita Operacional', 'receita'),
('vendas', 'Receita Bruta', 'receita'),
('cmv', 'Custo das Mercadorias Vendidas', 'despesa'),
('custo das mercadorias vendidas', 'Custo das Mercadorias Vendidas', 'despesa'),
('despesas operacionais', 'Despesas Operacionais', 'despesa'),
('despesas administrativas', 'Despesas Administrativas', 'despesa'),
('despesas comerciais', 'Despesas Comerciais', 'despesa'),
('despesas financeiras', 'Despesas Financeiras', 'despesa'),
('lucro liquido', 'Lucro Líquido', 'receita'),
('prejuizo', 'Prejuízo', 'despesa');