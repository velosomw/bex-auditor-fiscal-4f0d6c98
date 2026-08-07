-- Deletar dados de auditoria, documentos, empresas e workspace para o usuário específico
DO $$
DECLARE
    target_user_id uuid := '26fb6f09-d3b4-4275-abb3-7de2ec79d128'; -- user_id para contabilidade1000@contabil.com.br
BEGIN
    -- 1. Deletar logs de auditoria
    DELETE FROM public.audit_logs 
    WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = target_user_id);
    
    -- 2. Deletar dados do Workspace (bs_dados)
    DELETE FROM public.bs_dados 
    WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = target_user_id);
    
    -- 3. Deletar Auditorias (audits)
    DELETE FROM public.audits WHERE created_by = target_user_id;
    
    -- 4. Deletar Documentos (audit_documents)
    DELETE FROM public.audit_documents WHERE created_by = target_user_id;
    
    -- 5. Deletar Empresas (companies) vinculadas ao usuário
    DELETE FROM public.companies WHERE created_by = target_user_id;
    
    RAISE NOTICE 'Limpeza concluída para o usuário %', target_user_id;
END $$;