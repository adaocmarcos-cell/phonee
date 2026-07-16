
CREATE OR REPLACE FUNCTION public.backfill_trial_orphans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
  v_stores_created int := 0;
  v_user_stores_created int := 0;
  v_user_roles_created int := 0;
  v_affected jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF v_caller IS NOT NULL THEN
    SELECT public.has_role(v_caller, 'admin_master'::app_role) INTO v_is_admin;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  WITH missing_stores AS (
    SELECT pt.user_id, pt.email, pt.full_name, pt.whatsapp, pt.instagram,
           pt.store_name, pt.city, pt.state
    FROM public.partner_trials pt
    WHERE pt.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.owner_id = pt.user_id)
  ),
  slugged AS (
    SELECT ms.*,
      COALESCE(
        NULLIF(regexp_replace(
          lower(translate(
            coalesce(ms.store_name, ms.full_name, split_part(ms.email,'@',1), 'loja'),
            'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇ',
            'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUC'
          )),
          '[^a-z0-9]+', '-', 'g'
        ), ''),
        'loja'
      ) AS base_slug
    FROM missing_stores ms
  ),
  inserted AS (
    INSERT INTO public.stores (owner_id, name, slug, email, phone, instagram, address_city, address_uf)
    SELECT
      s.user_id,
      COALESCE(s.store_name, s.full_name, 'Minha Loja'),
      CASE
        WHEN EXISTS (SELECT 1 FROM public.stores st WHERE st.slug = s.base_slug)
          THEN s.base_slug || '-' || substr(md5(random()::text), 1, 4)
        ELSE s.base_slug
      END,
      s.email, s.whatsapp, s.instagram, s.city, s.state
    FROM slugged s
    RETURNING id, owner_id
  )
  SELECT count(*)::int INTO v_stores_created FROM inserted;

  WITH ins AS (
    INSERT INTO public.user_stores (user_id, store_id)
    SELECT DISTINCT s.owner_id, s.id
    FROM public.partner_trials pt
    JOIN public.stores s ON s.owner_id = pt.user_id
    WHERE pt.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_stores us
        WHERE us.user_id = s.owner_id AND us.store_id = s.id
      )
    RETURNING user_id, store_id
  )
  SELECT count(*)::int INTO v_user_stores_created FROM ins;

  WITH ins AS (
    INSERT INTO public.user_roles (user_id, store_id, role)
    SELECT DISTINCT s.owner_id, s.id, 'dono'::app_role
    FROM public.partner_trials pt
    JOIN public.stores s ON s.owner_id = pt.user_id
    WHERE pt.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = s.owner_id AND ur.store_id = s.id AND ur.role = 'dono'
      )
    RETURNING user_id, store_id
  ),
  agg AS (
    SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'store_id', store_id)) AS list,
           count(*)::int AS n
    FROM ins
  )
  SELECT n, COALESCE(list, '[]'::jsonb) INTO v_user_roles_created, v_affected FROM agg;

  v_result := jsonb_build_object(
    'stores_created', v_stores_created,
    'user_stores_created', v_user_stores_created,
    'user_roles_created', v_user_roles_created,
    'affected', v_affected,
    'ran_at', now()
  );

  IF v_stores_created + v_user_stores_created + v_user_roles_created > 0 THEN
    INSERT INTO public.audit_log (user_id, module, screen, action, entity, role, status, new_value)
    VALUES (
      v_caller,
      'admin_master',
      '/phonee/backfill',
      'trial_orphans_backfill',
      'partner_trials',
      CASE WHEN v_caller IS NULL THEN 'system' ELSE 'admin_master' END,
      'concluido',
      v_result
    );
  END IF;

  RETURN v_result;
END;
$$;
