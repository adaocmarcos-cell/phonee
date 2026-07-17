
-- 1) Threshold configurável por loja para alertas de divergência de estoque
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS stock_divergence_threshold NUMERIC NOT NULL DEFAULT 0;

-- 2) Snapshot diário do saldo de estoque (dispara antes da verificação)
CREATE OR REPLACE FUNCTION public.run_daily_stock_snapshot()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  INSERT INTO public.stock_daily_snapshots(store_id, product_id, snapshot_date, balance, unit_cost)
  SELECT p.store_id, p.id, v_today, COALESCE(p.stock_current,0), p.cost_price
    FROM public.products p
   WHERE COALESCE(p.stock_current, 0) IS NOT NULL
  ON CONFLICT (store_id, product_id, snapshot_date) DO UPDATE
    SET balance = EXCLUDED.balance, unit_cost = EXCLUDED.unit_cost;
END; $$;
GRANT EXECUTE ON FUNCTION public.run_daily_stock_snapshot() TO service_role;

-- 3) Verificação consolidada de divergências → alerta único por loja
CREATE OR REPLACE FUNCTION public.run_stock_divergence_check()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD; v_threshold NUMERIC; v_count INT; v_first_pid UUID; v_first_name TEXT; v_total_diff NUMERIC;
BEGIN
  FOR r IN SELECT id, COALESCE(stock_divergence_threshold, 0) AS threshold FROM public.stores WHERE COALESCE(is_active, true) = true
  LOOP
    v_threshold := r.threshold;
    WITH agg AS (
      SELECT p.id AS product_id, p.name,
             COALESCE((SELECT SUM(sm.quantity) FROM public.stock_movements sm
                        WHERE sm.store_id = p.store_id AND sm.product_id = p.id), 0) AS calc,
             COALESCE(p.stock_current, 0) AS atual
        FROM public.products p
       WHERE p.store_id = r.id
    ),
    diverg AS (
      SELECT *, (atual - calc) AS diff FROM agg WHERE ABS(atual - calc) > v_threshold
    )
    SELECT COUNT(*), COALESCE(SUM(diff),0), MIN(product_id), MIN(name)
      INTO v_count, v_total_diff, v_first_pid, v_first_name
      FROM diverg;

    -- Evita spam: só insere se já não houver alerta não-lido do mesmo tipo aberto hoje
    IF v_count > 0 AND NOT EXISTS (
      SELECT 1 FROM public.alerts a
       WHERE a.store_id = r.id AND a.type = 'divergencia_estoque'
         AND a.is_read = false
         AND a.created_at::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ) THEN
      INSERT INTO public.alerts(store_id, type, severity, title, message, link)
      VALUES (
        r.id, 'divergencia_estoque',
        CASE WHEN v_count >= 10 THEN 'danger'::alert_severity ELSE 'warning'::alert_severity END,
        CASE WHEN v_count = 1
             THEN 'Divergência de estoque em ' || COALESCE(v_first_name, 'um produto')
             ELSE v_count || ' produtos com divergência de estoque'
        END,
        'Diferença total ' || CASE WHEN v_total_diff >= 0 THEN '+' ELSE '' END || v_total_diff::text ||
        ' un. entre saldo calculado (movimentos) e saldo atual. Investigue edições manuais no relatório.',
        CASE WHEN v_count = 1
             THEN '/painel/estoque/relatorios?tab=movement&product=' || v_first_pid::text
             ELSE '/painel/estoque/relatorios?tab=movement&divergentes=1'
        END
      );
    END IF;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.run_stock_divergence_check() TO service_role;

-- 4) Agendamento via pg_cron: snapshot 00:05, divergência 00:10 (horário do servidor)
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule('stock-daily-snapshot') FROM cron.job WHERE jobname = 'stock-daily-snapshot';
  PERFORM cron.unschedule('stock-divergence-check') FROM cron.job WHERE jobname = 'stock-divergence-check';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('stock-daily-snapshot',   '5 3 * * *',  $$SELECT public.run_daily_stock_snapshot();$$);
SELECT cron.schedule('stock-divergence-check', '10 3 * * *', $$SELECT public.run_stock_divergence_check();$$);

