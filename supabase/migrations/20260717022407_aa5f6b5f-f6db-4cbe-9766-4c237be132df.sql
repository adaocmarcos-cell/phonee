
-- ============================================================================
-- 1) Snapshot de custo em sale_items
-- ============================================================================
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0;

-- Backfill único e documentado: aproxima o custo histórico das vendas
-- existentes com o cost_price ATUAL do produto. Novas vendas passam a gravar
-- o custo real no momento da venda via create_sale/update_sale_with_stock.
UPDATE public.sale_items si
   SET unit_cost = COALESCE(p.cost_price, 0)
  FROM public.products p
 WHERE si.product_id = p.id
   AND si.unit_cost = 0
   AND COALESCE(si.is_service, false) = false;

COMMENT ON COLUMN public.sale_items.unit_cost IS
  'Custo unitário do produto no momento da venda (snapshot). Preenchido por create_sale/update_sale_with_stock a partir de products.cost_price. Vendas anteriores foram aproximadas pelo custo vigente no backfill inicial.';

CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON public.sale_items(sale_id);

-- ============================================================================
-- 2) create_sale — grava unit_cost do produto no momento da venda
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_sale(
  _store_id uuid,
  _customer_id uuid,
  _customer_name text,
  _customer_doc text,
  _customer_whatsapp text,
  _payment_method public.payment_method,
  _installments integer,
  _discount numeric,
  _notes text,
  _items jsonb,
  _payments jsonb,
  _trade_in jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_sale_id uuid; v_sale_number int; v_item jsonb; v_pay jsonb;
  v_subtotal numeric := 0; v_total numeric; v_qty int; v_price numeric;
  v_disc numeric; v_line_total numeric; v_pid uuid; v_is_service boolean;
  v_stock int; v_pay_sum numeric := 0; v_uid uuid := auth.uid();
  v_allow_negative boolean := false; v_extra jsonb;
  v_freight numeric := 0; v_other numeric := 0;
  v_trade_in_id uuid := NULL; v_needs_repair boolean := false;
  v_new_status public.trade_in_status; v_pay_trade_id uuid;
  v_troca_count int := 0; v_seller_id uuid;
  v_unit_cost numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (public.is_owner(v_uid, _store_id) OR public.user_has_store_access(v_uid, _store_id)) THEN
    RAISE EXCEPTION 'sem acesso a esta loja';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'venda precisa de ao menos um item';
  END IF;

  SELECT COALESCE(allow_negative_stock, false) INTO v_allow_negative
    FROM public.stores WHERE id = _store_id;

  BEGIN v_extra := _notes::jsonb; EXCEPTION WHEN others THEN v_extra := NULL; END;
  v_freight := COALESCE((v_extra->'extras'->'payment'->>'freight')::numeric, 0);
  v_other   := COALESCE((v_extra->'extras'->'payment'->>'other_expenses')::numeric, 0);

  v_seller_id := NULLIF(v_extra->'extras'->>'seller_id','')::uuid;
  IF v_seller_id IS NULL THEN v_seller_id := v_uid; END IF;
  IF NOT public.user_has_store_access(v_seller_id, _store_id) THEN
    v_seller_id := v_uid;
  END IF;

  INSERT INTO public.sales (
    store_id, seller_id, customer_id,
    customer_name, customer_doc, customer_whatsapp,
    payment_method, installments, discount, subtotal, total, notes
  ) VALUES (
    _store_id, v_seller_id, _customer_id,
    _customer_name, _customer_doc, _customer_whatsapp,
    _payment_method, COALESCE(_installments, 1), COALESCE(_discount, 0), 0, 0, _notes
  ) RETURNING id, sale_number INTO v_sale_id, v_sale_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_pid        := NULLIF(v_item->>'product_id','')::uuid;
    v_qty        := COALESCE((v_item->>'quantity')::int, 0);
    v_price      := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_disc       := COALESCE((v_item->>'discount_amount')::numeric, 0);
    v_is_service := COALESCE((v_item->>'is_service')::boolean, false);
    v_unit_cost  := 0;

    IF v_qty <= 0 THEN RAISE EXCEPTION 'quantidade inválida no item'; END IF;
    IF v_price < 0 THEN RAISE EXCEPTION 'preço unitário inválido no item'; END IF;

    IF NOT v_is_service THEN
      IF v_pid IS NULL THEN RAISE EXCEPTION 'item de produto sem product_id'; END IF;
      IF v_allow_negative THEN
        UPDATE public.products SET stock_current = stock_current - v_qty, last_sold_at = now()
         WHERE id = v_pid AND store_id = _store_id
         RETURNING stock_current, COALESCE(cost_price, 0) INTO v_stock, v_unit_cost;
        IF NOT FOUND THEN RAISE EXCEPTION 'produto % não encontrado nesta loja', v_pid USING ERRCODE='P0001'; END IF;
      ELSE
        UPDATE public.products SET stock_current = stock_current - v_qty, last_sold_at = now()
         WHERE id = v_pid AND store_id = _store_id AND stock_current >= v_qty
         RETURNING stock_current, COALESCE(cost_price, 0) INTO v_stock, v_unit_cost;
        IF NOT FOUND THEN RAISE EXCEPTION 'estoque insuficiente para o produto %', v_pid USING ERRCODE='P0001'; END IF;
      END IF;
    END IF;

    v_line_total := (v_qty * v_price) - v_disc;

    INSERT INTO public.sale_items (
      sale_id, product_id, is_service, description,
      quantity, unit_price, total, unit_cost,
      name, sku, category, brand, model, unit,
      discount_amount, warranty_days, imei_serial
    ) VALUES (
      v_sale_id,
      CASE WHEN v_is_service THEN NULL ELSE v_pid END,
      v_is_service,
      NULLIF(v_item->>'description',''),
      v_qty, v_price, v_line_total, v_unit_cost,
      NULLIF(v_item->>'name',''),
      NULLIF(v_item->>'sku',''),
      NULLIF(v_item->>'category',''),
      NULLIF(v_item->>'brand',''),
      NULLIF(v_item->>'model',''),
      NULLIF(v_item->>'unit',''),
      v_disc,
      NULLIF(v_item->>'warranty_days','')::int,
      NULLIF(v_item->>'imei_serial','')
    );

    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  v_total := v_subtotal - COALESCE(_discount, 0) + v_freight + v_other;
  IF v_total < 0 THEN RAISE EXCEPTION 'desconto maior que o subtotal'; END IF;

  UPDATE public.sales SET subtotal = v_subtotal, total = v_total WHERE id = v_sale_id;

  IF _trade_in IS NOT NULL AND jsonb_typeof(_trade_in) = 'object' THEN
    v_needs_repair := COALESCE((_trade_in->>'needs_repair')::boolean, false);
    v_new_status := CASE WHEN v_needs_repair THEN 'em_avaliacao'::public.trade_in_status
                         ELSE 'em_estoque'::public.trade_in_status END;

    INSERT INTO public.trade_ins (
      store_id, created_by, customer_name, customer_doc, customer_phone,
      imei, brand, model, storage_gb, color, condition, battery_health,
      entry_value, intended_sale_value, checklist, photos_in, photos_out,
      notes, status, received_in_sale_id, repair_costs, repair_parts,
      scrap_for_parts, entry_expense_id
    ) VALUES (
      _store_id, v_uid,
      COALESCE(NULLIF(_trade_in->>'customer_name',''), _customer_name, 'Cliente'),
      NULLIF(_trade_in->>'customer_doc',''),
      NULLIF(_trade_in->>'customer_phone',''),
      NULLIF(_trade_in->>'imei',''),
      NULLIF(_trade_in->>'brand',''),
      COALESCE(NULLIF(_trade_in->>'model',''), 'Aparelho'),
      NULLIF(_trade_in->>'storage_gb',''),
      NULLIF(_trade_in->>'color',''),
      COALESCE((_trade_in->>'condition')::public.trade_in_condition, 'bom'::public.trade_in_condition),
      NULLIF(_trade_in->>'battery_health','')::int,
      COALESCE((_trade_in->>'entry_value')::numeric, 0),
      COALESCE((_trade_in->>'intended_sale_value')::numeric, (_trade_in->>'entry_value')::numeric, 0),
      COALESCE(_trade_in->'checklist', '{}'::jsonb),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(_trade_in->'photos_in')), ARRAY[]::text[]),
      ARRAY[]::text[],
      NULLIF(_trade_in->>'notes',''),
      v_new_status,
      v_sale_id, 0, '[]'::jsonb, false, NULL
    ) RETURNING id INTO v_trade_in_id;
  END IF;

  IF _payments IS NOT NULL AND jsonb_array_length(_payments) > 0 THEN
    FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
      v_pay_trade_id := NULLIF(v_pay->>'trade_in_id','')::uuid;
      IF (v_pay->>'method') = 'troca' THEN
        v_troca_count := v_troca_count + 1;
        IF v_troca_count > 1 THEN RAISE EXCEPTION 'só é permitida uma parcela de troca por venda'; END IF;
        IF v_pay_trade_id IS NULL AND v_trade_in_id IS NOT NULL THEN v_pay_trade_id := v_trade_in_id; END IF;
        IF v_pay_trade_id IS NULL THEN RAISE EXCEPTION 'parcela de troca sem aparelho vinculado'; END IF;
        UPDATE public.trade_ins
           SET received_in_sale_id = COALESCE(received_in_sale_id, v_sale_id),
               status = CASE WHEN status IN ('em_avaliacao','aprovado') AND NOT COALESCE(
                              (SELECT true FROM public.trade_ins t2 WHERE t2.id = v_pay_trade_id AND t2.repair_costs > 0), false)
                             THEN 'em_estoque'::public.trade_in_status
                             ELSE status END
         WHERE id = v_pay_trade_id AND store_id = _store_id;
      END IF;

      INSERT INTO public.sale_payments (sale_id, store_id, method, amount, installments, notes, trade_in_id)
      VALUES (
        v_sale_id, _store_id,
        v_pay->>'method',
        (v_pay->>'amount')::numeric,
        NULLIF(v_pay->>'installments','')::int,
        NULLIF(v_pay->>'notes',''),
        v_pay_trade_id
      );
      v_pay_sum := v_pay_sum + (v_pay->>'amount')::numeric;
    END LOOP;

    IF round(v_pay_sum, 2) <> round(v_total, 2) THEN
      RAISE EXCEPTION 'soma dos pagamentos (%) diferente do total (%)', v_pay_sum, v_total;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sale_id',     v_sale_id,
    'sale_number', v_sale_number,
    'subtotal',    v_subtotal,
    'total',       v_total,
    'trade_in_id', v_trade_in_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, text, text, text, public.payment_method, integer, numeric, text, jsonb, jsonb, jsonb) TO authenticated;

