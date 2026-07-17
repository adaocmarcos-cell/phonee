
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  _store_id uuid, _from timestamptz, _to timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path = public AS $$
DECLARE
  v_today_from timestamptz := date_trunc('day', now());
  v_today_to   timestamptz := date_trunc('day', now()) + interval '1 day' - interval '1 microsecond';
  v_sales_revenue numeric := 0; v_sales_count int := 0; v_sales_revenue_today numeric := 0;
  v_os_revenue numeric := 0; v_os_revenue_today numeric := 0;
  v_os_cost numeric := 0; v_os_paid numeric := 0;
  v_products_cost numeric := 0;
  v_recebido_caixa numeric := 0; v_recebido_troca numeric := 0;
  v_expenses numeric := 0;
  v_a_receber_total numeric := 0; v_a_receber_vencido numeric := 0;
  v_vencidas_count int := 0; v_vence_hoje_count int := 0;
  v_recebido_credito_hoje numeric := 0; v_recebido_credito_periodo numeric := 0;
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
  v_os_paid := v_os_revenue;

  SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0) INTO v_products_cost
    FROM public.sale_items si JOIN public.sales s ON s.id = si.sale_id
   WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to
     AND COALESCE(si.is_service, false) = false;

  SELECT COALESCE(SUM(CASE WHEN sp.method <> 'troca' THEN sp.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN sp.method =  'troca' THEN sp.amount ELSE 0 END), 0)
    INTO v_recebido_caixa, v_recebido_troca
    FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
   WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to;

  v_recebido_caixa := v_recebido_caixa + COALESCE((
    SELECT SUM(COALESCE(s.net_value, s.total) - COALESCE(s.returned_total, 0))
      FROM public.sales s
     WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to
       AND NOT EXISTS (SELECT 1 FROM public.sale_payments sp2 WHERE sp2.sale_id = s.id)
  ), 0);
  v_recebido_caixa := v_recebido_caixa + v_os_paid;

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

  v_recebido_caixa := v_recebido_caixa + v_recebido_credito_periodo;

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
    -- Contrato ORIGINAL (não renomear — o Dashboard depende destes nomes)
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
    -- NOVAS chaves de crediário
    'a_receber_total', v_a_receber_total,
    'a_receber_vencido', v_a_receber_vencido,
    'vencidas_count', v_vencidas_count,
    'vence_hoje_count', v_vence_hoje_count,
    'recebido_credito_hoje', v_recebido_credito_hoje,
    'recebido_credito_periodo', v_recebido_credito_periodo
  );
END; $$;
