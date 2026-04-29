ALTER TABLE public.pipeline_documents ADD COLUMN IF NOT EXISTS content_hash text;
CREATE INDEX IF NOT EXISTS idx_pipeline_documents_content_hash ON public.pipeline_documents(content_hash);
NOTIFY pgrst, 'reload schema';