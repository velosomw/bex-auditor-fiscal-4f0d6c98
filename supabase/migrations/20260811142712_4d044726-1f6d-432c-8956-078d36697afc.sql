UPDATE public.pipeline_documents 
SET status = 'failed', error_message = 'Manual override to resolve lock' 
WHERE company_id = '2a6c00c9-3e4b-4b15-895e-19c339afe4d3' 
AND status IN ('pending', 'normalizing', 'processing');