
-- Primeiro limpar tabelas dependentes
DELETE FROM public.ai_jobs WHERE requested_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_reports WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audits WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.pipeline_documents WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_documents WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- Agora limpar a tabela base de empresas (que pode ser dona dos outros registros via cascading se configurado, mas garantimos aqui)
DELETE FROM public.companies WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
