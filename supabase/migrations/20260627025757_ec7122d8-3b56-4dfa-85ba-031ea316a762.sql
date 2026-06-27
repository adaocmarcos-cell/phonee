
CREATE OR REPLACE FUNCTION public.phonee_user_metrics()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH prod AS (
    SELECT s.owner_id AS user_id, count(pr.id)::bigint AS products
    FROM public.stores s
    LEFT JOIN public.products pr ON pr.store_id = s.id
    WHERE s.slug <> 'loja-demonstracao-phonee'
    GROUP BY s.owner_id
  ),
  storage_agg AS (
    SELECT owner AS user_id, COALESCE(SUM((metadata->>'size')::bigint),0) AS bytes
    FROM storage.objects WHERE owner IS NOT NULL GROUP BY owner
  ),
  sales_agg AS (
    SELECT s.owner_id AS user_id,
      count(sa.id) FILTER (WHERE sa.created_at >= now() - interval '30 days')::bigint AS s30,
      count(sa.id) FILTER (WHERE sa.created_at >= now() - interval '90 days')::bigint AS s90,
      count(sa.id) FILTER (WHERE sa.created_at >= now() - interval '180 days')::bigint AS s180,
      count(sa.id) FILTER (WHERE sa.created_at >= now() - interval '365 days')::bigint AS s365,
      COALESCE(SUM(sa.total),0)::numeric AS revenue_total
    FROM public.stores s
    LEFT JOIN public.sales sa ON sa.store_id = s.id
    WHERE s.slug <> 'loja-demonstracao-phonee'
    GROUP BY s.owner_id
  )
  SELECT jsonb_object_agg(u.uid::text, jsonb_build_object(
    'products', COALESCE(p.products,0),
    'storage_bytes', COALESCE(st.bytes,0),
    'sales_30', COALESCE(sa.s30,0),
    'sales_90', COALESCE(sa.s90,0),
    'sales_180', COALESCE(sa.s180,0),
    'sales_365', COALESCE(sa.s365,0),
    'revenue', COALESCE(sa.revenue_total,0)
  )) INTO v_out
  FROM (SELECT DISTINCT id AS uid FROM public.profiles) u
  LEFT JOIN prod p ON p.user_id = u.uid
  LEFT JOIN storage_agg st ON st.user_id = u.uid
  LEFT JOIN sales_agg sa ON sa.user_id = u.uid;

  RETURN COALESCE(v_out, '{}'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.phonee_user_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phonee_user_metrics() TO authenticated;
