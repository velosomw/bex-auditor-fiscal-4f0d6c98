-- Limpeza completa de duplicatas usando ctid (mantém uma linha por par)
DELETE FROM public.balancete_data a
USING public.balancete_data b
WHERE a.document_id = b.document_id
  AND a.conta_original = b.conta_original
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS balancete_data_doc_conta_uq
  ON public.balancete_data (document_id, conta_original);