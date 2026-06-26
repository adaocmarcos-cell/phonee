
ALTER TABLE public.meta_pixel_events
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS landing_path text;

CREATE INDEX IF NOT EXISTS meta_pixel_events_utm_source_idx ON public.meta_pixel_events (utm_source);
CREATE INDEX IF NOT EXISTS meta_pixel_events_utm_campaign_idx ON public.meta_pixel_events (utm_campaign);

CREATE OR REPLACE FUNCTION public.phonee_pixel_events_overview(_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := now() - (_days || ' days')::interval;
  v_total bigint; v_browser bigint; v_server bigint;
  v_leads bigint; v_purchases bigint; v_revenue numeric;
  v_by_day jsonb; v_by_event jsonb; v_by_path jsonb; v_recent jsonb;
  v_by_source jsonb; v_by_medium jsonb; v_by_campaign jsonb; v_attribution jsonb;
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

  SELECT jsonb_agg(jsonb_build_object(
      'utm_source', utm_source, 'total', c, 'leads', leads, 'purchases', purchases, 'revenue', revenue
    ) ORDER BY c DESC) INTO v_by_source FROM (
      SELECT COALESCE(NULLIF(utm_source,''), '(direto)') AS utm_source,
             count(*) AS c,
             count(*) FILTER (WHERE event_name = 'Lead') AS leads,
             count(*) FILTER (WHERE event_name = 'Purchase') AS purchases,
             COALESCE(SUM(value) FILTER (WHERE event_name='Purchase'),0) AS revenue
        FROM public.meta_pixel_events
       WHERE created_at >= v_from
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 25
    ) t;

  SELECT jsonb_agg(jsonb_build_object(
      'utm_medium', utm_medium, 'total', c, 'leads', leads, 'purchases', purchases, 'revenue', revenue
    ) ORDER BY c DESC) INTO v_by_medium FROM (
      SELECT COALESCE(NULLIF(utm_medium,''), '(none)') AS utm_medium,
             count(*) AS c,
             count(*) FILTER (WHERE event_name = 'Lead') AS leads,
             count(*) FILTER (WHERE event_name = 'Purchase') AS purchases,
             COALESCE(SUM(value) FILTER (WHERE event_name='Purchase'),0) AS revenue
        FROM public.meta_pixel_events
       WHERE created_at >= v_from
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 25
    ) t;

  SELECT jsonb_agg(jsonb_build_object(
      'utm_campaign', utm_campaign, 'total', c, 'leads', leads, 'purchases', purchases, 'revenue', revenue
    ) ORDER BY c DESC) INTO v_by_campaign FROM (
      SELECT COALESCE(NULLIF(utm_campaign,''), '(none)') AS utm_campaign,
             count(*) AS c,
             count(*) FILTER (WHERE event_name = 'Lead') AS leads,
             count(*) FILTER (WHERE event_name = 'Purchase') AS purchases,
             COALESCE(SUM(value) FILTER (WHERE event_name='Purchase'),0) AS revenue
        FROM public.meta_pixel_events
       WHERE created_at >= v_from
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 25
    ) t;

  SELECT jsonb_agg(jsonb_build_object(
      'utm_source', utm_source, 'utm_medium', utm_medium, 'utm_campaign', utm_campaign,
      'total', c, 'leads', leads, 'purchases', purchases, 'revenue', revenue
    ) ORDER BY c DESC) INTO v_attribution FROM (
      SELECT COALESCE(NULLIF(utm_source,''), '(direto)') AS utm_source,
             COALESCE(NULLIF(utm_medium,''), '(none)') AS utm_medium,
             COALESCE(NULLIF(utm_campaign,''), '(none)') AS utm_campaign,
             count(*) AS c,
             count(*) FILTER (WHERE event_name = 'Lead') AS leads,
             count(*) FILTER (WHERE event_name = 'Purchase') AS purchases,
             COALESCE(SUM(value) FILTER (WHERE event_name='Purchase'),0) AS revenue
        FROM public.meta_pixel_events
       WHERE created_at >= v_from
       GROUP BY 1,2,3 ORDER BY count(*) DESC LIMIT 50
    ) t;

  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) INTO v_recent FROM (
    SELECT id, event_name, source, event_source_url, value, currency,
           capi_status, test_event_code, created_at,
           utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer
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
    'by_utm_source', COALESCE(v_by_source, '[]'::jsonb),
    'by_utm_medium', COALESCE(v_by_medium, '[]'::jsonb),
    'by_utm_campaign', COALESCE(v_by_campaign, '[]'::jsonb),
    'attribution', COALESCE(v_attribution, '[]'::jsonb),
    'recent', COALESCE(v_recent, '[]'::jsonb)
  );
END $function$;
