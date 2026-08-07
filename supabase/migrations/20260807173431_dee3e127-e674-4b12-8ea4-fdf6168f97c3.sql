-- Explicit ID: 26fb6f09-d3b4-4275-abb3-7de2ec79d128
DELETE FROM public.audit_reports WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audits WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.companies WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.ai_usage_logs WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_documents WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.balancetes WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- Cleanup orphaned rows in child tables
DELETE FROM public.bs_dados WHERE audit_id NOT IN (SELECT id FROM public.audits);
DELETE FROM public.balancete_consolidado WHERE audit_id NOT IN (SELECT id FROM public.audits);
DELETE FROM public.audit_logs WHERE audit_id NOT IN (SELECT id FROM public.audits);
DELETE FROM public.balancete_lines WHERE balancete_id NOT IN (SELECT id FROM public.balancetes);

-- Job cleanup
DELETE FROM public.ai_jobs WHERE requested_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
