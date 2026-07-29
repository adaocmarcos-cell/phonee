ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS data_health_last_push_at timestamptz;

CREATE OR REPLACE FUNCTION public.data_health_weekly_job()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  h jsonb;
  pend int;
  processed int := 0;
  pushed int := 0;
BEGIN
  FOR r IN SELECT id, data_health_last_push_at FROM public.stores WHERE COALESCE(access_blocked, false) = false LOOP
    h := public.sync_data_health_alert(r.id);
    processed := processed + 1;
    pend := COALESCE((h->>'pendentes_total')::int, 0);
    IF pend > 0 AND (r.data_health_last_push_at IS NULL OR r.data_health_last_push_at < now() - interval '7 days') THEN
      PERFORM public.dispatch_push_event(
        r.id,
        'data_health_imei',
        jsonb_build_object('pendentes', pend, 'dias_restantes', (h->>'dias_restantes')::int)
      );
      UPDATE public.stores SET data_health_last_push_at = now() WHERE id = r.id;
      pushed := pushed + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('stores', processed, 'pushed', pushed);
END;
$$;

REVOKE ALL ON FUNCTION public.data_health_weekly_job() FROM public, anon, authenticated;

SELECT cron.unschedule('data-health-imei-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'data-health-imei-daily');

SELECT cron.schedule('data-health-imei-daily', '0 12 * * *', $$SELECT public.data_health_weekly_job();$$);