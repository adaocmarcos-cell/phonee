
-- 1) Consulta unificada do audit_log
CREATE OR REPLACE FUNCTION public.phonee_audit_log_search(
  _store_id uuid DEFAULT NULL,
  _actor_id uuid DEFAULT NULL,
  _action text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  store_id uuid,
  store_name text,
  actor_id uuid,
  actor_email text,
  actor_name text,
  target_id uuid,
  target_email text,
  target_name text,
  action text,
  entity text,
  entity_id uuid,
  module text,
  screen text,
  status text,
  old_value jsonb,
  new_value jsonb,
  details jsonb
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    a.id, a.created_at, a.store_id, s.name,
    a.user_id, pa.email, pa.full_name,
    a.entity_id,
    pt.email, pt.full_name,
    a.action, a.entity, a.entity_id, a.module, a.screen, a.status,
    a.old_value, a.new_value, a.details
  FROM public.audit_log a
  LEFT JOIN public.stores s ON s.id = a.store_id
  LEFT JOIN public.profiles pa ON pa.id = a.user_id
  LEFT JOIN public.profiles pt ON pt.id = a.entity_id
  WHERE public.is_admin_master(auth.uid())
    AND (_store_id IS NULL OR a.store_id = _store_id)
    AND (_actor_id IS NULL OR a.user_id = _actor_id)
    AND (_action IS NULL OR a.action = _action)
    AND (_from IS NULL OR a.created_at >= _from)
    AND (_to   IS NULL OR a.created_at <= _to)
  ORDER BY a.created_at DESC
  LIMIT GREATEST(_limit, 1)
  OFFSET GREATEST(_offset, 0);
$$;
GRANT EXECUTE ON FUNCTION public.phonee_audit_log_search(uuid,uuid,text,timestamptz,timestamptz,int,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.phonee_audit_log_actions()
RETURNS TABLE (action text, qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.action, count(*)
  FROM public.audit_log a
  WHERE public.is_admin_master(auth.uid())
  GROUP BY a.action
  ORDER BY count(*) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.phonee_audit_log_actions() TO authenticated;

-- 2) Validar atribuição de cargo
CREATE OR REPLACE FUNCTION public.phonee_validate_role_assignment(
  _user_id uuid,
  _store_id uuid,
  _role app_role
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exists boolean;
  v_owner uuid;
  v_already boolean;
BEGIN
  IF NOT (public.is_owner(auth.uid(), _store_id)
    OR public.has_role(auth.uid(), _store_id, 'gerente'::app_role)
    OR public.is_admin_master(auth.uid())) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sem permissão para gerenciar esta loja');
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuário não existe na base');
  END IF;

  IF _role = 'admin_master' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Admin Master é gerenciado em outra tela');
  END IF;

  IF _role = 'administrador' AND NOT public.is_admin_master(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Somente Admin Master pode atribuir o cargo Administrador');
  END IF;

  IF _role = 'dono' THEN
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = _store_id;
    IF v_owner IS NOT NULL AND v_owner <> _user_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'A loja já possui dono. Remova o dono atual antes de atribuir outro.');
    END IF;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.store_id = _store_id AND ur.role = _role
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuário já possui esse cargo nesta loja');
  END IF;

  RETURN jsonb_build_object('ok', true, 'reason', null);
END;
$$;
GRANT EXECUTE ON FUNCTION public.phonee_validate_role_assignment(uuid, uuid, app_role) TO authenticated;

-- 3) Pré-validação em lote (emails)
CREATE OR REPLACE FUNCTION public.phonee_bulk_validate_bindings(
  _store_id uuid,
  _rows jsonb
) RETURNS TABLE (
  email text,
  role text,
  user_id uuid,
  status text,
  reason text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb;
  v_email text;
  v_role text;
  v_user_id uuid;
  v_validation jsonb;
BEGIN
  IF NOT (public.is_owner(auth.uid(), _store_id)
    OR public.has_role(auth.uid(), _store_id, 'gerente'::app_role)
    OR public.is_admin_master(auth.uid())) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  FOR r IN SELECT jsonb_array_elements(_rows) LOOP
    v_email := lower(trim(coalesce(r->>'email', '')));
    v_role := lower(trim(coalesce(r->>'role', '')));

    IF v_email = '' THEN
      email := ''; role := v_role; user_id := NULL;
      status := 'invalid_row'; reason := 'E-mail vazio';
      RETURN NEXT; CONTINUE;
    END IF;

    IF v_role NOT IN ('dono','gerente','vendedor','estoquista','administrador','financeiro','tecnico','atendimento') THEN
      email := v_email; role := v_role; user_id := NULL;
      status := 'invalid_role'; reason := 'Cargo inválido';
      RETURN NEXT; CONTINUE;
    END IF;

    SELECT p.id INTO v_user_id
    FROM public.profiles p
    WHERE lower(p.email) = v_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
      email := v_email; role := v_role; user_id := NULL;
      status := 'user_not_found'; reason := 'Nenhum usuário com esse e-mail';
      RETURN NEXT; CONTINUE;
    END IF;

    v_validation := public.phonee_validate_role_assignment(v_user_id, _store_id, v_role::app_role);
    IF NOT (v_validation->>'ok')::boolean THEN
      email := v_email; role := v_role; user_id := v_user_id;
      status := 'blocked'; reason := v_validation->>'reason';
      RETURN NEXT; CONTINUE;
    END IF;

    email := v_email; role := v_role; user_id := v_user_id;
    status := 'ok'; reason := NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.phonee_bulk_validate_bindings(uuid, jsonb) TO authenticated;

-- 4) Aplicar em lote — ignora os não-OK
CREATE OR REPLACE FUNCTION public.phonee_bulk_bind_users(
  _store_id uuid,
  _rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  v_inserted int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.is_owner(auth.uid(), _store_id)
    OR public.has_role(auth.uid(), _store_id, 'gerente'::app_role)
    OR public.is_admin_master(auth.uid())) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  FOR v IN SELECT * FROM public.phonee_bulk_validate_bindings(_store_id, _rows) LOOP
    IF (v->>'status') = 'ok' THEN
      BEGIN
        INSERT INTO public.user_stores(user_id, store_id)
        VALUES ((v->>'user_id')::uuid, _store_id)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.user_roles(user_id, store_id, role)
        VALUES ((v->>'user_id')::uuid, _store_id, (v->>'role')::app_role)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.audit_log(store_id, user_id, action, entity, entity_id, module, new_value, details)
        VALUES (_store_id, auth.uid(), 'bulk_bind_user', 'user_roles', (v->>'user_id')::uuid, 'vinculos',
          jsonb_build_object('role', v->>'role'),
          jsonb_build_object('email', v->>'email', 'role', v->>'role'));

        v_inserted := v_inserted + 1;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('email', v->>'email', 'error', SQLERRM));
      END;
    ELSE
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'email', v->>'email', 'status', v->>'status', 'reason', v->>'reason'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;
GRANT EXECUTE ON FUNCTION public.phonee_bulk_bind_users(uuid, jsonb) TO authenticated;
