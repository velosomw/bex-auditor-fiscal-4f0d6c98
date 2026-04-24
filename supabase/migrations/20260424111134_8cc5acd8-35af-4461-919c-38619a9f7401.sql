-- ========== audit_documents ==========
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

CREATE POLICY "audit_documents_select_own_or_mgr"
  ON public.audit_documents FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora')
    OR public.has_role(auth.uid(), 'auditor_chefe')
  );

CREATE POLICY "audit_documents_insert_own"
  ON public.audit_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "audit_documents_update_own_or_mgr"
  ON public.audit_documents FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora')
    OR public.has_role(auth.uid(), 'auditor_chefe')
  );

CREATE POLICY "audit_documents_delete_own_or_mgr"
  ON public.audit_documents FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora')
    OR public.has_role(auth.uid(), 'auditor_chefe')
  );

CREATE TRIGGER trg_audit_documents_updated
  BEFORE UPDATE ON public.audit_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== audit_reports ==========
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

CREATE POLICY "audit_reports_select_own_or_mgr"
  ON public.audit_reports FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora')
    OR public.has_role(auth.uid(), 'auditor_chefe')
  );

CREATE POLICY "audit_reports_insert_own"
  ON public.audit_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "audit_reports_update_own_or_mgr"
  ON public.audit_reports FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora')
    OR public.has_role(auth.uid(), 'auditor_chefe')
  );

CREATE POLICY "audit_reports_delete_own_or_mgr"
  ON public.audit_reports FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora')
    OR public.has_role(auth.uid(), 'auditor_chefe')
  );

CREATE TRIGGER trg_audit_reports_updated
  BEFORE UPDATE ON public.audit_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();