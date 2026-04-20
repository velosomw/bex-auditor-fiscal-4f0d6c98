
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  sector TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view companies (needed to select one)
CREATE POLICY "companies_select_all_auth"
  ON public.companies FOR SELECT
  TO authenticated
  USING (true);

-- Anyone authenticated can create companies
CREATE POLICY "companies_insert_auth"
  ON public.companies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Update: creator OR managers
CREATE POLICY "companies_update_owner_or_mgr"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenadora'::app_role)
    OR public.has_role(auth.uid(), 'auditor_chefe'::app_role)
  );

-- Delete: creator OR managers
CREATE POLICY "companies_delete_owner_or_mgr"
  ON public.companies FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenadora'::app_role)
    OR public.has_role(auth.uid(), 'auditor_chefe'::app_role)
  );

CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_companies_created_by ON public.companies(created_by);
CREATE INDEX idx_companies_name ON public.companies(name);
