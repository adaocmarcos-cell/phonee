
-- Auditoria de permissões: lista usuários com problemas de vínculo
CREATE OR REPLACE FUNCTION public.phonee_permission_audit()
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  has_store boolean,
  has_role boolean,
  is_admin_master boolean,
  issue text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    (p.full_name)::text,
    u.created_at,
    EXISTS (SELECT 1 FROM public.user_stores us WHERE us.user_id = u.id) AS has_store,
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id) AS has_role,
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin_master') AS is_admin_master,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin_master')
        THEN 'ok_admin_master'
      WHEN NOT EXISTS (SELECT 1 FROM public.user_stores us WHERE us.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id)
        THEN 'sem_loja_e_sem_cargo'
      WHEN NOT EXISTS (SELECT 1 FROM public.user_stores us WHERE us.user_id = u.id)
        THEN 'sem_vinculo_de_loja'
      WHEN NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id)
        THEN 'sem_cargo_atribuido'
      ELSE 'ok'
    END AS issue
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY
    (NOT EXISTS (SELECT 1 FROM public.user_stores us WHERE us.user_id = u.id)) DESC,
    (NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id)) DESC,
    u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.phonee_permission_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_permission_audit() TO authenticated;

-- Lista todos os vínculos de uma loja (usuário + cargos + owner)
CREATE OR REPLACE FUNCTION public.phonee_store_bindings(_store_id uuid)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  is_owner boolean,
  roles app_role[]
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH linked AS (
    SELECT us.user_id FROM public.user_stores us WHERE us.store_id = _store_id
    UNION
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.store_id = _store_id
    UNION
    SELECT s.owner_id FROM public.stores s WHERE s.id = _store_id AND s.owner_id IS NOT NULL
  )
  SELECT
    u.id,
    u.email::text,
    (p.full_name)::text,
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = _store_id AND s.owner_id = u.id) AS is_owner,
    COALESCE(
      (SELECT array_agg(ur.role ORDER BY ur.role)
         FROM public.user_roles ur
        WHERE ur.user_id = u.id AND ur.store_id = _store_id),
      ARRAY[]::app_role[]
    ) AS roles
  FROM linked l
  JOIN auth.users u ON u.id = l.user_id
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY p.full_name NULLS LAST, u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.phonee_store_bindings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_store_bindings(uuid) TO authenticated;

-- Vincular usuário à loja com cargo (admin master, manual)
CREATE OR REPLACE FUNCTION public.phonee_bind_user_to_store(
  _user_id uuid,
  _store_id uuid,
  _role app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _role = 'admin_master' THEN
    RAISE EXCEPTION 'use_admin_masters_screen_for_master_role';
  END IF;
  IF _user_id IS NULL OR _store_id IS NULL OR _role IS NULL THEN
    RAISE EXCEPTION 'missing_parameters';
  END IF;

  INSERT INTO public.user_stores (user_id, store_id)
  VALUES (_user_id, _store_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, store_id, role)
  VALUES (_user_id, _store_id, _role)
  ON CONFLICT (user_id, store_id, role) DO NOTHING;

  INSERT INTO public.audit_log (actor_id, action, module, entity_type, entity_id, details)
  VALUES (auth.uid(), 'bind_user', 'admin_master', 'user_stores', _user_id,
          jsonb_build_object('store_id', _store_id, 'role', _role));
END;
$$;

REVOKE ALL ON FUNCTION public.phonee_bind_user_to_store(uuid, uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_bind_user_to_store(uuid, uuid, app_role) TO authenticated;

-- Substituir todos os cargos do usuário nessa loja por _role
CREATE OR REPLACE FUNCTION public.phonee_set_user_role(
  _user_id uuid,
  _store_id uuid,
  _role app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _role = 'admin_master' THEN
    RAISE EXCEPTION 'use_admin_masters_screen_for_master_role';
  END IF;

  DELETE FROM public.user_roles
   WHERE user_id = _user_id AND store_id = _store_id;

  INSERT INTO public.user_roles (user_id, store_id, role)
  VALUES (_user_id, _store_id, _role);

  INSERT INTO public.user_stores (user_id, store_id)
  VALUES (_user_id, _store_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_log (actor_id, action, module, entity_type, entity_id, details)
  VALUES (auth.uid(), 'set_role', 'admin_master', 'user_roles', _user_id,
          jsonb_build_object('store_id', _store_id, 'role', _role));
END;
$$;

REVOKE ALL ON FUNCTION public.phonee_set_user_role(uuid, uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_set_user_role(uuid, uuid, app_role) TO authenticated;

-- Desvincular usuário da loja (não afeta owner)
CREATE OR REPLACE FUNCTION public.phonee_unbind_user_from_store(
  _user_id uuid,
  _store_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT owner_id INTO v_owner FROM public.stores WHERE id = _store_id;
  IF v_owner = _user_id THEN
    RAISE EXCEPTION 'cannot_unbind_store_owner';
  END IF;

  DELETE FROM public.user_roles  WHERE user_id = _user_id AND store_id = _store_id;
  DELETE FROM public.user_stores WHERE user_id = _user_id AND store_id = _store_id;

  INSERT INTO public.audit_log (actor_id, action, module, entity_type, entity_id, details)
  VALUES (auth.uid(), 'unbind_user', 'admin_master', 'user_stores', _user_id,
          jsonb_build_object('store_id', _store_id));
END;
$$;

REVOKE ALL ON FUNCTION public.phonee_unbind_user_from_store(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_unbind_user_from_store(uuid, uuid) TO authenticated;
