
-- Migration to clear all data for specific profiles
-- Profile 1: contabilidade1000@contabil.com.br (Known ID: 26fb6f09-d3b4-4275-abb3-7de2ec79d128)
-- Profile 2: contabilidade@empresa.com.br (ID to be determined by the migration if possible, otherwise we clear by linked records if we can find them)

DO $$ 
DECLARE
    user1_id uuid := '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
    user2_id uuid;
BEGIN
    -- We'll try to find the second user ID if it exists in any common table
    -- Since we couldn't find it via API, we'll look directly in the DB
    SELECT user_id INTO user2_id FROM public.accounting_firms WHERE email = 'contabilidade@empresa.com.br' LIMIT 1;
    
    IF user2_id IS NULL THEN
        -- Try another table if available, but for now we'll proceed with user1
        RAISE NOTICE 'User 2 ID not found in accounting_firms';
    END IF;

    -- Cleanup for User 1
    DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = user1_id);
    DELETE FROM public.balancete_consolidado WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = user1_id);
    DELETE FROM public.balancetes WHERE created_by = user1_id;
    DELETE FROM public.audit_reports WHERE created_by = user1_id;
    DELETE FROM public.audit_logs WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = user1_id);
    DELETE FROM public.audits WHERE created_by = user1_id;
    DELETE FROM public.pipeline_documents WHERE created_by = user1_id;
    DELETE FROM public.companies WHERE created_by = user1_id;
    DELETE FROM public.accounting_firms WHERE user_id = user1_id;

    -- Cleanup for User 2 (if found)
    IF user2_id IS NOT NULL THEN
        DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = user2_id);
        DELETE FROM public.balancete_consolidado WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = user2_id);
        DELETE FROM public.balancetes WHERE created_by = user2_id;
        DELETE FROM public.audit_reports WHERE created_by = user2_id;
        DELETE FROM public.audit_logs WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = user2_id);
        DELETE FROM public.audits WHERE created_by = user2_id;
        DELETE FROM public.pipeline_documents WHERE created_by = user2_id;
        DELETE FROM public.companies WHERE created_by = user2_id;
        DELETE FROM public.accounting_firms WHERE user_id = user2_id;
    END IF;

    -- Also try to delete by email if columns exist in accounting_firms or companies
    DELETE FROM public.accounting_firms WHERE email IN ('contabilidade@empresa.com.br', 'contabilidade1000@contabil.com.br');
    DELETE FROM public.companies WHERE email IN ('contabilidade@empresa.com.br', 'contabilidade1000@contabil.com.br');

END $$;
