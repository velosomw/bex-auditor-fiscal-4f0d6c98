-- Add status, payment and contact metadata to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'em_dia',
  ADD COLUMN IF NOT EXISTS payment_due_date DATE,
  ADD COLUMN IF NOT EXISTS cnae TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS uf TEXT,
  ADD COLUMN IF NOT EXISTS zip TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auditor';

-- Allow public (anon) to insert company registration requests from /solucoes
DROP POLICY IF EXISTS companies_insert_public ON public.companies;
CREATE POLICY companies_insert_public ON public.companies
  FOR INSERT
  TO anon
  WITH CHECK (status = 'pendente' AND source = 'site');

-- Make created_by nullable so anon submissions can be saved without a user
ALTER TABLE public.companies ALTER COLUMN created_by DROP NOT NULL;

-- Update existing insert policy for authenticated to keep working (already exists)
-- (companies_insert_auth is already in place and requires auth.uid() = created_by)

-- Add a check constraint via trigger to validate status values
CREATE OR REPLACE FUNCTION public.validate_company_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('ativa','pendente','bloqueada') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  IF NEW.payment_status NOT IN ('em_dia','vencido','isento') THEN
    RAISE EXCEPTION 'Invalid payment_status: %', NEW.payment_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_company_status ON public.companies;
CREATE TRIGGER trg_validate_company_status
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.validate_company_status();