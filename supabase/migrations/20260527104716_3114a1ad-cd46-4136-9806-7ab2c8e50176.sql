ALTER TABLE public.accounting_firms ADD COLUMN IF NOT EXISTS metadata jsonb;
-- Unique CNPJ — case-insensitive against CNPJ with mask noise. Use a partial functional index that strips non-digits.
CREATE UNIQUE INDEX IF NOT EXISTS accounting_firms_cnpj_digits_uidx
  ON public.accounting_firms ((regexp_replace(cnpj, '\D', '', 'g')))
  WHERE cnpj IS NOT NULL AND length(regexp_replace(cnpj, '\D', '', 'g')) >= 14;