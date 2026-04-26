CREATE OR REPLACE FUNCTION public.match_contabil_dictionary(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  termo_original text,
  termo_padrao text,
  categoria text,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT cd.id, cd.termo_original, cd.termo_padrao, cd.categoria,
         1 - (cd.embedding <=> query_embedding) AS similarity
  FROM public.contabil_dictionary cd
  WHERE cd.embedding IS NOT NULL
    AND 1 - (cd.embedding <=> query_embedding) > match_threshold
  ORDER BY cd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_dataset_validated(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  input_json jsonb,
  output_corrected jsonb,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT dv.id, dv.input_json, dv.output_corrected,
         1 - (dv.embedding <=> query_embedding) AS similarity
  FROM public.dataset_validated dv
  WHERE dv.embedding IS NOT NULL
    AND 1 - (dv.embedding <=> query_embedding) > match_threshold
  ORDER BY dv.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;