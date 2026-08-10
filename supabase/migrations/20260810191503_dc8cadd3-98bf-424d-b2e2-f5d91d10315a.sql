DO $$
DECLARE
    user_ids uuid[] := ARRAY['26fb6f09-d3b4-4275-abb3-7de2ec79d128', 'b99d8224-df9b-4294-9d1c-d27a744e41f7']::uuid[];
BEGIN
    DELETE FROM public.kanitz_scores WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = ANY(user_ids));
    DELETE FROM public.indicadores WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = ANY(user_ids));
    DELETE FROM public.audit_reports WHERE created_by = ANY(user_ids);
    DELETE FROM public.audit_logs WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = ANY(user_ids));
    DELETE FROM public.audit_account_cache WHERE created_by = ANY(user_ids);
    
    DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = ANY(user_ids));
    DELETE FROM public.balancetes WHERE created_by = ANY(user_ids);
    
    DELETE FROM public.ai_jobs WHERE requested_by = ANY(user_ids);
    DELETE FROM public.pipeline_analysis_results WHERE document_id IN (SELECT id FROM public.pipeline_documents WHERE created_by = ANY(user_ids));
    DELETE FROM public.ocr_results WHERE document_id IN (SELECT id FROM public.pipeline_documents WHERE created_by = ANY(user_ids));
    DELETE FROM public.pipeline_documents WHERE created_by = ANY(user_ids);
    
    DELETE FROM public.audits WHERE created_by = ANY(user_ids);
    DELETE FROM public.companies WHERE created_by = ANY(user_ids);
END $$;