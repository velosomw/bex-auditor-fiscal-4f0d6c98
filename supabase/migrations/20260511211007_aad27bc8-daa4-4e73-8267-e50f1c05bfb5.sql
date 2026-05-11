ALTER TABLE public.audit_documents ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN public.audit_documents.metadata IS 'Metadados extras do documento, como períodos detectados (periodos: string[]).';