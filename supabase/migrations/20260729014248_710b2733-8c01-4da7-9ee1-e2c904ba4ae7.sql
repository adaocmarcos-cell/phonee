CREATE OR REPLACE FUNCTION public.store_data_health(_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_sem_imei int;
  v_multi int;
  v_pend int;
  v_start timestamptz;
  v_days int;
  v_done timestamptz;
  v_dias_restantes int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.is_admin_master(auth.uid())
          OR EXISTS (SELECT 1 FROM public.my_stores(auth.uid()) s WHERE s = _store_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) FILTER (WHERE true),
         count(*) FILTER (WHERE imei IS NULL OR btrim(imei) = ''),
         count(*) FILTER (WHERE stock_current > 1)
    INTO v_total, v_sem_imei, v_multi
  FROM public.products
  WHERE store_id = _store_id AND item_kind = 'aparelho' AND stock_current > 0;

  SELECT count(*) INTO v_pend
  FROM public.products
  WHERE store_id = _store_id AND item_kind = 'aparelho' AND stock_current > 0
    AND (imei IS NULL OR btrim(imei) = '' OR stock_current > 1);

  SELECT COALESCE(data_health_started_at, created_at),
         COALESCE(data_health_deadline_custom, data_health_deadline_days, 30),
         data_health_done_at
    INTO v_start, v_days, v_done
  FROM public.stores WHERE id = _store_id;

  v_dias_restantes := GREATEST(0, EXTRACT(day FROM (COALESCE(v_start, now()) + make_interval(days => v_days) - now()))::int);

  RETURN jsonb_build_object(
    'aparelhos_total', COALESCE(v_total, 0),
    'aparelhos_sem_imei', COALESCE(v_sem_imei, 0),
    'seminovos_multi_unidade', COALESCE(v_multi, 0),
    'pendentes_total', COALESCE(v_pend, 0),
    'regularizados', GREATEST(0, COALESCE(v_total, 0) - COALESCE(v_pend, 0)),
    'pct_completo', CASE WHEN COALESCE(v_total, 0) = 0 THEN 100
                         ELSE round(((v_total - v_pend)::numeric / v_total) * 100, 1) END,
    'prazo_em_dias', v_days,
    'dias_restantes', v_dias_restantes,
    'vencido', (COALESCE(v_start, now()) + make_interval(days => v_days)) < now(),
    'concluido_em', v_done
  );
END;
$$;

REVOKE ALL ON FUNCTION public.store_data_health(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.store_data_health(uuid) TO authenticated;