-- Tabela de scores Kanitz mensais (per-month visibility)
CREATE TABLE IF NOT EXISTS public.kanitz_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL,
  mes DATE NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  rating TEXT NOT NULL DEFAULT 'B - Atenção',
  x1 NUMERIC,
  x2 NUMERIC,
  x3 NUMERIC,
  x4 NUMERIC,
  x5 NUMERIC,
  ativo_total NUMERIC,
  patrimonio_liquido NUMERIC,
  insight TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (audit_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_kanitz_scores_audit ON public.kanitz_scores(audit_id);
CREATE INDEX IF NOT EXISTS idx_kanitz_scores_mes ON public.kanitz_scores(mes);

ALTER TABLE public.kanitz_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kz_sel" ON public.kanitz_scores FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
  AND (a.created_by = auth.uid()
       OR has_role(auth.uid(), 'gestor_ia'::app_role)
       OR has_role(auth.uid(), 'coordenadora'::app_role)
       OR has_role(auth.uid(), 'auditor_chefe'::app_role))));

CREATE POLICY "kz_ins" ON public.kanitz_scores FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
  AND a.created_by = auth.uid()));

CREATE POLICY "kz_upd" ON public.kanitz_scores FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
  AND (a.created_by = auth.uid()
       OR has_role(auth.uid(), 'gestor_ia'::app_role)
       OR has_role(auth.uid(), 'coordenadora'::app_role))));

CREATE POLICY "kz_del" ON public.kanitz_scores FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.audits a WHERE a.id = kanitz_scores.audit_id
  AND (a.created_by = auth.uid()
       OR has_role(auth.uid(), 'gestor_ia'::app_role)
       OR has_role(auth.uid(), 'coordenadora'::app_role))));