-- Comprehensive cleanup for user ID: 26fb6f09-d3b4-4275-abb3-7de2ec79d128

DO $$
DECLARE
    v_user_id uuid := '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
BEGIN
    -- 1. Jobs e Logs
    DELETE FROM public.ai_jobs WHERE requested_by = v_user_id;

    -- 2. Dados vinculados a Auditorias do usuário
    DELETE FROM public.audit_logs WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = v_user_id);
    DELETE FROM public.insights WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = v_user_id);
    DELETE FROM public.kanitz_scores WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = v_user_id);
    DELETE FROM public.indicadores WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = v_user_id);
    DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = v_user_id);
    DELETE FROM public.balancete_consolidado WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = v_user_id);

    -- 3. Dados vinculados a Balancetes do usuário
    DELETE FROM public.balancete_lines WHERE balancete_id IN (SELECT id FROM public.balancetes WHERE created_by = v_user_id);
    
    -- 4. Dados vinculados a Documentos do usuário
    DELETE FROM public.ocr_results WHERE document_id IN (SELECT id FROM public.pipeline_documents WHERE created_by = v_user_id);
    DELETE FROM public.pipeline_embeddings WHERE document_id IN (SELECT id FROM public.pipeline_documents WHERE created_by = v_user_id);
    DELETE FROM public.pipeline_analysis_results WHERE document_id IN (SELECT id FROM public.pipeline_documents WHERE created_by = v_user_id);
    DELETE FROM public.dataset_validated WHERE document_id IN (SELECT id FROM public.pipeline_documents WHERE created_by = v_user_id);
    DELETE FROM public.balancete_data WHERE document_id IN (SELECT id FROM public.pipeline_documents WHERE created_by = v_user_id);

    -- 5. Tabelas com 'created_by' ou similar
    DELETE FROM public.audit_account_cache WHERE created_by = v_user_id;
    DELETE FROM public.audit_reports WHERE created_by = v_user_id;
    DELETE FROM public.audit_documents WHERE created_by = v_user_id;
    DELETE FROM public.balancetes WHERE created_by = v_user_id;
    DELETE FROM public.pipeline_documents WHERE created_by = v_user_id;
    DELETE FROM public.audits WHERE created_by = v_user_id;
    DELETE FROM public.companies WHERE created_by = v_user_id;

END $$;
