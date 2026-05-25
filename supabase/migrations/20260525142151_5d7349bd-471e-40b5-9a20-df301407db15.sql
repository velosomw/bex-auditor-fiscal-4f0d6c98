
DROP POLICY IF EXISTS r_sel ON public.user_roles;
CREATE POLICY r_sel ON public.user_roles FOR SELECT
USING (auth.uid() = user_id OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));

DROP POLICY IF EXISTS rcqe_sel ON public.report_company_quota_extras;
CREATE POLICY rcqe_sel ON public.report_company_quota_extras FOR SELECT
USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));
