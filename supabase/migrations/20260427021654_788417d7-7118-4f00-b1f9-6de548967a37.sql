UPDATE public.pipeline_documents
SET status = 'failed',
    error_message = COALESCE(error_message, 'Travado em normalizing — reprocesse via Documentos Órfãos'),
    updated_at = now()
WHERE status IN ('normalizing', 'ocr', 'extracting', 'validating')
  AND updated_at < now() - interval '3 minutes';