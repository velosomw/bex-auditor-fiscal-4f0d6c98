ALTER POLICY audit_documents_update_own_or_mgr ON public.audit_documents
  WITH CHECK ((auth.uid() = created_by) OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role) OR has_role(auth.uid(), 'auditor_chefe'::app_role));

ALTER POLICY audit_reports_update_own_or_mgr ON public.audit_reports
  WITH CHECK ((auth.uid() = created_by) OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role) OR has_role(auth.uid(), 'auditor_chefe'::app_role));

ALTER POLICY audits_upd ON public.audits
  WITH CHECK ((auth.uid() = created_by) OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role) OR has_role(auth.uid(), 'auditor_chefe'::app_role));

ALTER POLICY companies_update_owner_or_mgr ON public.companies
  WITH CHECK ((auth.uid() = created_by) OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role) OR has_role(auth.uid(), 'auditor_chefe'::app_role));

ALTER POLICY pd_upd ON public.pipeline_documents
  WITH CHECK ((auth.uid() = created_by) OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role) OR has_role(auth.uid(), 'auditor_chefe'::app_role));

ALTER POLICY subs_update_own_or_mgr ON public.subscriptions
  WITH CHECK ((auth.uid() = user_id) OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));