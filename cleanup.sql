BEGIN;

-- 1. Deletar registros de jobs e logs
DELETE FROM public.ai_jobs WHERE requested_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_logs WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 2. Deletar linhas de balancete (ligadas a balancetes que pertencem ao usuário)
DELETE FROM public.balancete_lines WHERE balancete_id IN (SELECT id FROM public.balancetes WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128');

-- 3. Deletar dados de balancete (outras tabelas auxiliares)
DELETE FROM public.balancete_data WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.balancete_consolidado WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 4. Deletar resultados de OCR e embeddings
DELETE FROM public.ocr_results WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.pipeline_embeddings WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.pipeline_analysis_results WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 5. Deletar scores e indicadores
DELETE FROM public.kanitz_scores WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.indicadores WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.insights WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 6. Deletar dados financeiros brutos (bs_dados) ligados a auditorias do usuário
DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128');
DELETE FROM public.audit_account_cache WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 7. Deletar relatórios e documentos de auditoria
DELETE FROM public.audit_reports WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audit_documents WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.pipeline_documents WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.dataset_validated WHERE user_id = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 8. Deletar balancetes e auditorias
DELETE FROM public.balancetes WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';
DELETE FROM public.audits WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

-- 9. Deletar empresas
DELETE FROM public.companies WHERE created_by = '26fb6f09-d3b4-4275-abb3-7de2ec79d128';

COMMIT;
