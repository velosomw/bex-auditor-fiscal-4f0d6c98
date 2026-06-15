DO $$
DECLARE
  v_users uuid[];
  v_audits uuid[];
BEGIN
  SELECT array_agg(user_id) INTO v_users
  FROM public.user_roles WHERE role = 'contabilidade'::public.app_role;

  IF v_users IS NULL THEN RETURN; END IF;

  SELECT array_agg(id) INTO v_audits
  FROM public.audits WHERE created_by = ANY(v_users);

  IF v_audits IS NOT NULL THEN
    DELETE FROM public.audit_logs WHERE audit_id = ANY(v_audits);
    DELETE FROM public.kanitz_scores WHERE audit_id = ANY(v_audits);
    DELETE FROM public.indicadores WHERE audit_id = ANY(v_audits);
    DELETE FROM public.insights WHERE audit_id = ANY(v_audits);
    DELETE FROM public.bs_dados WHERE audit_id = ANY(v_audits);
    DELETE FROM public.balancete_consolidado WHERE audit_id = ANY(v_audits);
    DELETE FROM public.balancetes WHERE audit_id = ANY(v_audits);
  END IF;

  DELETE FROM public.audit_reports WHERE created_by = ANY(v_users);
  DELETE FROM public.audit_documents WHERE created_by = ANY(v_users);
  DELETE FROM public.audits WHERE created_by = ANY(v_users);
END $$;