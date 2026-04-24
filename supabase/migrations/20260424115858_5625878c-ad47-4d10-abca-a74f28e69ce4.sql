-- ========== accounting_firms ==========
CREATE TABLE public.accounting_firms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  crc TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT,
  address_number TEXT,
  zip TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  source TEXT NOT NULL DEFAULT 'site',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cnpj)
);

CREATE INDEX idx_accounting_firms_user ON public.accounting_firms(user_id);
CREATE INDEX idx_accounting_firms_status ON public.accounting_firms(status);

ALTER TABLE public.accounting_firms ENABLE ROW LEVEL SECURITY;

-- Public (anon) can submit registration request
CREATE POLICY "accounting_firms_insert_public"
  ON public.accounting_firms FOR INSERT
  TO anon
  WITH CHECK (status = 'pendente' AND source = 'site' AND user_id IS NULL);

-- Authenticated owner can view their firm; managers see all
CREATE POLICY "accounting_firms_select_own_or_mgr"
  ON public.accounting_firms FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora')
    OR public.has_role(auth.uid(), 'auditor_chefe')
  );

CREATE POLICY "accounting_firms_update_own_or_mgr"
  ON public.accounting_firms FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora')
    OR public.has_role(auth.uid(), 'auditor_chefe')
  );

CREATE POLICY "accounting_firms_delete_mgr"
  ON public.accounting_firms FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia')
    OR public.has_role(auth.uid(), 'coordenadora')
  );

CREATE TRIGGER trg_accounting_firms_updated
  BEFORE UPDATE ON public.accounting_firms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== companies: vincular contabilidade ==========
ALTER TABLE public.companies
  ADD COLUMN accounting_firm_id UUID REFERENCES public.accounting_firms(id) ON DELETE SET NULL;

CREATE INDEX idx_companies_accounting_firm ON public.companies(accounting_firm_id);