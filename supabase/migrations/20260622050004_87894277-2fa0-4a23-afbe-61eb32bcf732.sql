
DO $$
DECLARE
  v_user_id uuid;
  v_store_id uuid;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM auth.users WHERE email='adaocmarcos@gmail.com';
  IF v_existing IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      'adaocmarcos@gmail.com', crypt('Mobile-771993', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Adão Marcos"}'::jsonb,
      false, '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'adaocmarcos@gmail.com', 'email_verified', true),
      'email', v_user_id::text, now(), now(), now());
  ELSE
    v_user_id := v_existing;
    UPDATE auth.users
      SET encrypted_password = crypt('Mobile-771993', gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (v_user_id, 'Adão Marcos', 'adaocmarcos@gmail.com')
  ON CONFLICT (id) DO UPDATE SET full_name=EXCLUDED.full_name, email=EXCLUDED.email;

  SELECT id INTO v_store_id FROM public.stores WHERE owner_id = v_user_id LIMIT 1;
  IF v_store_id IS NULL THEN
    v_store_id := gen_random_uuid();
    INSERT INTO public.stores (id, name, slug, owner_id)
    VALUES (v_store_id, 'Loja Master', 'loja-master-' || substr(v_user_id::text,1,8), v_user_id);
  END IF;

  INSERT INTO public.user_stores (user_id, store_id)
  VALUES (v_user_id, v_store_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, store_id, role)
  VALUES (v_user_id, v_store_id, 'dono')
  ON CONFLICT DO NOTHING;
END $$;
