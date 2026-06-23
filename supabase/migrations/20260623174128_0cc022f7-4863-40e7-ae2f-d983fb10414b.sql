
CREATE OR REPLACE FUNCTION public.mobileplus_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_stores int; v_active_subs int; v_trialing int; v_total_users int;
  v_mrr numeric; v_avg_ticket numeric; v_new_30d int; v_new_prev_30d int;
  v_growth_pct numeric; v_revenue_30d numeric; v_open_tickets int;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_total_stores FROM public.stores;
  SELECT count(DISTINCT store_id) INTO v_active_subs
    FROM public.subscriptions WHERE status IN ('active','ativa','trialing','vitalicio');
  SELECT count(DISTINCT store_id) INTO v_trialing
    FROM public.subscriptions WHERE status = 'trialing';
  SELECT count(*) INTO v_total_users FROM public.profiles;

  SELECT COALESCE(SUM(
    CASE
      WHEN billing_cycle = 'annual'    THEN (amount_cents::numeric / 100.0) / 12.0
      WHEN billing_cycle = 'vitalicio' THEN 0
      ELSE (amount_cents::numeric / 100.0)
    END
  ), 0) INTO v_mrr
  FROM public.subscriptions
  WHERE status IN ('active','ativa','trialing');

  SELECT COALESCE(AVG(total), 0) INTO v_avg_ticket FROM public.sales;

  SELECT count(*) INTO v_new_30d
  FROM public.stores WHERE created_at >= now() - interval '30 days';
  SELECT count(*) INTO v_new_prev_30d
  FROM public.stores WHERE created_at >= now() - interval '60 days'
                       AND created_at <  now() - interval '30 days';

  v_growth_pct := CASE WHEN v_new_prev_30d = 0 THEN NULL
                       ELSE round(((v_new_30d - v_new_prev_30d)::numeric / v_new_prev_30d) * 100, 1) END;

  SELECT COALESCE(SUM(total), 0) INTO v_revenue_30d
  FROM public.sales WHERE created_at >= now() - interval '30 days';

  SELECT count(*) INTO v_open_tickets
  FROM public.support_tickets WHERE status::text IN ('aberto','em_andamento','open');

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
END $$;
GRANT EXECUTE ON FUNCTION public.mobileplus_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.mobileplus_stores()
RETURNS TABLE(
  store_id uuid, store_name text, owner_email text, owner_name text,
  plan_name text, billing_cycle text, subscription_status text,
  expires_at timestamptz, created_at timestamptz,
  total_sales numeric, sales_count bigint, avg_ticket numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  ORDER BY s.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.mobileplus_stores() TO authenticated;

CREATE OR REPLACE FUNCTION public.mobileplus_users()
RETURNS TABLE(
  user_id uuid, email text, full_name text,
  created_at timestamptz, stores_count bigint, roles text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.email, p.full_name, p.created_at,
    (SELECT COUNT(*) FROM public.user_stores us WHERE us.user_id = p.id)
      + (SELECT COUNT(*) FROM public.stores st WHERE st.owner_id = p.id),
    ARRAY(SELECT DISTINCT ur.role::text FROM public.user_roles ur WHERE ur.user_id = p.id)
  FROM public.profiles p
  WHERE public.is_admin_master(auth.uid())
  ORDER BY p.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.mobileplus_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.mobileplus_growth()
RETURNS TABLE(month_start date, new_stores bigint, new_subscriptions bigint, gmv numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH months AS (
    SELECT (date_trunc('month', now()) - (n || ' months')::interval)::date AS m
    FROM generate_series(0, 11) n
  )
  SELECT
    m.m,
    (SELECT COUNT(*) FROM public.stores s
       WHERE date_trunc('month', s.created_at)::date = m.m),
    (SELECT COUNT(*) FROM public.subscriptions sub
       WHERE date_trunc('month', sub.created_at)::date = m.m),
    COALESCE((SELECT SUM(sa.total) FROM public.sales sa
       WHERE date_trunc('month', sa.created_at)::date = m.m), 0)
  FROM months m
  WHERE public.is_admin_master(auth.uid())
  ORDER BY m.m;
$$;
GRANT EXECUTE ON FUNCTION public.mobileplus_growth() TO authenticated;
