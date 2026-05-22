
-- Plans catalog
CREATE TABLE public.subscription_plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  monthly_report_limit INTEGER NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select_all ON public.subscription_plans FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY plans_mgr_write ON public.subscription_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));

INSERT INTO public.subscription_plans (code, name, price_cents, monthly_report_limit, features) VALUES
  ('pro', 'PRO', 0, 3, '["Cadastro com CNPJ e CRC", "Até 3 relatórios PRO/mês", "Gráficos e análise básica de balancetes", "Visibilidade Kanitz (resumida)"]'::jsonb),
  ('enterprise', 'Enterprise', 500, 16, '["Tudo do PRO", "6 relatórios completos Auditoria BEx IA/mês", "+10 relatórios PRO (desbloqueio PRO 10)", "2 relatórios simultâneos PRO + Kanitz", "Workspace de análise pós-relatório", "Kanitz completo", "Análise aprofundada e ampliada"]'::jsonb);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  plan_code TEXT NOT NULL REFERENCES public.subscription_plans(code),
  status TEXT NOT NULL DEFAULT 'active', -- active | pending | past_due | canceled
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  abacatepay_customer_id TEXT,
  abacatepay_subscription_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subs_select_own_or_mgr ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));
CREATE POLICY subs_insert_own ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));
CREATE POLICY subs_update_own_or_mgr ON public.subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));

CREATE TRIGGER trg_subs_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invoices
CREATE TABLE public.subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed | refunded | expired
  paid_at TIMESTAMPTZ,
  abacatepay_billing_id TEXT,
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  invoice_url TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_select_own_or_mgr ON public.subscription_invoices FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));
CREATE POLICY inv_insert_mgr ON public.subscription_invoices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));
CREATE POLICY inv_update_mgr ON public.subscription_invoices FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenadora'::app_role));

CREATE TRIGGER trg_inv_updated_at BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_inv_subscription ON public.subscription_invoices(subscription_id);
CREATE INDEX idx_inv_user ON public.subscription_invoices(user_id, created_at DESC);

-- Auto-create PRO subscription on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  IF COALESCE(NEW.raw_user_meta_data->>'signup_source', '') = 'public' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'contabilidade'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.subscriptions (user_id, plan_code, status)
  VALUES (NEW.id, 'pro', 'active')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Backfill existing users with PRO subscription
INSERT INTO public.subscriptions (user_id, plan_code, status)
SELECT u.id, 'pro', 'active'
FROM auth.users u
LEFT JOIN public.subscriptions s ON s.user_id = u.id
WHERE s.id IS NULL;
