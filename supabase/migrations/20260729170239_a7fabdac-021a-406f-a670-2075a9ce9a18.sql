ALTER TABLE public.sale_return_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.create_sale_return(_sale_id uuid, _reason text, _notes text, _refund_method text, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_return_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_si public.sale_items%ROWTYPE;
  v_qty int; v_prior int; v_unit numeric;
  v_credit_id uuid; v_credit_code text; v_expense_id uuid;
  v_uid uuid := auth.uid();
  v_expense_cat uuid; v_pay_method_expense text; v_expiry_days int;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF NOT public.user_has_store_access(v_uid, v_sale.store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF _refund_method NOT IN ('dinheiro','pix','cartao_estorno','vale_troca','troca_imediata') THEN
    RAISE EXCEPTION 'refund_method inválido: %', _refund_method;
  END IF;

  INSERT INTO public.sale_returns (store_id, sale_id, created_by, reason, notes, refund_method, total_returned)
  VALUES (v_sale.store_id, v_sale.id, v_uid, _reason, _notes, _refund_method, 0)
  RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) LOOP
    SELECT * INTO v_si FROM public.sale_items WHERE id = (v_item->>'sale_item_id')::uuid AND sale_id = _sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item não pertence a esta venda'; END IF;
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));

    SELECT COALESCE(SUM(ri.quantity),0) INTO v_prior
      FROM public.sale_return_items ri JOIN public.sale_returns r ON r.id = ri.return_id
      WHERE ri.sale_item_id = v_si.id AND r.id <> v_return_id;

    IF v_prior + v_qty > v_si.quantity THEN
      RAISE EXCEPTION 'Quantidade a devolver (%) excede disponível (%) para o item %',
        v_qty, v_si.quantity - v_prior, COALESCE(v_si.name, v_si.description);
    END IF;

    v_unit := COALESCE((v_item->>'unit_value')::numeric,
      CASE WHEN v_si.quantity > 0 THEN (v_si.total::numeric / v_si.quantity) ELSE 0 END);

    INSERT INTO public.sale_return_items (return_id, sale_item_id, product_id, quantity, unit_value, unit_cost, restock, defect_note)
    VALUES (v_return_id, v_si.id, v_si.product_id, v_qty, v_unit,
            CASE WHEN COALESCE(v_si.is_service, false) THEN 0 ELSE COALESCE(v_si.unit_cost, 0) END,
            COALESCE((v_item->>'restock')::boolean, true), v_item->>'defect_note');

    IF COALESCE((v_item->>'restock')::boolean, true)
       AND v_si.product_id IS NOT NULL
       AND COALESCE(v_si.is_service, false) = false THEN
      PERFORM set_config('app.stock_origin', 'devolucao:sale_returns:'||v_return_id, true); UPDATE public.products SET stock_current = stock_current + v_qty WHERE id = v_si.product_id;
    END IF;

    v_total := v_total + (v_unit * v_qty);
  END LOOP;

  IF v_total <= 0 THEN RAISE EXCEPTION 'Nenhum item válido informado'; END IF;

  UPDATE public.sale_returns SET total_returned = v_total WHERE id = v_return_id;
  UPDATE public.sales SET returned_total = COALESCE(returned_total,0) + v_total WHERE id = v_sale.id;

  IF _refund_method = 'vale_troca' THEN
    SELECT COALESCE(store_credit_default_days,90) INTO v_expiry_days FROM public.stores WHERE id = v_sale.store_id;
    v_credit_code := public.generate_store_credit_code(v_sale.store_id);
    INSERT INTO public.store_credits (store_id, code, customer_id, customer_name, customer_doc,
        original_amount, balance, expires_at, origin_return_id)
    VALUES (v_sale.store_id, v_credit_code, v_sale.customer_id, v_sale.customer_name, v_sale.customer_doc,
        v_total, v_total,
        CASE WHEN v_expiry_days > 0 THEN now() + make_interval(days => v_expiry_days) ELSE NULL END,
        v_return_id)
    RETURNING id INTO v_credit_id;
    UPDATE public.sale_returns SET store_credit_id = v_credit_id WHERE id = v_return_id;

  ELSIF _refund_method IN ('dinheiro','pix','cartao_estorno') THEN
    SELECT id INTO v_expense_cat FROM public.expense_categories
      WHERE store_id = v_sale.store_id AND lower(name) = 'devoluções' LIMIT 1;
    IF v_expense_cat IS NULL THEN
      INSERT INTO public.expense_categories(store_id, name, description, color, icon, is_system, created_by)
      VALUES (v_sale.store_id, 'Devoluções', 'Estornos de vendas', '#EF4444', 'RotateCcw', true, v_uid)
      RETURNING id INTO v_expense_cat;
    END IF;
    v_pay_method_expense := CASE _refund_method WHEN 'dinheiro' THEN 'dinheiro' WHEN 'pix' THEN 'pix' ELSE 'cartao' END;
    INSERT INTO public.expenses (store_id, category_id, category_name, description, amount, expense_date, payment_method, created_by)
    VALUES (v_sale.store_id, v_expense_cat, 'Devoluções',
      'Devolução venda #' || COALESCE(v_sale.sale_number::text, substr(v_sale.id::text,1,8)) ||
        CASE WHEN _reason IS NOT NULL AND _reason <> '' THEN ' — ' || _reason ELSE '' END,
      v_total, CURRENT_DATE, v_pay_method_expense, v_uid)
    RETURNING id INTO v_expense_id;
    UPDATE public.sale_returns SET expense_id = v_expense_id WHERE id = v_return_id;
  END IF;

  BEGIN
    IF v_total >= COALESCE(v_sale.total,0) THEN
      UPDATE public.commission_entries
         SET status = 'estornado', updated_at = now(),
             notes = COALESCE(notes,'') || ' | Estornado por devolução ' || v_return_id::text
       WHERE sale_id = v_sale.id AND status = 'a_pagar';
    ELSE
      INSERT INTO public.commission_entries(store_id, user_id, origin, sale_id, rule_id, base_amount, commission_amount, status, notes)
      SELECT ce.store_id, ce.user_id, 'venda', ce.sale_id, ce.rule_id,
             -1 * (ce.base_amount * (v_total / NULLIF(v_sale.total,0))),
             -1 * (ce.commission_amount * (v_total / NULLIF(v_sale.total,0))),
             'a_pagar', 'Ajuste devolução ' || v_return_id::text
        FROM public.commission_entries ce
       WHERE ce.sale_id = v_sale.id AND ce.status = 'a_pagar' AND ce.commission_amount > 0;
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object(
    'return_id', v_return_id, 'total_returned', v_total,
    'store_credit_id', v_credit_id, 'store_credit_code', v_credit_code,
    'expense_id', v_expense_id
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics_base(_store_id uuid, _from timestamp with time zone, _to timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn2$
DECLARE
  v_today_from timestamptz := date_trunc('day', now());
  v_today_to   timestamptz := date_trunc('day', now()) + interval '1 day' - interval '1 microsecond';
  v_sales_revenue numeric := 0; v_sales_count int := 0; v_sales_revenue_today numeric := 0;
  v_os_revenue numeric := 0; v_os_revenue_today numeric := 0;
  v_os_cost numeric := 0;
  v_products_cost numeric := 0;
  v_recebido_caixa numeric := 0; v_recebido_troca numeric := 0;
  v_expenses numeric := 0; v_expenses_paid numeric := 0;
  v_returns_paid numeric := 0; v_returns_cost numeric := 0;
  v_stock_purchases numeric := 0; v_stock_purchases_paid numeric := 0;
  v_a_receber_total numeric := 0; v_a_receber_vencido numeric := 0;
  v_vencidas_count int := 0; v_vence_hoje_count int := 0;
  v_recebido_credito_hoje numeric := 0; v_recebido_credito_periodo numeric := 0;
  v_cash_sales numeric := 0; v_cash_recv numeric := 0; v_cash_moves numeric := 0;
  v_gross numeric := 0; v_net numeric := 0; v_cash_flow numeric := 0;
  v_in_payments numeric := 0; v_in_nodetail numeric := 0;
  v_entradas numeric := 0; v_saidas numeric := 0;
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

  SELECT COALESCE(SUM(COALESCE(ri.unit_cost, 0) * ri.quantity), 0) INTO v_returns_cost
    FROM public.sale_return_items ri
    JOIN public.sale_returns r ON r.id = ri.return_id
    JOIN public.sales s ON s.id = r.sale_id
   WHERE r.store_id = _store_id
     AND s.created_at >= _from AND s.created_at <= _to
     AND COALESCE(ri.restock, true) = true;

  v_products_cost := GREATEST(v_products_cost - v_returns_cost, 0);

  SELECT COALESCE(SUM(CASE WHEN sp.method = 'troca' THEN sp.amount ELSE 0 END), 0)
    INTO v_recebido_troca
    FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
   WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to;

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

  WITH exp AS (
    SELECT e.id, e.amount, e.expense_date,
           COALESCE(
             (SELECT ec.is_stock_purchase FROM public.expense_categories ec WHERE ec.id = e.category_id),
             EXISTS (SELECT 1 FROM public.expense_categories ec2
                      WHERE ec2.is_stock_purchase = true
                        AND lower(ec2.name) = lower(e.category_name)),
             false
           )
           OR EXISTS (SELECT 1 FROM public.trade_ins ti WHERE ti.entry_expense_id = e.id) AS is_stock,
           EXISTS (SELECT 1 FROM public.sale_returns sr WHERE sr.expense_id = e.id) AS is_return
      FROM public.expenses e
     WHERE e.store_id = _store_id
       AND e.expense_date >= _from::date AND e.expense_date <= _to::date
  )
  SELECT COALESCE(SUM(amount) FILTER (WHERE NOT is_stock AND NOT is_return), 0),
         COALESCE(SUM(amount) FILTER (WHERE NOT is_stock AND NOT is_return AND expense_date <= current_date), 0),
         COALESCE(SUM(amount) FILTER (WHERE is_stock), 0),
         COALESCE(SUM(amount) FILTER (WHERE is_stock AND expense_date <= current_date), 0),
         COALESCE(SUM(amount) FILTER (WHERE is_return AND expense_date <= current_date), 0)
    INTO v_expenses, v_expenses_paid, v_stock_purchases, v_stock_purchases_paid, v_returns_paid
    FROM exp;

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

  SELECT COALESCE(SUM(sp.amount), 0) INTO v_in_payments
    FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
   WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to
     AND sp.method <> 'troca';

  SELECT COALESCE(SUM(COALESCE(s.net_value, s.total) - COALESCE(s.returned_total, 0)), 0)
    INTO v_in_nodetail
    FROM public.sales s
   WHERE s.store_id = _store_id AND s.created_at >= _from AND s.created_at <= _to
     AND NOT EXISTS (SELECT 1 FROM public.sale_payments sp WHERE sp.sale_id = s.id);

  v_entradas := v_in_payments + v_in_nodetail + v_recebido_credito_periodo;
  v_saidas   := v_expenses_paid + v_stock_purchases_paid + v_returns_paid;

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

  v_gross := (v_sales_revenue + v_os_revenue) - (v_products_cost + v_os_cost);
  v_net   := v_gross - v_expenses;
  v_cash_flow := v_entradas - v_saidas;

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
    'cmv_estornado', v_returns_cost,
    'devolucoes_reembolsadas', v_returns_paid,
    'despesas', v_expenses,
    'despesas_pagas', v_expenses_paid,
    'compras_estoque', v_stock_purchases,
    'compras_estoque_pagas', v_stock_purchases_paid,
    'lucro_bruto', v_gross,
    'lucro_liquido', v_net,
    'entradas_periodo', v_entradas,
    'saidas_periodo', v_saidas,
    'movimento_caixa', v_cash_flow,
    'lucro', v_net,
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
END;
$fn2$;