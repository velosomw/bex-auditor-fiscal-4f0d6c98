BEGIN;
-- Todas as tabelas agora usam 'created_by' ou 'requested_by' para identificar o usuário.
DELETE FROM public.ai_usage_logs WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.ai_jobs WHERE requested_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.pipeline_documents WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_reports WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_documents WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128');
DELETE FROM public.audits WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.companies WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
COMMIT;