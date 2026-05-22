-- Cota global (linha única, id=true)
CREATE TABLE IF NOT EXISTS public.report_global_quotas (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  resumido integer NOT NULL DEFAULT 50 CHECK (resumido >= 0 AND resumido <= 9999),
  completo integer NOT NULL DEFAULT 10 CHECK (completo >= 0 AND completo <= 9999),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.report_global_quotas (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.report_global_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY rgq_sel ON public.report_global_quotas
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY rgq_upd ON public.report_global_quotas
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenadora'::app_role))
  WITH CHECK (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenadora'::app_role));

-- Extras por empresa
CREATE TABLE IF NOT EXISTS public.report_company_quota_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  company_name text NOT NULL,
  resumido_extra integer NOT NULL DEFAULT 0 CHECK (resumido_extra >= 0 AND resumido_extra <= 999),
  completo_extra integer NOT NULL DEFAULT 0 CHECK (completo_extra >= 0 AND completo_extra <= 999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS idx_rcqe_company ON public.report_company_quota_extras(company_id);

ALTER TABLE public.report_company_quota_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY rcqe_sel ON public.report_company_quota_extras
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY rcqe_ins ON public.report_company_quota_extras
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenadora'::app_role));
CREATE POLICY rcqe_upd ON public.report_company_quota_extras
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenadora'::app_role))
  WITH CHECK (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenadora'::app_role));
CREATE POLICY rcqe_del ON public.report_company_quota_extras
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenadora'::app_role));