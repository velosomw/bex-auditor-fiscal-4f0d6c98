
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
    COALESCE(company_id::text, ''),
    COALESCE(periodo, ''),
    conta_original_normalizada
  );

CREATE INDEX IF NOT EXISTS audit_account_cache_lookup
  ON public.audit_account_cache (company_id, periodo);

CREATE INDEX IF NOT EXISTS audit_account_cache_norm
  ON public.audit_account_cache (conta_original_normalizada);

ALTER TABLE public.audit_account_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY aac_sel ON public.audit_account_cache
  FOR SELECT TO authenticated
  USING (
    auth.uid() = created_by
    OR has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenadora'::app_role)
    OR has_role(auth.uid(), 'auditor_chefe'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = audit_account_cache.company_id
        AND (c.created_by = auth.uid()
             OR has_role(auth.uid(), 'gestor_ia'::app_role)
             OR has_role(auth.uid(), 'coordenadora'::app_role))
    )
  );

CREATE POLICY aac_ins ON public.audit_account_cache
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY aac_upd ON public.audit_account_cache
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenadora'::app_role)
    OR has_role(auth.uid(), 'auditor_chefe'::app_role)
  );

CREATE POLICY aac_del ON public.audit_account_cache
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenadora'::app_role)
  );

CREATE TRIGGER trg_aac_updated_at
  BEFORE UPDATE ON public.audit_account_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
