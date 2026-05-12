
-- 1. Dedup hard constraint (parcial — apenas docs concluídos)
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_documents_dedup_completed_uidx
  ON public.pipeline_documents (created_by, content_hash)
  WHERE status = 'completed' AND content_hash IS NOT NULL;

-- 2. Lock por empresa — acelera busca de pipelines ativos
CREATE INDEX IF NOT EXISTS pipeline_documents_company_active_idx
  ON public.pipeline_documents (company_id, status, updated_at DESC)
  WHERE status IN ('pending', 'normalizing', 'processing');

-- 3. Listagens por usuário (dashboard de auditorias e relatórios)
CREATE INDEX IF NOT EXISTS audit_documents_created_by_idx
  ON public.audit_documents (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_reports_created_by_idx
  ON public.audit_reports (created_by, created_at DESC);

-- 4. Índice para query de logs por audit_id
CREATE INDEX IF NOT EXISTS audit_logs_audit_id_idx
  ON public.audit_logs (audit_id, created_at DESC);
