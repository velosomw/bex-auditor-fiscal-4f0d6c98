-- Apply missing GRANTS to all public tables to fix permission issues
-- This ensures the Data API (PostgREST) can access the tables as defined by RLS policies

DO $$ 
DECLARE 
    r RECORD;
    tables_list TEXT[] := ARRAY[
        'account_mapping',
        'accounting_firms',
        'ai_cost_config',
        'ai_usage_logs',
        'audit_documents',
        'audit_logs',
        'audit_reports',
        'audits',
        'balancete_consolidado',
        'balancete_data',
        'balancete_lines',
        'balancetes',
        'bs_dados',
        'companies',
        'contabil_dictionary',
        'dataset_validated',
        'indicadores',
        'insights',
        'login_attempts',
        'ocr_results',
        'pipeline_analysis_results',
        'pipeline_documents',
        'pipeline_embeddings',
        'profiles',
        'subscription_invoices',
        'subscription_plans',
        'subscriptions',
        'user_roles'
    ];
    t TEXT;
BEGIN 
    FOREACH t IN ARRAY tables_list LOOP
        -- Grant to authenticated users
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
        -- Grant to service_role (Edge Functions, Admin tasks)
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
        -- Grant to anon users (only SELECT, as most have RLS for restricted access)
        EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    END LOOP;
END $$;
