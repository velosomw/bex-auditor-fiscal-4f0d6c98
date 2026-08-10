-- User ID for contabilidade1000@contabil.com.br: 26fb6f09-d3b4-4275-abb3-7de2ec79d128

-- 1. Delete records from bs_dados (linked via audit_id to audits)
DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128');

-- 2. Delete audit reports (linked directly to user via created_by)
DELETE FROM public.audit_reports WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 3. Delete audit documents (linked directly to user via created_by)
DELETE FROM public.audit_documents WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 4. Delete audits
DELETE FROM public.audits WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 5. Delete pipeline documents
DELETE FROM public.pipeline_documents WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 6. Delete AI jobs
DELETE FROM public.ai_jobs WHERE requested_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 7. Delete AI usage logs
DELETE FROM public.ai_usage_logs WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 8. Delete companies
DELETE FROM public.companies WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
