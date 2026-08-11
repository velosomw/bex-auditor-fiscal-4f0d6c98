DO $$ 
DECLARE
    v_user_id uuid := '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
BEGIN
    -- Delete detailed financial data
    DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = v_user_id);
    
    -- Delete audit reports
    DELETE FROM public.audit_reports WHERE created_by = v_user_id;
    
    -- Delete pipeline and document metadata
    DELETE FROM public.pipeline_documents WHERE created_by = v_user_id;
    DELETE FROM public.audit_documents WHERE created_by = v_user_id;
    
    -- Delete AI jobs and logs
    DELETE FROM public.ai_jobs WHERE requested_by = v_user_id;
    DELETE FROM public.ai_usage_logs WHERE created_by = v_user_id;
    
    -- Delete audits
    DELETE FROM public.audits WHERE created_by = v_user_id;
    
    -- Delete companies associated with the user
    DELETE FROM public.companies WHERE created_by = v_user_id;
    
    RAISE NOTICE 'Cleanup completed for user ID: %', v_user_id;
END $$;