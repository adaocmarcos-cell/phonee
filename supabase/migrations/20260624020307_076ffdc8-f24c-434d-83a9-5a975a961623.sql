
-- Overview excluding demo
CREATE OR REPLACE FUNCTION public.mobileplus_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_demo_store uuid;
  v_demo_user  uuid;
  v_total_stores int; v_active_subs int; v_trialing int; v_total_users int;
  v_mrr numeric; v_avg_ticket numeric; v_new_30d int; v_new_prev_30d int;
  v_growth_pct numeric; v_revenue_30d numeric; v_open_tickets int;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_demo_store FROM public.stores WHERE slug = 'loja-demonstracao-phonee' LIMIT 1;
  SELECT id INTO v_demo_user  FROM public.profiles WHERE email = 'demo@phonee.com.br' LIMIT 1;

  SELECT count(*) INTO v_total_stores FROM public.stores
    WHERE (v_demo_store IS NULL OR id <> v_demo_store);

  SELECT count(DISTINCT store_id) INTO v_active_subs
    FROM public.subscriptions
    WHERE status IN ('active','ativa','trialing','vitalicio')
      AND (v_demo_store IS NULL OR store_id <> v_demo_store);

  SELECT count(DISTINCT store_id) INTO v_trialing
    FROM public.subscriptions
    WHERE status = 'trialing'
      AND (v_demo_store IS NULL OR store_id <> v_demo_store);

  SELECT count(*) INTO v_total_users FROM public.profiles
    WHERE (v_demo_user IS NULL OR id <> v_demo_user);

  SELECT COALESCE(SUM(
    CASE
      WHEN billing_cycle = 'annual'    THEN (amount_cents::numeric / 100.0) / 12.0
      WHEN billing_cycle = 'vitalicio' THEN 0
      ELSE (amount_cents::numeric / 100.0)
    END
  ), 0) INTO v_mrr
  FROM public.subscriptions
  WHERE status IN ('active','ativa','trialing')
    AND (v_demo_store IS NULL OR store_id <> v_demo_store);

  SELECT COALESCE(AVG(total), 0) INTO v_avg_ticket
    FROM public.sales
    WHERE (v_demo_store IS NULL OR store_id <> v_demo_store);

  SELECT count(*) INTO v_new_30d
  FROM public.stores
  WHERE created_at >= now() - interval '30 days'
    AND (v_demo_store IS NULL OR id <> v_demo_store);

  SELECT count(*) INTO v_new_prev_30d
  FROM public.stores
  WHERE created_at >= now() - interval '60 days'
    AND created_at <  now() - interval '30 days'
    AND (v_demo_store IS NULL OR id <> v_demo_store);

  v_growth_pct := CASE WHEN v_new_prev_30d = 0 THEN NULL
                       ELSE round(((v_new_30d - v_new_prev_30d)::numeric / v_new_prev_30d) * 100, 1) END;

  SELECT COALESCE(SUM(total), 0) INTO v_revenue_30d
  FROM public.sales
  WHERE created_at >= now() - interval '30 days'
    AND (v_demo_store IS NULL OR store_id <> v_demo_store);

  SELECT count(*) INTO v_open_tickets
  FROM public.support_tickets
  WHERE status::text IN ('aberto','em_andamento','open')
    AND (v_demo_store IS NULL OR store_id <> v_demo_store);

  RETURN jsonb_build_object(
    'total_stores', v_total_stores,
    'active_subscriptions', v_active_subs,
    'trialing', v_trialing,
    'total_users', v_total_users,
    'mrr_estimate', v_mrr,
    'avg_ticket', v_avg_ticket,
    'new_stores_30d', v_new_30d,
    'new_stores_prev_30d', v_new_prev_30d,
    'growth_pct', v_growth_pct,
    'gmv_30d', v_revenue_30d,
    'open_tickets', v_open_tickets
  );
END $function$;

-- Stores list excluding demo
CREATE OR REPLACE FUNCTION public.mobileplus_stores()
RETURNS TABLE(store_id uuid, store_name text, owner_email text, owner_name text, plan_name text, billing_cycle text, subscription_status text, expires_at timestamp with time zone, created_at timestamp with time zone, total_sales numeric, sales_count bigint, avg_ticket numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    s.id, s.name, p.email,
    COALESCE(NULLIF(p.full_name, ''), p.email),
    pl.name, sub.billing_cycle, sub.status, sub.expires_at, s.created_at,
    COALESCE(agg.total_sales, 0),
    COALESCE(agg.sales_count, 0),
    COALESCE(agg.avg_ticket, 0)
  FROM public.stores s
  LEFT JOIN public.profiles p ON p.id = s.owner_id
  LEFT JOIN LATERAL (
    SELECT sub2.billing_cycle, sub2.status, sub2.expires_at, sub2.plan_id
    FROM public.subscriptions sub2
    WHERE sub2.store_id = s.id
    ORDER BY sub2.created_at DESC LIMIT 1
  ) sub ON true
  LEFT JOIN public.plans pl ON pl.id = sub.plan_id
  LEFT JOIN LATERAL (
    SELECT SUM(sa.total) AS total_sales, COUNT(*) AS sales_count, AVG(sa.total) AS avg_ticket
    FROM public.sales sa WHERE sa.store_id = s.id
  ) agg ON true
  WHERE public.is_admin_master(auth.uid())
    AND s.slug <> 'loja-demonstracao-phonee'
  ORDER BY s.created_at DESC;
$function$;

-- Users list excluding demo user
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
  WITH demo AS (
    SELECT id AS store_id FROM public.stores WHERE slug = 'loja-demonstracao-phonee'
  ),
  user_store_list AS (
    SELECT p.id AS user_id, s.id AS store_id, s.name AS store_name, true AS is_owner
      FROM public.profiles p
      JOIN public.stores s ON s.owner_id = p.id
     WHERE s.slug <> 'loja-demonstracao-phonee'
    UNION
    SELECT us.user_id, s.id, s.name, false
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
    AND p.email <> 'demo@phonee.com.br'
  ORDER BY p.created_at DESC;
$$;

-- Growth excluding demo
CREATE OR REPLACE FUNCTION public.mobileplus_growth()
RETURNS TABLE(month_start date, new_stores bigint, new_subscriptions bigint, gmv numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH months AS (
    SELECT (date_trunc('month', now()) - (n || ' months')::interval)::date AS m
    FROM generate_series(0, 11) n
  ),
  demo AS (
    SELECT id AS store_id FROM public.stores WHERE slug = 'loja-demonstracao-phonee'
  )
  SELECT
    m.m,
    (SELECT COUNT(*) FROM public.stores s
       WHERE date_trunc('month', s.created_at)::date = m.m
         AND s.slug <> 'loja-demonstracao-phonee'),
    (SELECT COUNT(*) FROM public.subscriptions sub
       WHERE date_trunc('month', sub.created_at)::date = m.m
         AND sub.store_id NOT IN (SELECT store_id FROM demo)),
    COALESCE((SELECT SUM(sa.total) FROM public.sales sa
       WHERE date_trunc('month', sa.created_at)::date = m.m
         AND sa.store_id NOT IN (SELECT store_id FROM demo)), 0)
  FROM months m
  WHERE public.is_admin_master(auth.uid())
  ORDER BY m.m;
$function$;
