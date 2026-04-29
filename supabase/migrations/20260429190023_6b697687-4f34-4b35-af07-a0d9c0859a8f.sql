-- Trigger para incrementar frequencia automaticamente em conflitos no contabil_dictionary
-- Quando um INSERT tenta inserir um termo_original_normalizado já existente, fazemos UPSERT incrementando frequencia.

-- Garante uniqueness para podermos usar ON CONFLICT em código futuro
CREATE UNIQUE INDEX IF NOT EXISTS contabil_dictionary_termo_norm_uq
  ON public.contabil_dictionary (termo_original_normalizado);

-- Trigger BEFORE INSERT: se já existe linha com mesmo termo_original_normalizado,
-- incrementa frequencia da existente e cancela o INSERT (evita duplicatas).
CREATE OR REPLACE FUNCTION public.contabil_dict_dedup_increment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF NEW.termo_original_normalizado IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO existing_id
  FROM public.contabil_dictionary
  WHERE termo_original_normalizado = NEW.termo_original_normalizado
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.contabil_dictionary
    SET frequencia = COALESCE(frequencia, 0) + 1,
        -- mantém termo_padrao/categoria se a nova linha trouxer info melhor
        termo_padrao = COALESCE(NULLIF(NEW.termo_padrao, ''), termo_padrao),
        categoria   = COALESCE(NULLIF(NEW.categoria, ''),   categoria),
        subcategoria = COALESCE(NULLIF(NEW.subcategoria, ''), subcategoria),
        embedding = COALESCE(NEW.embedding, embedding)
    WHERE id = existing_id;
    RETURN NULL; -- cancela o INSERT (linha já existe e foi incrementada)
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contabil_dict_dedup ON public.contabil_dictionary;
CREATE TRIGGER trg_contabil_dict_dedup
BEFORE INSERT ON public.contabil_dictionary
FOR EACH ROW
EXECUTE FUNCTION public.contabil_dict_dedup_increment();