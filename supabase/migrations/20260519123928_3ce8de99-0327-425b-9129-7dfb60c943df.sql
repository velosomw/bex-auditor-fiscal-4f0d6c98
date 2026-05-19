
-- 1) companies: restringir SELECT (antes era USING true)
DROP POLICY IF EXISTS companies_select_all_auth ON public.companies;
CREATE POLICY companies_select_owner_or_mgr
ON public.companies FOR SELECT TO authenticated
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenadora'::app_role)
  OR has_role(auth.uid(), 'auditor_chefe'::app_role)
);

-- 2) email_send_log: permitir SELECT a gestores/coordenação (service role já tem)
CREATE POLICY email_send_log_select_mgr
ON public.email_send_log FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenadora'::app_role)
);

-- 3) contabil_dictionary: restringir UPDATE
DROP POLICY IF EXISTS cd_upd ON public.contabil_dictionary;
CREATE POLICY cd_upd
ON public.contabil_dictionary FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenadora'::app_role)
  OR has_role(auth.uid(), 'auditor_chefe'::app_role)
);

-- 4) account_mapping: restringir SELECT (antes era USING true)
DROP POLICY IF EXISTS am_sel ON public.account_mapping;
CREATE POLICY am_sel
ON public.account_mapping FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenadora'::app_role)
  OR has_role(auth.uid(), 'auditor_chefe'::app_role)
  OR has_role(auth.uid(), 'contabilidade'::app_role)
);

-- 5) ai_cost_config: restringir SELECT a gestores (antes era true)
DROP POLICY IF EXISTS ai_cost_config_select_auth ON public.ai_cost_config;
CREATE POLICY ai_cost_config_select_mgr
ON public.ai_cost_config FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenadora'::app_role)
);

-- 6) ai_usage_logs: restringir SELECT (antes true)
DROP POLICY IF EXISTS ai_usage_logs_select_auth ON public.ai_usage_logs;
CREATE POLICY ai_usage_logs_select_mgr
ON public.ai_usage_logs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenadora'::app_role)
);

-- 7) dataset_validated: restringir SELECT (antes true)
DROP POLICY IF EXISTS dv_sel ON public.dataset_validated;
CREATE POLICY dv_sel
ON public.dataset_validated FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenadora'::app_role)
  OR has_role(auth.uid(), 'auditor_chefe'::app_role)
  OR auth.uid() = corrected_by
);

-- 8) contabil_dictionary SELECT permanece liberado (usado em normalização) — sem alteração.

-- 9) Fixar search_path em funções customizadas
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.validate_company_status() SET search_path = public;
ALTER FUNCTION public.touch_email_settings() SET search_path = public;
ALTER FUNCTION public.contabil_dict_dedup_increment() SET search_path = public;
ALTER FUNCTION public.trg_calculate_cost() SET search_path = public;
