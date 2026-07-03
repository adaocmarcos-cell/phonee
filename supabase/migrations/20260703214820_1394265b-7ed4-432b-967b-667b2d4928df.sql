
DROP FUNCTION IF EXISTS public.phonee_users();

CREATE OR REPLACE FUNCTION public.phonee_users()
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  phone text,
  instagram text,
  created_at timestamp with time zone,
  stores_count bigint,
  roles text[],
  stores jsonb,
  plan_name text,
  subscription_status text,
  is_admin_master boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH user_store_list AS (
    SELECT p.id AS user_id, s.id AS store_id, s.name AS store_name, s.instagram, s.created_at AS store_created_at, true AS is_owner
      FROM public.profiles p
      JOIN public.stores s ON s.owner_id = p.id
     WHERE s.slug <> 'loja-demonstracao-phonee'
    UNION
    SELECT us.user_id, s.id, s.name, s.instagram, s.created_at, false
      FROM public.user_stores us
      JOIN public.stores s ON s.id = us.store_id
     WHERE s.slug <> 'loja-demonstracao-phonee'
  ),
  latest_sub AS (
    SELECT DISTINCT ON (sub.store_id)
      sub.store_id, sub.status, pl.name AS plan_name, sub.created_at
    FROM public.subscriptions sub
    LEFT JOIN public.plans pl ON pl.id = sub.plan_id
    WHERE sub.store_id IS NOT NULL
    ORDER BY sub.store_id, sub.created_at DESC
  )
  SELECT
    p.id, p.email, p.full_name, p.phone,
    (
      SELECT usl.instagram FROM user_store_list usl
      WHERE usl.user_id = p.id AND usl.instagram IS NOT NULL AND btrim(usl.instagram) <> ''
      ORDER BY usl.is_owner DESC, usl.store_created_at ASC
      LIMIT 1
    ),
    p.created_at,
    (SELECT COUNT(DISTINCT store_id) FROM user_store_list usl WHERE usl.user_id = p.id),
    ARRAY(SELECT DISTINCT ur.role::text FROM public.user_roles ur WHERE ur.user_id = p.id),
    COALESCE(
      (SELECT jsonb_agg(DISTINCT jsonb_build_object('id', usl.store_id, 'name', usl.store_name, 'is_owner', usl.is_owner))
         FROM user_store_list usl WHERE usl.user_id = p.id),
      '[]'::jsonb
    ),
    (
      SELECT ls.plan_name FROM user_store_list usl
      JOIN latest_sub ls ON ls.store_id = usl.store_id
      WHERE usl.user_id = p.id AND usl.is_owner = true
      ORDER BY ls.created_at DESC LIMIT 1
    ),
    (
      SELECT ls.status FROM user_store_list usl
      JOIN latest_sub ls ON ls.store_id = usl.store_id
      WHERE usl.user_id = p.id AND usl.is_owner = true
      ORDER BY ls.created_at DESC LIMIT 1
    ),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin_master')
  FROM public.profiles p
  WHERE public.is_admin_master(auth.uid())
    AND p.email <> 'demo@phonee.com.br'
  ORDER BY p.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.phonee_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_users() TO authenticated;
