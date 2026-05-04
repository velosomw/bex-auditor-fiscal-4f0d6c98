CREATE TABLE public.balancete_consolidado (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id uuid NOT NULL,
  balancete_id uuid,
  mes_referencia date NOT NULL,
  codigo text NOT NULL,
  descricao text,
  ref_capital text,
  saldo_atual numeric NOT NULL DEFAULT 0,
  saldo_anterior numeric,
  debito numeric,
  credito numeric,
  is_leaf boolean NOT NULL DEFAULT true,
  fonte text NOT NULL DEFAULT 'parser_xlsx',
  file_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_balancete_consolidado_audit ON public.balancete_consolidado(audit_id);
CREATE INDEX idx_balancete_consolidado_mes ON public.balancete_consolidado(audit_id, mes_referencia);
CREATE INDEX idx_balancete_consolidado_codigo ON public.balancete_consolidado(audit_id, codigo);

ALTER TABLE public.balancete_consolidado ENABLE ROW LEVEL SECURITY;

CREATE POLICY bc_sel ON public.balancete_consolidado FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancete_consolidado.audit_id
  AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
       OR has_role(auth.uid(),'coordenadora'::app_role)
       OR has_role(auth.uid(),'auditor_chefe'::app_role))));

CREATE POLICY bc_ins ON public.balancete_consolidado FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancete_consolidado.audit_id
  AND a.created_by = auth.uid()));

CREATE POLICY bc_upd ON public.balancete_consolidado FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancete_consolidado.audit_id
  AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
       OR has_role(auth.uid(),'coordenadora'::app_role)
       OR has_role(auth.uid(),'auditor_chefe'::app_role))));

CREATE POLICY bc_del ON public.balancete_consolidado FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = balancete_consolidado.audit_id
  AND (a.created_by = auth.uid() OR has_role(auth.uid(),'gestor_ia'::app_role)
       OR has_role(auth.uid(),'coordenadora'::app_role))));