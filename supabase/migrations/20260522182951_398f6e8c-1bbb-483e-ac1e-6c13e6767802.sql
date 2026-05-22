DO $mig$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'contabilidade1000@contabil.com.br';
  IF v_uid IS NOT NULL THEN
    RAISE NOTICE 'User already exists: %', v_uid;
    RETURN;
  END IF;
  v_uid := gen_random_uuid();
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', 'contabilidade1000@contabil.com.br', crypt('Contabil@150213', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Contabilidade"}'::jsonb, now(), now(), '', '', '', '');
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, jsonb_build_object('sub', v_uid::text, 'email', 'contabilidade1000@contabil.com.br', 'email_verified', true), 'email', v_uid::text, now(), now(), now());
  INSERT INTO public.profiles (user_id, full_name) VALUES (v_uid, 'Contabilidade') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'contabilidade'::public.app_role) ON CONFLICT DO NOTHING;
END $mig$;