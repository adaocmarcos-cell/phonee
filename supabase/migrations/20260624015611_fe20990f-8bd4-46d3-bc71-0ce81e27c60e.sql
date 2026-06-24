
DROP FUNCTION IF EXISTS public.mobileplus_users();

CREATE OR REPLACE FUNCTION public.mobileplus_users()
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
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
AS $$
  WITH user_store_list AS (
    SELECT p.id AS user_id, s.id AS store_id, s.name AS store_name, true AS is_owner
      FROM public.profiles p
      JOIN public.stores s ON s.owner_id = p.id
    UNION
    SELECT us.user_id, s.id, s.name, false
      FROM public.user_stores us
      JOIN public.stores s ON s.id = us.store_id
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
    p.id,
    p.email,
    p.full_name,
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
  ORDER BY p.created_at DESC;
$$;
