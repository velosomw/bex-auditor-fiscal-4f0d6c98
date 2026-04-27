
-- 1. Coluna gerada para lookup case-insensitive no dicionário
ALTER TABLE public.contabil_dictionary
  ADD COLUMN IF NOT EXISTS termo_original_normalizado text
  GENERATED ALWAYS AS (lower(btrim(regexp_replace(termo_original, '\s+', ' ', 'g')))) STORED;

-- 2. Índice único para upsert e lookup rápido
CREATE UNIQUE INDEX IF NOT EXISTS contabil_dictionary_termo_norm_uidx
  ON public.contabil_dictionary (termo_original_normalizado);

-- 3. Permitir que qualquer usuário autenticado insira/atualize entradas no dicionário
--    (cache colaborativo populado automaticamente pelo pipeline). Apenas gestores deletam.
DROP POLICY IF EXISTS cd_ins ON public.contabil_dictionary;
CREATE POLICY cd_ins ON public.contabil_dictionary
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS cd_upd ON public.contabil_dictionary;
CREATE POLICY cd_upd ON public.contabil_dictionary
  FOR UPDATE TO authenticated
  USING (true);

-- 4. Coluna de progresso textual no documento (lido pelo frontend via polling/realtime)
ALTER TABLE public.pipeline_documents
  ADD COLUMN IF NOT EXISTS progress text;

-- 5. Índice para acelerar polling por status
CREATE INDEX IF NOT EXISTS pipeline_documents_status_idx
  ON public.pipeline_documents (status);
