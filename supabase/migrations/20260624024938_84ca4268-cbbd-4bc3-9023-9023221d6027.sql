DROP FUNCTION IF EXISTS public.mobileplus_stores();

CREATE OR REPLACE FUNCTION public.mobileplus_stores()
 RETURNS TABLE(store_id uuid, store_name text, owner_id uuid, owner_email text, owner_name text, plan_name text, billing_cycle text, subscription_status text, expires_at timestamp with time zone, created_at timestamp with time zone, total_sales numeric, sales_count bigint, avg_ticket numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, s.name, s.owner_id, p.email,
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