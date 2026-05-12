
ALTER TABLE public.email_brand_settings
  ADD COLUMN IF NOT EXISTS logo_width integer NOT NULL DEFAULT 64,
  ADD COLUMN IF NOT EXISTS logo_height integer NOT NULL DEFAULT 64,
  ADD COLUMN IF NOT EXISTS logo_radius integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS logo_align text NOT NULL DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS logo_object_fit text NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS logo_show boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS logo_padding integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS logo_bg_color text NOT NULL DEFAULT 'transparent';

DO $$ BEGIN
  CREATE POLICY "Gestor manage email-assets insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'email-assets' AND (
        public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Gestor manage email-assets update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'email-assets' AND (
        public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Gestor manage email-assets delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'email-assets' AND (
        public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenadora')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
