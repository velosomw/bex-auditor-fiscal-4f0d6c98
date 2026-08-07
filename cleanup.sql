BEGIN;

-- Tables that likely have user_id
DELETE FROM public.balancete_lines WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.balancete_consolidado WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.balancetes WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.balancete_data WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.ocr_results WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.pipeline_embeddings WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.pipeline_analysis_results WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.dataset_validated WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_logs WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.indicadores WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.insights WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.kanitz_scores WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.bs_dados WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audits WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_reports WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_documents WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_account_cache WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.ai_jobs WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.pipeline_documents WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.companies WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

COMMIT;
