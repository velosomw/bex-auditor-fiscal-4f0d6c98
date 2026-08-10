-- Deep cleanup for user: contabilidade1000@contabil.com.br (26fb6f09-d3b4-4275-abb3-7de2ec79d128)
DO $$
DECLARE
    v_user_id uuid := '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
BEGIN
    -- 1. Dependent AI and Processing Logs
    DELETE FROM public.ai_jobs WHERE requested_by = v_user_id;
    
    -- 2. Audit Specific Tables
    DELETE FROM public.audit_reports WHERE created_by = v_user_id;
    DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = v_user_id);
    DELETE FROM public.audit_documents WHERE created_by = v_user_id;
    
    -- 3. Pipeline and Documents
    DELETE FROM public.pipeline_documents WHERE created_by = v_user_id;
    
    -- 4. Core Entities (Audits depends on Companies/Balancetes)
    DELETE FROM public.audits WHERE created_by = v_user_id;
    DELETE FROM public.companies WHERE created_by = v_user_id;

    RAISE NOTICE 'Basic cleanup completed for user %', v_user_id;
END $$;