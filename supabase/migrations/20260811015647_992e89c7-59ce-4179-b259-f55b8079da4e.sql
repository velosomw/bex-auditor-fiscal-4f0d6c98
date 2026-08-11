DO $$ 
DECLARE
    user_id_1 UUID := '26fb6f09-d3b4-4275-abb3-7de2ec79d128'; -- contabilidade1000@contabil.com.br
    user_id_2 UUID := 'b99d8224-df9b-4294-9d1c-d27a744e41f7'; -- contabilidade@empresa.com.br
BEGIN
    -- 1. Limpeza via cascade balancetes -> audit_documents -> outros
    -- Identificar documentos dos usuários
    DELETE FROM public.balancete_data WHERE document_id IN (SELECT id FROM public.audit_documents WHERE created_by IN (user_id_1, user_id_2));
    DELETE FROM public.balancete_lines WHERE balancete_id IN (SELECT id FROM public.balancetes WHERE created_by IN (user_id_1, user_id_2));
    
    -- 2. Limpeza via audits
    DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by IN (user_id_1, user_id_2));
    DELETE FROM public.indicadores WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by IN (user_id_1, user_id_2));
    DELETE FROM public.kanitz_scores WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by IN (user_id_1, user_id_2));
    DELETE FROM public.audit_logs WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by IN (user_id_1, user_id_2));
    
    -- 3. Limpeza de registros diretos
    DELETE FROM public.ai_jobs WHERE requested_by IN (user_id_1, user_id_2);
    DELETE FROM public.ai_usage_logs WHERE created_by IN (user_id_1, user_id_2);
    
    -- 4. Deletar as entidades principais (ordem reversa de FK se não for cascade)
    DELETE FROM public.audit_reports WHERE created_by IN (user_id_1, user_id_2);
    DELETE FROM public.audits WHERE created_by IN (user_id_1, user_id_2);
    DELETE FROM public.balancetes WHERE created_by IN (user_id_1, user_id_2);
    DELETE FROM public.audit_documents WHERE created_by IN (user_id_1, user_id_2);
    
    -- Nota: profiles e user_roles não são deletados para permitir que o usuário continue logado e com acesso,
    -- apenas os dados de auditoria são resetados conforme pedido.
END $$;