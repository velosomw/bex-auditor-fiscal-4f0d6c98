DO $$
DECLARE
    target_user_id uuid := '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
BEGIN
    -- Deletar registros vinculados a auditorias do usuário
    DELETE FROM public.kanitz_scores WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = target_user_id);
    DELETE FROM public.indicadores WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = target_user_id);
    DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = target_user_id);
    
    -- Deletar balancetes e auditorias
    DELETE FROM public.balancete_lines WHERE balancete_id IN (SELECT id FROM public.balancetes WHERE created_by = target_user_id);
    DELETE FROM public.balancetes WHERE created_by = target_user_id;
    
    DELETE FROM public.audit_reports WHERE created_by = target_user_id;
    DELETE FROM public.audits WHERE created_by = target_user_id;
    
    -- Documentos e Jobs
    DELETE FROM public.audit_documents WHERE created_by = target_user_id;
    DELETE FROM public.ai_jobs WHERE requested_by = target_user_id;
    DELETE FROM public.ai_usage_logs WHERE created_by = target_user_id;
END $$;