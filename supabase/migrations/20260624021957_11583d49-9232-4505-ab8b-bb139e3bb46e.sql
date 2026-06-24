
CREATE TABLE IF NOT EXISTS public.ai_gateway_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  mode text NOT NULL DEFAULT 'lovable' CHECK (mode IN ('lovable','gcp')),
  gcp_endpoint text DEFAULT 'https://generativelanguage.googleapis.com/v1beta',
  default_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  gcp_model text NOT NULL DEFAULT 'gemini-2.5-flash',
  webhook_signature_enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.ai_gateway_config (id) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.ai_gateway_config TO authenticated;
GRANT ALL ON public.ai_gateway_config TO service_role;

ALTER TABLE public.ai_gateway_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor IA can read gateway config"
  ON public.ai_gateway_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::public.app_role)
      OR public.has_role(auth.uid(), 'coordenadora'::public.app_role));

CREATE POLICY "Gestor IA can update gateway config"
  ON public.ai_gateway_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::public.app_role));
