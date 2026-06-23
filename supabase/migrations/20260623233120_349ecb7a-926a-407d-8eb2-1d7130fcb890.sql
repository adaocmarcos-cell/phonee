
DROP FUNCTION IF EXISTS public.mobileplus_sales_traffic(int);

CREATE OR REPLACE FUNCTION public.mobileplus_sales_traffic(
  _days int DEFAULT 30,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _store_id uuid DEFAULT NULL,
  _path text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
  v_total bigint; v_unique bigint; v_today bigint;
  v_by_day jsonb; v_by_path jsonb;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_from := COALESCE(_from, now() - (_days || ' days')::interval);
  v_to   := COALESCE(_to, now());

  SELECT count(*) INTO v_total FROM public.page_visits
    WHERE created_at BETWEEN v_from AND v_to
      AND (_store_id IS NULL OR store_id = _store_id)
      AND (_path IS NULL OR _path = '' OR path ILIKE '%' || _path || '%');

  SELECT count(DISTINCT COALESCE(session_id, id::text)) INTO v_unique
    FROM public.page_visits
    WHERE created_at BETWEEN v_from AND v_to
      AND (_store_id IS NULL OR store_id = _store_id)
      AND (_path IS NULL OR _path = '' OR path ILIKE '%' || _path || '%');

  SELECT count(*) INTO v_today FROM public.page_visits
    WHERE created_at >= date_trunc('day', now())
      AND (_store_id IS NULL OR store_id = _store_id)
      AND (_path IS NULL OR _path = '' OR path ILIKE '%' || _path || '%');

  SELECT jsonb_agg(jsonb_build_object('day', d, 'visits', c) ORDER BY d) INTO v_by_day FROM (
    SELECT date_trunc('day', created_at)::date AS d, count(*) AS c
    FROM public.page_visits
    WHERE created_at BETWEEN v_from AND v_to
      AND (_store_id IS NULL OR store_id = _store_id)
      AND (_path IS NULL OR _path = '' OR path ILIKE '%' || _path || '%')
    GROUP BY 1 ORDER BY 1
  ) t;

  SELECT jsonb_agg(jsonb_build_object('path', path, 'visits', c, 'unique_sessions', u) ORDER BY c DESC) INTO v_by_path FROM (
    SELECT path, count(*) AS c, count(DISTINCT COALESCE(session_id, id::text)) AS u
    FROM public.page_visits
    WHERE created_at BETWEEN v_from AND v_to
      AND (_store_id IS NULL OR store_id = _store_id)
      AND (_path IS NULL OR _path = '' OR path ILIKE '%' || _path || '%')
    GROUP BY 1 ORDER BY c DESC LIMIT 30
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'unique_sessions', v_unique,
    'today', v_today,
    'from', v_from,
    'to', v_to,
    'by_day', COALESCE(v_by_day, '[]'::jsonb),
    'by_path', COALESCE(v_by_path, '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.mobileplus_traffic_paths()
RETURNS TABLE(path text, visits bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT path, count(*) AS visits
  FROM public.page_visits
  WHERE public.is_admin_master(auth.uid())
    AND created_at >= now() - interval '180 days'
  GROUP BY 1 ORDER BY 2 DESC LIMIT 200;
$$;
