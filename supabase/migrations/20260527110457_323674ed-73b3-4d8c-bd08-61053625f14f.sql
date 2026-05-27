
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone_fixed text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS profile_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, company_name, cnpj, phone, profile_required)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'cnpj', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'signup_source', '') = 'public'
  );

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
