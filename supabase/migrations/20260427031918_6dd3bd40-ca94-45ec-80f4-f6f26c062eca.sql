
DROP POLICY IF EXISTS cd_ins ON public.contabil_dictionary;
CREATE POLICY cd_ins ON public.contabil_dictionary
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS cd_upd ON public.contabil_dictionary;
CREATE POLICY cd_upd ON public.contabil_dictionary
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);
