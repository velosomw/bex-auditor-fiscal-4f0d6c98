CREATE POLICY "p_del_mgr"
ON public.profiles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));