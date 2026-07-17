
-- Expande CHECK antes do seed
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_event_chk;
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_event_chk
  CHECK (event_key = ANY (ARRAY[
    'os_criada','orcamento_pronto','orcamento_aprovado','aparelho_pronto',
    'os_entregue_garantia','venda_concluida','cobranca_pendente','cobranca_vencida'
  ]));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_payment_status_chk') THEN
    ALTER TABLE public.sales ADD CONSTRAINT sales_payment_status_chk
      CHECK (payment_status IN ('pago','parcial','em_aberto'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sale_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  customer_id uuid,
  customer_name text,
  customer_whatsapp text,
  installment_number int NOT NULL,
  total_installments int NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  paid_amount numeric NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','parcial','pago','cancelado')),
  paid_at timestamptz,
  renegotiated_from uuid REFERENCES public.sale_receivables(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_receivables TO authenticated;
GRANT ALL ON public.sale_receivables TO service_role;
ALTER TABLE public.sale_receivables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receivables_store_access_select" ON public.sale_receivables
  FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "receivables_store_access_write" ON public.sale_receivables
  FOR ALL TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.is_owner(auth.uid(), store_id) OR public.user_has_store_access(auth.uid(), store_id));
CREATE INDEX IF NOT EXISTS sale_receivables_store_status_due_idx ON public.sale_receivables(store_id, status, due_date);
CREATE INDEX IF NOT EXISTS sale_receivables_sale_idx ON public.sale_receivables(sale_id);
CREATE INDEX IF NOT EXISTS sale_receivables_customer_idx ON public.sale_receivables(store_id, customer_id);
CREATE TRIGGER trg_sale_receivables_updated_at
  BEFORE UPDATE ON public.sale_receivables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.receivable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES public.sale_receivables(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('dinheiro','pix','cartao','transferencia','outro')),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receivable_payments TO authenticated;
GRANT ALL ON public.receivable_payments TO service_role;
ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receivable_payments_store_access_select" ON public.receivable_payments
  FOR SELECT TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "receivable_payments_store_access_write" ON public.receivable_payments
  FOR ALL TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.is_owner(auth.uid(), store_id) OR public.user_has_store_access(auth.uid(), store_id));
CREATE INDEX IF NOT EXISTS receivable_payments_store_received_idx ON public.receivable_payments(store_id, received_at);
CREATE INDEX IF NOT EXISTS receivable_payments_receivable_idx ON public.receivable_payments(receivable_id);

CREATE OR REPLACE FUNCTION public.register_credit_installments(
  _sale_id uuid, _entry_amount numeric, _installments int,
  _first_due date, _interval_days int DEFAULT 30, _customer_whatsapp text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale record; v_uid uuid := auth.uid();
  v_total numeric; v_credit_total numeric;
  v_base numeric; v_last numeric; v_i int;
  v_ids uuid[] := '{}'; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _installments IS NULL OR _installments < 1 THEN RAISE EXCEPTION 'nº de parcelas inválido'; END IF;
  IF _first_due IS NULL THEN RAISE EXCEPTION 'data do 1º vencimento obrigatória'; END IF;
  SELECT s.* INTO v_sale FROM public.sales s WHERE s.id = _sale_id;
  IF v_sale IS NULL THEN RAISE EXCEPTION 'venda não encontrada'; END IF;
  IF NOT (public.is_owner(v_uid, v_sale.store_id) OR public.user_has_store_access(v_uid, v_sale.store_id)) THEN
    RAISE EXCEPTION 'sem acesso a esta loja';
  END IF;
  v_total := COALESCE(v_sale.net_value, v_sale.total);
  v_credit_total := v_total - COALESCE(_entry_amount, 0);
  IF v_credit_total <= 0 THEN
    RAISE EXCEPTION 'entrada cobre a venda inteira — não há parcelas a gerar';
  END IF;
  v_base := round((v_credit_total / _installments)::numeric, 2);
  v_last := round((v_credit_total - v_base * (_installments - 1))::numeric, 2);
  FOR v_i IN 1.._installments LOOP
    INSERT INTO public.sale_receivables (
      store_id, sale_id, customer_id, customer_name, customer_whatsapp,
      installment_number, total_installments, due_date, amount, status
    ) VALUES (
      v_sale.store_id, v_sale.id, v_sale.customer_id, v_sale.customer_name,
      COALESCE(_customer_whatsapp, v_sale.customer_whatsapp),
      v_i, _installments,
      _first_due + ((v_i - 1) * _interval_days) * interval '1 day',
      CASE WHEN v_i = _installments THEN v_last ELSE v_base END, 'aberto'
    ) RETURNING id INTO v_id;
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  UPDATE public.sales
     SET payment_status = CASE WHEN COALESCE(_entry_amount,0) > 0 THEN 'parcial' ELSE 'em_aberto' END,
         due_date = _first_due
   WHERE id = _sale_id;
  INSERT INTO public.audit_log (store_id, user_id, entity, entity_id, action, details)
  VALUES (v_sale.store_id, v_uid, 'sale', _sale_id, 'crediario_registrado',
          jsonb_build_object('entrada', _entry_amount, 'parcelas', _installments,
                             'primeiro_vencimento', _first_due, 'intervalo_dias', _interval_days,
                             'ids', to_jsonb(v_ids)));
  RETURN jsonb_build_object('receivable_ids', to_jsonb(v_ids), 'credit_total', v_credit_total);
END; $$;
REVOKE ALL ON FUNCTION public.register_credit_installments(uuid, numeric, int, date, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_credit_installments(uuid, numeric, int, date, int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_installment(
  _receivable_id uuid, _amount numeric, _method text,
  _received_at timestamptz DEFAULT now(), _notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec record; v_uid uuid := auth.uid();
  v_new_paid numeric; v_new_status text;
  v_open_count int; v_sale_new_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'valor inválido'; END IF;
  IF _method NOT IN ('dinheiro','pix','cartao','transferencia','outro') THEN
    RAISE EXCEPTION 'forma de pagamento inválida';
  END IF;
  SELECT * INTO v_rec FROM public.sale_receivables WHERE id = _receivable_id FOR UPDATE;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'parcela não encontrada'; END IF;
  IF NOT (public.is_owner(v_uid, v_rec.store_id) OR public.user_has_store_access(v_uid, v_rec.store_id)) THEN
    RAISE EXCEPTION 'sem acesso a esta loja';
  END IF;
  IF v_rec.status = 'pago' THEN RAISE EXCEPTION 'parcela já quitada'; END IF;
  IF v_rec.status = 'cancelado' THEN RAISE EXCEPTION 'parcela cancelada'; END IF;
  v_new_paid := round((v_rec.paid_amount + _amount)::numeric, 2);
  IF v_new_paid > v_rec.amount + 0.01 THEN
    RAISE EXCEPTION 'valor excede o saldo da parcela (saldo=%)', (v_rec.amount - v_rec.paid_amount);
  END IF;
  v_new_status := CASE WHEN v_new_paid >= v_rec.amount - 0.01 THEN 'pago'
                       WHEN v_new_paid > 0 THEN 'parcial' ELSE 'aberto' END;
  INSERT INTO public.receivable_payments (
    store_id, receivable_id, sale_id, amount, method, received_at, received_by, notes
  ) VALUES (v_rec.store_id, v_rec.id, v_rec.sale_id, _amount, _method,
            COALESCE(_received_at, now()), v_uid, _notes);
  UPDATE public.sale_receivables
     SET paid_amount = v_new_paid, status = v_new_status,
         paid_at = CASE WHEN v_new_status = 'pago' THEN COALESCE(_received_at, now()) ELSE paid_at END
   WHERE id = _receivable_id;
  SELECT COUNT(*) INTO v_open_count FROM public.sale_receivables
   WHERE sale_id = v_rec.sale_id AND status <> 'pago' AND status <> 'cancelado';
  IF v_open_count = 0 THEN v_sale_new_status := 'pago';
  ELSIF v_new_paid > 0 THEN v_sale_new_status := 'parcial';
  ELSE v_sale_new_status := 'em_aberto'; END IF;
  UPDATE public.sales SET payment_status = v_sale_new_status WHERE id = v_rec.sale_id;
  INSERT INTO public.audit_log (store_id, user_id, entity, entity_id, action, details)
  VALUES (v_rec.store_id, v_uid, 'sale_receivable', _receivable_id, 'abatimento',
          jsonb_build_object('amount', _amount, 'method', _method, 'new_status', v_new_status));
  RETURN jsonb_build_object('receivable_id', _receivable_id, 'new_status', v_new_status,
                            'sale_status', v_sale_new_status, 'paid_amount', v_new_paid);
END; $$;
REVOKE ALL ON FUNCTION public.receive_installment(uuid, numeric, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_installment(uuid, numeric, text, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.renegotiate_receivables(
  _receivable_ids uuid[], _new_installments int, _first_due date,
  _interval_days int DEFAULT 30, _reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid; v_sale uuid; v_saldo numeric := 0;
  v_row record; v_base numeric; v_last numeric;
  v_i int; v_id uuid; v_new_ids uuid[] := '{}';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF array_length(_receivable_ids, 1) IS NULL THEN RAISE EXCEPTION 'nenhuma parcela informada'; END IF;
  IF _new_installments < 1 THEN RAISE EXCEPTION 'nº de parcelas inválido'; END IF;
  FOR v_row IN
    SELECT * FROM public.sale_receivables
     WHERE id = ANY(_receivable_ids) AND status IN ('aberto','parcial') FOR UPDATE
  LOOP
    IF v_store IS NULL THEN v_store := v_row.store_id; v_sale := v_row.sale_id; END IF;
    IF v_store <> v_row.store_id OR v_sale <> v_row.sale_id THEN
      RAISE EXCEPTION 'renegociação exige parcelas da mesma venda/loja';
    END IF;
    v_saldo := v_saldo + (v_row.amount - v_row.paid_amount);
    UPDATE public.sale_receivables
       SET status = 'cancelado', notes = COALESCE(notes,'') || ' [renegociada]'
     WHERE id = v_row.id;
  END LOOP;
  IF v_saldo <= 0 THEN RAISE EXCEPTION 'saldo a renegociar é zero'; END IF;
  IF NOT (public.is_owner(v_uid, v_store) OR public.user_has_store_access(v_uid, v_store)) THEN
    RAISE EXCEPTION 'sem acesso a esta loja';
  END IF;
  v_base := round((v_saldo / _new_installments)::numeric, 2);
  v_last := round((v_saldo - v_base * (_new_installments - 1))::numeric, 2);
  FOR v_i IN 1.._new_installments LOOP
    INSERT INTO public.sale_receivables (
      store_id, sale_id, customer_id, customer_name, customer_whatsapp,
      installment_number, total_installments, due_date, amount, status, renegotiated_from
    )
    SELECT v_store, v_sale, sr.customer_id, sr.customer_name, sr.customer_whatsapp,
           v_i, _new_installments,
           _first_due + ((v_i - 1) * _interval_days) * interval '1 day',
           CASE WHEN v_i = _new_installments THEN v_last ELSE v_base END,
           'aberto', _receivable_ids[1]
      FROM public.sale_receivables sr WHERE sr.id = _receivable_ids[1]
    RETURNING id INTO v_id;
    v_new_ids := array_append(v_new_ids, v_id);
  END LOOP;
  INSERT INTO public.audit_log (store_id, user_id, entity, entity_id, action, details)
  VALUES (v_store, v_uid, 'sale', v_sale, 'crediario_renegociado',
          jsonb_build_object('saldo', v_saldo, 'novas_parcelas', _new_installments,
                             'ids_antigos', to_jsonb(_receivable_ids),
                             'ids_novos', to_jsonb(v_new_ids), 'motivo', _reason));
  RETURN jsonb_build_object('new_ids', to_jsonb(v_new_ids), 'saldo', v_saldo);
END; $$;
REVOKE ALL ON FUNCTION public.renegotiate_receivables(uuid[], int, date, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renegotiate_receivables(uuid[], int, date, int, text) TO authenticated;

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
    'sales_revenue', v_sales_revenue, 'sales_count', v_sales_count, 'sales_revenue_today', v_sales_revenue_today,
    'os_revenue', v_os_revenue, 'os_revenue_today', v_os_revenue_today,
    'products_cost', v_products_cost, 'os_cost', v_os_cost,
    'recebido_caixa', v_recebido_caixa, 'recebido_troca', v_recebido_troca,
    'expenses', v_expenses,
    'a_receber_total', v_a_receber_total, 'a_receber_vencido', v_a_receber_vencido,
    'vencidas_count', v_vencidas_count, 'vence_hoje_count', v_vence_hoje_count,
    'recebido_credito_hoje', v_recebido_credito_hoje,
    'recebido_credito_periodo', v_recebido_credito_periodo,
    'payments_breakdown', v_pay, 'daily_series', v_serie, 'top_products', v_top
  );
END; $$;

CREATE OR REPLACE FUNCTION public.create_purchase_with_stock(
  _store_id uuid, _supplier_id uuid, _supplier_name text,
  _payment_method text, _payment_status text, _due_date date,
  _expected_delivery_at timestamptz, _notes text, _tags text[],
  _items jsonb, _create_expense boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid; v_item jsonb; v_product_id uuid;
  v_name text; v_sku text; v_qty numeric; v_unit_cost numeric;
  v_total numeric := 0; v_created int := 0; v_updated int := 0;
  v_total_units numeric := 0; v_now timestamptz := now();
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_total := v_total + (COALESCE((v_item->>'quantity')::numeric,0) * COALESCE((v_item->>'unit_cost')::numeric,0));
  END LOOP;
  INSERT INTO public.purchase_orders (
    store_id, supplier_id, supplier, status, total_cost, notes,
    payment_method, expected_delivery_at, received_at, sent_at,
    payment_status, paid_at, due_date, tags
  ) VALUES (
    _store_id, _supplier_id, _supplier_name, 'recebido', v_total, _notes,
    _payment_method, _expected_delivery_at, v_now, v_now,
    COALESCE(_payment_status,'a_pagar'),
    CASE WHEN _payment_status = 'pago' THEN v_now ELSE NULL END,
    _due_date, COALESCE(_tags, ARRAY[]::text[])
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_name := trim(both ' ' from (v_item->>'product_name'));
    v_sku := NULLIF(trim(both ' ' from COALESCE(v_item->>'sku','')), '');
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    IF v_qty <= 0 OR v_name = '' THEN CONTINUE; END IF;
    INSERT INTO public.purchase_order_items (order_id, product_id, product_name, sku, quantity, unit_cost, created_at)
    VALUES (v_order_id, v_product_id, v_name, v_sku, v_qty, v_unit_cost, v_now);
    IF v_product_id IS NOT NULL THEN
      UPDATE public.products SET stock_current = COALESCE(stock_current, 0) + v_qty,
             cost_price = v_unit_cost, updated_at = v_now
       WHERE id = v_product_id AND store_id = _store_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.products (store_id, name, sku, cost_price, stock_current, status)
      VALUES (_store_id, v_name, v_sku, v_unit_cost, v_qty, 'ativo') RETURNING id INTO v_product_id;
      v_created := v_created + 1;
      UPDATE public.purchase_order_items SET product_id = v_product_id
       WHERE order_id = v_order_id AND product_id IS NULL AND product_name = v_name;
    END IF;
    v_total_units := v_total_units + v_qty;
  END LOOP;

  IF COALESCE(_create_expense, false) THEN
    INSERT INTO public.expenses (store_id, description, amount, expense_date, notes, created_by)
    VALUES (_store_id, 'Compra: ' || _supplier_name, v_total, v_now::date,
            'Pedido ' || v_order_id::text, auth.uid());
  END IF;

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_total,
                            'created', v_created, 'updated', v_updated, 'units', v_total_units);
END; $$;
REVOKE ALL ON FUNCTION public.create_purchase_with_stock(uuid, uuid, text, text, text, date, timestamptz, text, text[], jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_stock(uuid, uuid, text, text, text, date, timestamptz, text, text[], jsonb, boolean) TO authenticated;

INSERT INTO public.whatsapp_templates (store_id, event_key, title, body, is_active)
SELECT s.id, 'cobranca_pendente', 'Lembrete de vencimento',
       'Olá {cliente}, tudo bem? Aqui é da {loja} 😊 Passando só para lembrar da parcela {parcela} de {valor} com vencimento em {vencimento}. Qualquer coisa estamos à disposição!',
       true
  FROM public.stores s
 WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates t
                    WHERE t.store_id = s.id AND t.event_key = 'cobranca_pendente');

INSERT INTO public.whatsapp_templates (store_id, event_key, title, body, is_active)
SELECT s.id, 'cobranca_vencida', 'Cobrança amigável (vencida)',
       'Olá {cliente}, aqui é da {loja}. Notamos que a parcela {parcela} de {valor} venceu em {vencimento} (há {dias_atraso} dia(s)). Podemos combinar a melhor forma de regularizar? Ficamos à disposição 🙏',
       true
  FROM public.stores s
 WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates t
                    WHERE t.store_id = s.id AND t.event_key = 'cobranca_vencida');
