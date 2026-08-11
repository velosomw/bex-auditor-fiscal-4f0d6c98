-- Cleanup data for user 26fb6f09-d3b4-4275-abb3-7de2ec79d128 (contabilidade1000@contabil.com.br)
-- This version also cleans up the companies table and cascading relations.

DO $$ 
DECLARE
    target_user_id uuid := '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
BEGIN
    -- Delete related data in order to respect constraints (though most are ON DELETE CASCADE)
    
    -- 1. Balancete data and lines depend on balancetes and pipeline_documents
    DELETE FROM public.balancete_lines WHERE balancete_id IN (SELECT id FROM public.balancetes WHERE created_by = target_user_id);
    DELETE FROM public.balancete_data WHERE document_id IN (SELECT id FROM public.pipeline_documents WHERE created_by = target_user_id);
    
    -- 2. Balancetes depend on audits
    DELETE FROM public.balancetes WHERE created_by = target_user_id;
    
    -- 3. Audit logs depend on audits
    DELETE FROM public.audit_logs WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = target_user_id);
    
    -- 4. Audit reports
    DELETE FROM public.audit_reports WHERE created_by = target_user_id;
    
    -- 5. Audits
    DELETE FROM public.audits WHERE created_by = target_user_id;
    
    -- 6. Pipeline documents
    DELETE FROM public.pipeline_documents WHERE created_by = target_user_id;
    
    -- 7. Audit documents
    DELETE FROM public.audit_documents WHERE created_by = target_user_id;
    
    -- 8. Audit account cache
    DELETE FROM public.audit_account_cache WHERE created_by = target_user_id;
    
    -- 9. AI Jobs
    DELETE FROM public.ai_jobs WHERE requested_by = target_user_id;
    
    -- 10. AI Usage logs
    DELETE FROM public.ai_usage_logs WHERE created_by = target_user_id;

    -- 11. Companies
    DELETE FROM public.companies WHERE created_by = target_user_id;
    
    -- 12. Accounting firms
    DELETE FROM public.accounting_firms WHERE user_id = target_user_id;

END $$;