UPDATE auth.users
SET email = 'contabilidade@empresa.com.br',
    raw_user_meta_data = COALESCE(raw_user_meta_data,'{}'::jsonb) || jsonb_build_object('email','contabilidade@empresa.com.br')
WHERE email = 'empresa@empresa.com.br';

UPDATE auth.identities
SET identity_data = COALESCE(identity_data,'{}'::jsonb) || jsonb_build_object('email','contabilidade@empresa.com.br')
WHERE identity_data->>'email' = 'empresa@empresa.com.br';