CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Auto-cadastro público: atribui papel 'contabilidade'
  IF COALESCE(NEW.raw_user_meta_data->>'signup_source', '') = 'public' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'contabilidade'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;