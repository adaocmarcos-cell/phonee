CREATE OR REPLACE FUNCTION public.reconcile_stock(_store_id uuid)
RETURNS TABLE (
  product_id uuid,
  name text,
  sku text,
  item_kind text,
  stock_current numeric,
  ledger_balance numeric,
  difference numeric,
  last_movement_at timestamptz,
  last_movement_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_mov AS (
    SELECT DISTINCT ON (m.product_id)
           m.product_id, m.balance_after, m.occurred_at, m.type
    FROM public.stock_movements m
    WHERE m.store_id = _store_id
    ORDER BY m.product_id, m.occurred_at DESC, m.created_at DESC
  )
  SELECT p.id,
         p.name,
         p.sku,
         p.item_kind::text,
         COALESCE(p.stock_current, 0)::numeric,
         COALESCE(l.balance_after, 0)::numeric,
         (COALESCE(p.stock_current, 0) - COALESCE(l.balance_after, 0))::numeric,
         l.occurred_at,
         l.type
  FROM public.products p
  LEFT JOIN last_mov l ON l.product_id = p.id
  WHERE p.store_id = _store_id
    AND COALESCE(p.stock_current, 0) <> COALESCE(l.balance_after, 0)
  ORDER BY abs(COALESCE(p.stock_current, 0) - COALESCE(l.balance_after, 0)) DESC, p.name;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stock(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_stock(uuid) TO authenticated, service_role;

-- Rotina que reaproveita a MESMA função do relatório
CREATE OR REPLACE FUNCTION public.sync_stock_reconcile_alert(_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_sum numeric;
  v_alert_id uuid;
BEGIN
  SELECT count(*), COALESCE(sum(abs(r.difference)), 0)
    INTO v_count, v_sum
  FROM public.reconcile_stock(_store_id) r;

  SELECT id INTO v_alert_id
  FROM public.alerts
  WHERE store_id = _store_id AND type = 'stock_reconcile' AND status = 'open'
  ORDER BY created_at DESC LIMIT 1;

  IF v_count = 0 THEN
    IF v_alert_id IS NOT NULL THEN
      UPDATE public.alerts
         SET status = 'resolved', resolved_at = now(), resolution_kind = 'auto',
             resolution_note = 'Reconciliação sem divergências'
       WHERE id = v_alert_id;
    END IF;
    RETURN jsonb_build_object('divergentes', 0, 'alert', 'resolved');
  END IF;

  IF v_alert_id IS NULL THEN
    INSERT INTO public.alerts (store_id, type, severity, title, message, link, metadata)
    VALUES (_store_id, 'stock_reconcile',
            CASE WHEN v_count > 20 THEN 'danger' ELSE 'warning' END::alert_severity,
            'Divergência de estoque x histórico',
            v_count || ' produto(s) com saldo diferente do livro-razão (diferença total de ' || v_sum || ' un.).',
            '/painel/estoque/relatorios?tab=reconciliacao',
            jsonb_build_object('divergentes', v_count, 'diferenca_total', v_sum, 'checked_at', now()))
    RETURNING id INTO v_alert_id;
  ELSE
    UPDATE public.alerts
       SET severity = CASE WHEN v_count > 20 THEN 'danger' ELSE 'warning' END::alert_severity,
           message = v_count || ' produto(s) com saldo diferente do livro-razão (diferença total de ' || v_sum || ' un.).',
           metadata = jsonb_build_object('divergentes', v_count, 'diferenca_total', v_sum, 'checked_at', now())
     WHERE id = v_alert_id;
  END IF;

  RETURN jsonb_build_object('divergentes', v_count, 'diferenca_total', v_sum, 'alert', 'open');
END;
$$;

REVOKE ALL ON FUNCTION public.sync_stock_reconcile_alert(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_stock_reconcile_alert(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stock_reconcile_job()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  stores_checked int := 0;
  with_diff int := 0;
  res jsonb;
BEGIN
  FOR r IN SELECT id FROM public.stores LOOP
    res := public.sync_stock_reconcile_alert(r.id);
    stores_checked := stores_checked + 1;
    IF COALESCE((res->>'divergentes')::int, 0) > 0 THEN with_diff := with_diff + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('stores', stores_checked, 'com_divergencia', with_diff);
END;
$$;

REVOKE ALL ON FUNCTION public.stock_reconcile_job() FROM public, anon, authenticated;

SELECT cron.unschedule('stock-reconcile-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stock-reconcile-daily');
SELECT cron.schedule('stock-reconcile-daily', '20 8 * * *', $$SELECT public.stock_reconcile_job();$$);