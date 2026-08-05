
-- 1. Deletar scores de Kanitz (usa audit_id)
DELETE FROM public.kanitz_scores WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = 'b99d8224-df9b-4294-9d1c-d27a744e41f7');

-- 2. Deletar dados processados (usa audit_id)
DELETE FROM public.bs_dados WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = 'b99d8224-df9b-4294-9d1c-d27a744e41f7');

-- 3. Deletar balancetes (usa audit_id)
DELETE FROM public.balancetes WHERE audit_id IN (SELECT id FROM public.audits WHERE created_by = 'b99d8224-df9b-4294-9d1c-d27a744e41f7');

-- 4. Deletar relatórios (usa company_id)
DELETE FROM public.audit_reports WHERE company_id = '6a62811a-c547-4baa-8af7-30c3f78db31a';

-- 5. Deletar documentos de auditoria (usa created_by)
DELETE FROM public.audit_documents WHERE created_by = 'b99d8224-df9b-4294-9d1c-d27a744e41f7';

-- 6. Deletar a auditoria final (usa created_by)
DELETE FROM public.audits WHERE created_by = 'b99d8224-df9b-4294-9d1c-d27a744e41f7';