-- 5) Dashboard: "Recebido em caixa" agora vem de cash_sessions / cash_movements / pagamentos em dinheiro carimbados na sessão
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  _store_id uuid, _from timestamptz, _to timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path = public AS $$
DECLARE
  v_today_from timestamptz := date_trunc('day', now());
  v_today_to   timestamptz := date_trunc('day', now()) + interval '1 day' - interval '1 microsecond';
  v_sales_revenue numeric := 0; v_sales_count int := 0; v_sales_revenue_today numeric := 0;
  v_os_revenue numeric := 0; v_os_revenue_today numeric := 0;
  v_os_cost numeric := 0;
  v_products_cost numeric := 0;
  v_recebido_caixa numeric := 0; v_recebido_troca numeric := 0;
  v_expenses numeric := 0;
  v_a_receber_total numeric := 0; v_a_receber_vencido numeric := 0;
  v_vencidas_count int := 0; v_vence_hoje_count int := 0;
  v_recebido_credito_hoje numeric := 0; v_recebido_credito_periodo numeric := 0;
  v_cash_sales numeric := 0; v_cash_recv numeric := 0; v_cash_moves numeric := 0;
  v_pay jsonb; v_serie jsonb; v_top jsonb;
BEGIN
  SELECT COALESCE(SUM(COALESCE(s.net_value, s.total) - COALESCE(s.returned_total, 0)), 0),
         COUNT(*),
         COALESCE(SUM(CASE WHEN s.created_at >= v_today_from AND s.created_at <= v_today_to
                            THEN COALESCE(s.net_value, s.total) - COALESCE(s.returned_total, 0)
                            ELSE 0 END), 0)
    INTO v_sales_revenue, v_sales_count, v_sales_revenue_today
    FROM public.sales s
   WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to;

  SELECT COALESCE(SUM(o.total_value), 0), COALESCE(SUM(o.parts_value), 0),
         COALESCE(SUM(CASE WHEN COALESCE(o.end_date::timestamptz, o.created_at) >= v_today_from
                            AND COALESCE(o.end_date::timestamptz, o.created_at) <= v_today_to
                           THEN o.total_value ELSE 0 END), 0)
    INTO v_os_revenue, v_os_cost, v_os_revenue_today
    FROM public.service_orders o
   WHERE o.store_id = _store_id AND o.status = 'entregue'::public.os_status
     AND COALESCE(o.end_date::timestamptz, o.created_at) >= _from
     AND COALESCE(o.end_date::timestamptz, o.created_at) <= _to;

  SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0) INTO v_products_cost
    FROM public.sale_items si JOIN public.sales s ON s.id = si.sale_id
   WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to
     AND COALESCE(si.is_service, false) = false;

  SELECT COALESCE(SUM(CASE WHEN sp.method = 'troca' THEN sp.amount ELSE 0 END), 0)
    INTO v_recebido_troca
    FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
   WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to;

  -- NOVO: recebido em caixa = dinheiro que passou pela sessão de caixa
  SELECT COALESCE(SUM(sp.amount),0) INTO v_cash_sales
    FROM public.sale_payments sp
    JOIN public.sales s ON s.id = sp.sale_id
   WHERE s.store_id = _store_id
     AND s.created_at >= _from AND s.created_at <= _to
     AND sp.method = 'dinheiro'
     AND s.cash_session_id IS NOT NULL;

  SELECT COALESCE(SUM(amount),0) INTO v_cash_recv
    FROM public.receivable_payments
   WHERE store_id = _store_id AND method = 'dinheiro'
     AND cash_session_id IS NOT NULL
     AND received_at >= _from AND received_at <= _to;

  SELECT COALESCE(SUM(
           CASE WHEN cm.type = 'suprimento' THEN cm.amount
                WHEN cm.type = 'sangria'    THEN -cm.amount
                ELSE 0 END), 0)
    INTO v_cash_moves
    FROM public.cash_movements cm
    JOIN public.cash_sessions cs ON cs.id = cm.session_id
   WHERE cs.store_id = _store_id
     AND cm.created_at >= _from AND cm.created_at <= _to;

  v_recebido_caixa := v_cash_sales + v_cash_recv + v_cash_moves;

  SELECT COALESCE(SUM(amount), 0) INTO v_expenses FROM public.expenses
   WHERE store_id = _store_id AND expense_date >= _from::date AND expense_date <= _to::date;

  SELECT COALESCE(SUM(amount - paid_amount), 0),
         COALESCE(SUM(CASE WHEN due_date < current_date THEN (amount - paid_amount) ELSE 0 END), 0),
         COALESCE(COUNT(*) FILTER (WHERE due_date < current_date), 0),
         COALESCE(COUNT(*) FILTER (WHERE due_date = current_date), 0)
    INTO v_a_receber_total, v_a_receber_vencido, v_vencidas_count, v_vence_hoje_count
    FROM public.sale_receivables
   WHERE store_id = _store_id AND status IN ('aberto','parcial');

  SELECT COALESCE(SUM(amount), 0),
         COALESCE(SUM(CASE WHEN received_at >= v_today_from AND received_at <= v_today_to THEN amount ELSE 0 END), 0)
    INTO v_recebido_credito_periodo, v_recebido_credito_hoje
    FROM public.receivable_payments
   WHERE store_id = _store_id AND received_at >= _from AND received_at <= _to;

  WITH pays AS (
    SELECT sp.method AS name, SUM(sp.amount) AS value
      FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
     WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to
     GROUP BY sp.method
    UNION ALL
    SELECT s.payment_method::text,
           SUM(COALESCE(s.net_value, s.total) - COALESCE(s.returned_total,0))
      FROM public.sales s
     WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to
       AND NOT EXISTS (SELECT 1 FROM public.sale_payments sp WHERE sp.sale_id = s.id)
     GROUP BY s.payment_method
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC), '[]'::jsonb)
    INTO v_pay FROM (SELECT name, SUM(value) AS value FROM pays WHERE value > 0 GROUP BY name) p;

  WITH d AS (
    SELECT (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
           COALESCE(s.net_value, s.total) - COALESCE(s.returned_total,0) AS total
      FROM public.sales s
     WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to
    UNION ALL
    SELECT (COALESCE(o.end_date::timestamptz, o.created_at) AT TIME ZONE 'America/Sao_Paulo')::date,
           o.total_value FROM public.service_orders o
     WHERE o.store_id = _store_id AND o.status = 'entregue'::public.os_status
       AND COALESCE(o.end_date::timestamptz, o.created_at) >= _from
       AND COALESCE(o.end_date::timestamptz, o.created_at) <= _to
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', to_char(day, 'DD/MM'), 'total', total) ORDER BY day), '[]'::jsonb)
    INTO v_serie FROM (SELECT day, SUM(total) AS total FROM d GROUP BY day ORDER BY day) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', revenue) ORDER BY revenue DESC), '[]'::jsonb)
    INTO v_top FROM (
      SELECT COALESCE(si.name, p.name, '—') AS name,
             SUM(si.quantity)::int AS qty, SUM(si.total) AS revenue
        FROM public.sale_items si JOIN public.sales s ON s.id = si.sale_id
        LEFT JOIN public.products p ON p.id = si.product_id
       WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to
       GROUP BY 1 ORDER BY 3 DESC LIMIT 10
    ) t;

  RETURN jsonb_build_object(
    'faturamento_total', v_sales_revenue + v_os_revenue,
    'faturamento_vendas', v_sales_revenue,
    'faturamento_os', v_os_revenue,
    'faturamento_hoje', v_sales_revenue_today + v_os_revenue_today,
    'recebido_caixa', v_recebido_caixa,
    'recebido_em_troca', v_recebido_troca,
    'custo', v_products_cost + v_os_cost,
    'custo_produtos', v_products_cost,
    'custo_os', v_os_cost,
    'despesas', v_expenses,
    'lucro', (v_sales_revenue + v_os_revenue) - (v_products_cost + v_os_cost) - v_expenses,
    'qtd_vendas', v_sales_count,
    'ticket_medio', CASE WHEN v_sales_count > 0 THEN v_sales_revenue / v_sales_count ELSE 0 END,
    'formas_pagamento', v_pay,
    'serie_diaria', v_serie,
    'top_produtos', v_top,
    'periodo', jsonb_build_object('from', _from, 'to', _to),
    'a_receber_total', v_a_receber_total,
    'a_receber_vencido', v_a_receber_vencido,
    'vencidas_count', v_vencidas_count,
    'vence_hoje_count', v_vence_hoje_count,
    'recebido_credito_hoje', v_recebido_credito_hoje,
    'recebido_credito_periodo', v_recebido_credito_periodo
  );
END; $$;
