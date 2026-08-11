DO $$
DECLARE
    v_user_id uuid := '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
BEGIN
    -- Delete from child tables first
    DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = v_user_id);
    DELETE FROM public.audit_reports WHERE created_by = v_user_id;
    DELETE FROM public.audit_documents WHERE created_by = v_user_id;
    DELETE FROM public.pipeline_documents WHERE created_by = v_user_id;
    DELETE FROM public.ai_jobs WHERE requested_by = v_user_id;
    DELETE FROM public.ai_usage_logs WHERE created_by = v_user_id;
    DELETE FROM public.balancetes WHERE created_by = v_user_id;
    
    -- Delete from parent tables
    DELETE FROM public.audits WHERE created_by = v_user_id;
    DELETE FROM public.companies WHERE created_by = v_user_id;
    
    RAISE NOTICE 'Cleanup complete for user %', v_user_id;
END $$;