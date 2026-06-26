
CREATE TABLE IF NOT EXISTS public.meta_pixel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('browser','server')),
  event_source_url text,
  value numeric,
  currency text,
  email_hash text,
  phone_hash text,
  fbp text,
  fbc text,
  user_agent text,
  ip text,
  test_event_code text,
  capi_status int,
  capi_response jsonb,
  custom_data jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_pixel_events_created_idx ON public.meta_pixel_events (created_at DESC);
CREATE INDEX IF NOT EXISTS meta_pixel_events_event_idx ON public.meta_pixel_events (event_name);
CREATE INDEX IF NOT EXISTS meta_pixel_events_event_id_idx ON public.meta_pixel_events (event_id);

GRANT SELECT ON public.meta_pixel_events TO authenticated;
GRANT ALL  ON public.meta_pixel_events TO service_role;

ALTER TABLE public.meta_pixel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin master read pixel events"
  ON public.meta_pixel_events FOR SELECT
  TO authenticated
  USING (public.is_admin_master(auth.uid()));

CREATE OR REPLACE FUNCTION public.phonee_pixel_events_overview(_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := now() - (_days || ' days')::interval;
  v_total bigint; v_browser bigint; v_server bigint;
  v_leads bigint; v_purchases bigint; v_revenue numeric;
  v_by_day jsonb; v_by_event jsonb; v_by_path jsonb; v_recent jsonb;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE source = 'browser'),
         count(*) FILTER (WHERE source = 'server'),
         count(*) FILTER (WHERE event_name = 'Lead'),
         count(*) FILTER (WHERE event_name = 'Purchase'),
         COALESCE(SUM(value) FILTER (WHERE event_name = 'Purchase'), 0)
    INTO v_total, v_browser, v_server, v_leads, v_purchases, v_revenue
    FROM public.meta_pixel_events
   WHERE created_at >= v_from;

  SELECT jsonb_agg(jsonb_build_object('day', d, 'total', c, 'browser', b, 'server', s) ORDER BY d)
    INTO v_by_day FROM (
      SELECT date_trunc('day', created_at)::date AS d,
             count(*) AS c,
             count(*) FILTER (WHERE source='browser') AS b,
             count(*) FILTER (WHERE source='server') AS s
        FROM public.meta_pixel_events WHERE created_at >= v_from
       GROUP BY 1
    ) t;

  SELECT jsonb_agg(jsonb_build_object('event_name', event_name, 'count', c) ORDER BY c DESC)
    INTO v_by_event FROM (
      SELECT event_name, count(*) AS c FROM public.meta_pixel_events
       WHERE created_at >= v_from GROUP BY 1
    ) t;

  SELECT jsonb_agg(jsonb_build_object('path', p, 'count', c) ORDER BY c DESC)
    INTO v_by_path FROM (
      SELECT COALESCE(regexp_replace(event_source_url, '^https?://[^/]+', ''), '/') AS p,
             count(*) AS c
        FROM public.meta_pixel_events
       WHERE created_at >= v_from
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 20
    ) t;

  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) INTO v_recent FROM (
    SELECT id, event_name, source, event_source_url, value, currency,
           capi_status, test_event_code, created_at
      FROM public.meta_pixel_events
     ORDER BY created_at DESC LIMIT 50
  ) r;

  RETURN jsonb_build_object(
    'dias', _days,
    'total', v_total,
    'browser', v_browser,
    'server', v_server,
    'leads', v_leads,
    'purchases', v_purchases,
    'revenue', v_revenue,
    'by_day', COALESCE(v_by_day, '[]'::jsonb),
    'by_event', COALESCE(v_by_event, '[]'::jsonb),
    'by_path', COALESCE(v_by_path, '[]'::jsonb),
    'recent', COALESCE(v_recent, '[]'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.phonee_pixel_events_overview(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_pixel_events_overview(int) TO authenticated;