-- ============================================================================
-- 3) update_sale_with_stock — grava unit_cost do produto ao reaplicar itens
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_sale_with_stock(
  _sale_id uuid,
  _customer_id uuid,
  _customer_name text,
  _customer_doc text,
  _customer_whatsapp text,
  _payment_method public.payment_method,
  _installments integer,
  _discount numeric,
  _notes text,
  _items jsonb,
  _payments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store_id uuid; v_uid uuid := auth.uid();
  v_item jsonb; v_pay jsonb;
  v_subtotal numeric := 0; v_total numeric; v_old_total numeric;
  v_qty int; v_price numeric; v_pid uuid; v_is_service boolean; v_stock int;
  v_pay_sum numeric := 0; v_allow_negative boolean := false;
  v_had_trade boolean := false; v_new_has_trade boolean := false;
  v_before jsonb; v_after jsonb; r record;
  v_unit_cost numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;

  SELECT store_id, total INTO v_store_id, v_old_total
  FROM public.sales WHERE id = _sale_id;

  IF v_store_id IS NULL THEN RAISE EXCEPTION 'venda não encontrada'; END IF;
  IF NOT public.user_has_store_access(v_uid, v_store_id) THEN
    RAISE EXCEPTION 'sem acesso a esta loja' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(allow_negative_stock, false) INTO v_allow_negative
    FROM public.stores WHERE id = v_store_id;

  SELECT EXISTS(SELECT 1 FROM public.sale_payments WHERE sale_id = _sale_id AND trade_in_id IS NOT NULL)
    INTO v_had_trade;

  IF v_had_trade AND _payments IS NOT NULL THEN
    FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
      IF (v_pay->>'method') = 'troca' THEN v_new_has_trade := true; EXIT; END IF;
    END LOOP;
    IF NOT v_new_has_trade THEN
      RAISE EXCEPTION 'Esta venda tem parcela de troca vinculada a um trade-in. Cancele a venda em vez de remover a troca pela edição.';
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'name', name, 'is_service', is_service,
    'quantity', quantity, 'unit_price', unit_price, 'total', total
  )) INTO v_before FROM public.sale_items WHERE sale_id = _sale_id;

  FOR r IN
    SELECT product_id, quantity FROM public.sale_items
    WHERE sale_id = _sale_id AND is_service = false AND product_id IS NOT NULL
  LOOP
    UPDATE public.products SET stock_current = COALESCE(stock_current,0) + r.quantity WHERE id = r.product_id;
  END LOOP;

  DELETE FROM public.sale_items WHERE sale_id = _sale_id;
  DELETE FROM public.sale_payments WHERE sale_id = _sale_id;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'venda precisa de ao menos um item';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_pid        := NULLIF(v_item->>'product_id','')::uuid;
    v_qty        := COALESCE((v_item->>'quantity')::int, 0);
    v_price      := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_is_service := COALESCE((v_item->>'is_service')::boolean, false);
    v_unit_cost  := 0;

    IF v_qty <= 0 THEN RAISE EXCEPTION 'quantidade inválida no item'; END IF;
    IF v_price < 0 THEN RAISE EXCEPTION 'preço unitário inválido no item'; END IF;

    IF NOT v_is_service THEN
      IF v_pid IS NULL THEN RAISE EXCEPTION 'item de produto sem product_id'; END IF;
      IF v_allow_negative THEN
        UPDATE public.products SET stock_current = stock_current - v_qty, last_sold_at = now()
         WHERE id = v_pid AND store_id = v_store_id
         RETURNING stock_current, COALESCE(cost_price, 0) INTO v_stock, v_unit_cost;
        IF NOT FOUND THEN RAISE EXCEPTION 'produto % não encontrado', v_pid; END IF;
      ELSE
        UPDATE public.products SET stock_current = stock_current - v_qty, last_sold_at = now()
         WHERE id = v_pid AND store_id = v_store_id AND stock_current >= v_qty
         RETURNING stock_current, COALESCE(cost_price, 0) INTO v_stock, v_unit_cost;
        IF NOT FOUND THEN RAISE EXCEPTION 'estoque insuficiente para o produto %', v_pid; END IF;
      END IF;
    END IF;

    INSERT INTO public.sale_items (
      sale_id, product_id, is_service, description,
      quantity, unit_price, total, unit_cost,
      name, sku, category, brand, model, unit,
      discount_amount, warranty_days, imei_serial
    ) VALUES (
      _sale_id,
      CASE WHEN v_is_service THEN NULL ELSE v_pid END,
      v_is_service,
      NULLIF(v_item->>'description',''),
      v_qty, v_price, v_qty * v_price, v_unit_cost,
      NULLIF(v_item->>'name',''),
      NULLIF(v_item->>'sku',''),
      NULLIF(v_item->>'category',''),
      NULLIF(v_item->>'brand',''),
      NULLIF(v_item->>'model',''),
      NULLIF(v_item->>'unit',''),
      COALESCE((v_item->>'discount_amount')::numeric, 0),
      NULLIF(v_item->>'warranty_days','')::int,
      NULLIF(v_item->>'imei_serial','')
    );

    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  v_total := v_subtotal - COALESCE(_discount, 0);
  IF v_total < 0 THEN RAISE EXCEPTION 'desconto maior que o subtotal'; END IF;

  UPDATE public.sales
     SET customer_id = _customer_id, customer_name = _customer_name,
         customer_doc = _customer_doc, customer_whatsapp = _customer_whatsapp,
         payment_method = _payment_method, installments = COALESCE(_installments, 1),
         discount = COALESCE(_discount, 0), subtotal = v_subtotal, total = v_total,
         notes = _notes, updated_at = now()
   WHERE id = _sale_id;

  IF _payments IS NOT NULL AND jsonb_array_length(_payments) > 0 THEN
    FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
      INSERT INTO public.sale_payments (sale_id, store_id, method, amount, installments, notes, trade_in_id)
      VALUES (
        _sale_id, v_store_id,
        v_pay->>'method',
        (v_pay->>'amount')::numeric,
        NULLIF(v_pay->>'installments','')::int,
        NULLIF(v_pay->>'notes',''),
        NULLIF(v_pay->>'trade_in_id','')::uuid
      );
      v_pay_sum := v_pay_sum + (v_pay->>'amount')::numeric;
    END LOOP;
    IF round(v_pay_sum, 2) <> round(v_total, 2) THEN
      RAISE EXCEPTION 'soma dos pagamentos (%) diferente do total (%)', v_pay_sum, v_total;
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'name', name, 'is_service', is_service,
    'quantity', quantity, 'unit_price', unit_price, 'total', total
  )) INTO v_after FROM public.sale_items WHERE sale_id = _sale_id;

  INSERT INTO public.audit_log (user_id, store_id, action, entity, entity_id, details)
  VALUES (v_uid, v_store_id, 'edicao', 'sale', _sale_id,
    jsonb_build_object(
      'antes', jsonb_build_object('total', v_old_total, 'items', v_before),
      'depois', jsonb_build_object('total', v_total, 'items', v_after)
    ));

  RETURN jsonb_build_object('sale_id', _sale_id, 'subtotal', v_subtotal, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.update_sale_with_stock(uuid, uuid, text, text, text, payment_method, integer, numeric, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_sale_with_stock(uuid, uuid, text, text, text, payment_method, integer, numeric, text, jsonb, jsonb) TO authenticated;

-- ============================================================================
-- 4) get_dashboard_metrics — TODO em uma chamada, respeitando RLS
--    Regras únicas:
--      * Receita de OS  = apenas status = 'entregue'
--      * Receita venda  = COALESCE(net_value, total) - COALESCE(returned_total,0)
--      * Recebido caixa = sale_payments.amount onde method <> 'troca'
--                          + total_value das OSs entregues
--      * Recebido em troca = sale_payments.amount onde method = 'troca'
--      * Custo          = SUM(sale_items.unit_cost * quantity) das vendas no
--                          período + parts_value das OSs entregues no período
--      * Despesas       = expenses no intervalo [from,to] FECHADO
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  _store_id uuid,
  _from timestamptz,
  _to   timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  v_today_from timestamptz := date_trunc('day', now());
  v_today_to   timestamptz := date_trunc('day', now()) + interval '1 day' - interval '1 microsecond';

  v_sales_revenue numeric := 0;
  v_sales_count int := 0;
  v_sales_revenue_today numeric := 0;

  v_os_revenue numeric := 0;
  v_os_revenue_today numeric := 0;
  v_os_cost numeric := 0;
  v_os_paid numeric := 0;

  v_products_cost numeric := 0;

  v_recebido_caixa numeric := 0;
  v_recebido_troca numeric := 0;

  v_expenses numeric := 0;

  v_pay jsonb; v_serie jsonb; v_top jsonb;
BEGIN
  -- Vendas no período
  SELECT
    COALESCE(SUM(COALESCE(s.net_value, s.total) - COALESCE(s.returned_total, 0)), 0),
    COUNT(*),
    COALESCE(SUM(CASE
      WHEN s.created_at >= v_today_from AND s.created_at <= v_today_to
      THEN COALESCE(s.net_value, s.total) - COALESCE(s.returned_total, 0)
      ELSE 0 END), 0)
  INTO v_sales_revenue, v_sales_count, v_sales_revenue_today
  FROM public.sales s
  WHERE s.store_id = _store_id
    AND s.created_at >= _from
    AND s.created_at <= _to;

  -- OS entregues no período (uso end_date quando existe, senão created_at)
  SELECT
    COALESCE(SUM(o.total_value), 0),
    COALESCE(SUM(o.parts_value), 0),
    COALESCE(SUM(CASE
      WHEN COALESCE(o.end_date::timestamptz, o.created_at) >= v_today_from
       AND COALESCE(o.end_date::timestamptz, o.created_at) <= v_today_to
      THEN o.total_value ELSE 0 END), 0)
  INTO v_os_revenue, v_os_cost, v_os_revenue_today
  FROM public.service_orders o
  WHERE o.store_id = _store_id
    AND o.status = 'entregue'::public.os_status
    AND COALESCE(o.end_date::timestamptz, o.created_at) >= _from
    AND COALESCE(o.end_date::timestamptz, o.created_at) <= _to;

  v_os_paid := v_os_revenue;

  -- Custo dos produtos vendidos (snapshot unit_cost)
  SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0)
    INTO v_products_cost
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
   WHERE s.store_id = _store_id
     AND s.created_at >= _from AND s.created_at <= _to
     AND COALESCE(si.is_service, false) = false;

  -- Recebido em caixa e em troca (a partir dos splits de pagamento)
  SELECT
    COALESCE(SUM(CASE WHEN sp.method <> 'troca' THEN sp.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN sp.method =  'troca' THEN sp.amount ELSE 0 END), 0)
  INTO v_recebido_caixa, v_recebido_troca
  FROM public.sale_payments sp
  JOIN public.sales s ON s.id = sp.sale_id
  WHERE s.store_id = _store_id
    AND s.created_at >= _from AND s.created_at <= _to;

  -- Fallback: vendas sem splits (legado) — considera total como caixa (não troca)
  v_recebido_caixa := v_recebido_caixa + COALESCE((
    SELECT SUM(COALESCE(s.net_value, s.total) - COALESCE(s.returned_total, 0))
      FROM public.sales s
     WHERE s.store_id = _store_id
       AND s.created_at >= _from AND s.created_at <= _to
       AND NOT EXISTS (SELECT 1 FROM public.sale_payments sp2 WHERE sp2.sale_id = s.id)
  ), 0);

  -- OS entregues contam como recebimento em caixa
  v_recebido_caixa := v_recebido_caixa + v_os_paid;

  -- Despesas no intervalo FECHADO
  SELECT COALESCE(SUM(amount), 0) INTO v_expenses
    FROM public.expenses
   WHERE store_id = _store_id
     AND expense_date >= _from::date
     AND expense_date <= _to::date;

  -- Formas de pagamento (splits + fallback do método da venda)
  WITH pays AS (
    SELECT sp.method AS name, SUM(sp.amount) AS value
      FROM public.sale_payments sp
      JOIN public.sales s ON s.id = sp.sale_id
     WHERE s.store_id = _store_id
       AND s.created_at >= _from AND s.created_at <= _to
     GROUP BY sp.method
    UNION ALL
    SELECT s.payment_method::text AS name,
           SUM(COALESCE(s.net_value, s.total) - COALESCE(s.returned_total,0)) AS value
      FROM public.sales s
     WHERE s.store_id = _store_id
       AND s.created_at >= _from AND s.created_at <= _to
       AND NOT EXISTS (SELECT 1 FROM public.sale_payments sp WHERE sp.sale_id = s.id)
     GROUP BY s.payment_method
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC), '[]'::jsonb)
    INTO v_pay
  FROM (
    SELECT name, SUM(value) AS value FROM pays WHERE value > 0 GROUP BY name
  ) p;

  -- Série diária (vendas + OS entregues)
  WITH d AS (
    SELECT (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
           COALESCE(s.net_value, s.total) - COALESCE(s.returned_total,0) AS total
      FROM public.sales s
     WHERE s.store_id = _store_id
       AND s.created_at >= _from AND s.created_at <= _to
    UNION ALL
    SELECT (COALESCE(o.end_date::timestamptz, o.created_at) AT TIME ZONE 'America/Sao_Paulo')::date AS day,
           o.total_value AS total
      FROM public.service_orders o
     WHERE o.store_id = _store_id
       AND o.status = 'entregue'::public.os_status
       AND COALESCE(o.end_date::timestamptz, o.created_at) >= _from
       AND COALESCE(o.end_date::timestamptz, o.created_at) <= _to
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', to_char(day, 'DD/MM'), 'total', total) ORDER BY day), '[]'::jsonb)
    INTO v_serie
  FROM (SELECT day, SUM(total) AS total FROM d GROUP BY day ORDER BY day) t;

  -- Top produtos por receita
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', name, 'qty', qty, 'revenue', revenue
         ) ORDER BY revenue DESC), '[]'::jsonb)
    INTO v_top
    FROM (
      SELECT COALESCE(si.name, p.name, '—') AS name,
             SUM(si.quantity)::int AS qty,
             SUM(si.total) AS revenue
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
        LEFT JOIN public.products p ON p.id = si.product_id
       WHERE s.store_id = _store_id
         AND s.created_at >= _from AND s.created_at <= _to
         AND COALESCE(si.is_service, false) = false
       GROUP BY COALESCE(si.name, p.name, '—')
       ORDER BY SUM(si.total) DESC
       LIMIT 5
    ) tp;

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
    'periodo', jsonb_build_object('from', _from, 'to', _to)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_metrics(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid, timestamptz, timestamptz) TO authenticated;
