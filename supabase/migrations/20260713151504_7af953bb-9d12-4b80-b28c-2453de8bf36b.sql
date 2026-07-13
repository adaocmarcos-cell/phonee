
-- ============================================================================
-- update_purchase_with_stock — edita uma compra recalculando estoque por delta
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_purchase_with_stock(
  _order_id uuid,
  _supplier_id uuid,
  _supplier_name text,
  _payment_method text,
  _payment_status text,
  _due_date date,
  _expected_delivery_at timestamptz,
  _notes text,
  _tags text[],
  _items jsonb,
  _create_expense boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_product_id uuid;
  v_name text;
  v_qty numeric;
  v_unit_cost numeric;
  v_old_qty numeric;
  v_delta numeric;
  v_existing_stock numeric;
  v_total numeric := 0;
  v_old_total numeric;
  v_now timestamptz := now();
  v_before jsonb;
  v_after jsonb;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT store_id, total_cost INTO v_store_id, v_old_total
  FROM public.purchase_orders WHERE id = _order_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'pedido não encontrado';
  END IF;

  IF NOT public.user_has_store_access(v_uid, v_store_id) THEN
    RAISE EXCEPTION 'sem acesso a esta loja' USING ERRCODE = '42501';
  END IF;

  -- Snapshot "antes" (itens antigos)
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'name', product_name,
    'quantity', quantity, 'unit_cost', unit_cost, 'total', total
  )) INTO v_before
  FROM public.purchase_order_items WHERE order_id = _order_id;

  -- Novo total
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_total := v_total + (COALESCE((v_item->>'quantity')::numeric,0) * COALESCE((v_item->>'unit_cost')::numeric,0));
  END LOOP;

  -- 1) Devolve TODO o estoque dos itens antigos (delta reverso)
  FOR r IN
    SELECT product_id, quantity FROM public.purchase_order_items
    WHERE order_id = _order_id AND product_id IS NOT NULL
  LOOP
    -- Reduzimos o estoque em qty; se ficar negativo, produto já foi vendido
    SELECT stock_current, name INTO v_existing_stock, v_name
    FROM public.products WHERE id = r.product_id;
    IF (COALESCE(v_existing_stock,0) - r.quantity) < 0 THEN
      RAISE EXCEPTION 'Não é possível reduzir %: % unidades já foram vendidas',
        COALESCE(v_name, r.product_id::text),
        (r.quantity - COALESCE(v_existing_stock,0));
    END IF;
    UPDATE public.products
       SET stock_current = COALESCE(stock_current,0) - r.quantity
     WHERE id = r.product_id;
  END LOOP;

  -- 2) Limpa itens antigos, despesa antiga vinculada e recria
  DELETE FROM public.purchase_order_items WHERE order_id = _order_id;

  UPDATE public.purchase_orders
     SET supplier_id = _supplier_id,
         supplier = _supplier_name,
         payment_method = _payment_method,
         payment_status = COALESCE(_payment_status, 'a_pagar'),
         paid_at = CASE WHEN _payment_status = 'pago' THEN COALESCE(paid_at, v_now) ELSE NULL END,
         due_date = _due_date,
         expected_delivery_at = _expected_delivery_at,
         notes = _notes,
         tags = _tags,
         total_cost = v_total,
         updated_at = v_now
   WHERE id = _order_id;

  -- 3) Aplica itens novos (soma no estoque)
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_name := trim(both ' ' from (v_item->>'product_name'));
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;

    IF v_qty <= 0 OR v_name = '' THEN CONTINUE; END IF;

    IF v_product_id IS NULL THEN
      SELECT id INTO v_product_id
      FROM public.products
      WHERE store_id = v_store_id AND name ILIKE v_name
      LIMIT 1;
    END IF;

    IF v_product_id IS NULL THEN
      INSERT INTO public.products (
        store_id, name, category, condition, status,
        cost_price, sale_price, stock_current, stock_min
      ) VALUES (
        v_store_id, v_name, 'acessorio', 'novo', 'ativo',
        v_unit_cost, v_unit_cost, v_qty, 0
      ) RETURNING id INTO v_product_id;
    ELSE
      UPDATE public.products
        SET stock_current = COALESCE(stock_current,0) + v_qty,
            cost_price = CASE WHEN v_unit_cost > 0 THEN v_unit_cost ELSE cost_price END
        WHERE id = v_product_id;
    END IF;

    INSERT INTO public.purchase_order_items (
      order_id, product_id, product_name, quantity, unit_cost, total, notes
    ) VALUES (
      _order_id, v_product_id, v_name, v_qty, v_unit_cost, v_qty * v_unit_cost,
      NULLIF(v_item->>'notes','')
    );
  END LOOP;

  -- 4) Snapshot "depois"
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'name', product_name,
    'quantity', quantity, 'unit_cost', unit_cost, 'total', total
  )) INTO v_after
  FROM public.purchase_order_items WHERE order_id = _order_id;

  -- 5) Auditoria
  INSERT INTO public.audit_log (
    user_id, store_id, action, entity, entity_id, details
  ) VALUES (
    v_uid, v_store_id, 'edicao', 'purchase_order', _order_id,
    jsonb_build_object(
      'antes', jsonb_build_object('total', v_old_total, 'items', v_before),
      'depois', jsonb_build_object('total', v_total, 'items', v_after)
    )
  );

  RETURN jsonb_build_object('order_id', _order_id, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.update_purchase_with_stock(uuid, uuid, text, text, text, date, timestamptz, text, text[], jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_purchase_with_stock(uuid, uuid, text, text, text, date, timestamptz, text, text[], jsonb, boolean) TO authenticated;

-- ============================================================================
-- update_sale_with_stock — edita uma venda recalculando estoque por delta
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_sale_with_stock(
  _sale_id uuid,
  _customer_id uuid,
  _customer_name text,
  _customer_doc text,
  _customer_whatsapp text,
  _payment_method payment_method,
  _installments integer,
  _discount numeric,
  _notes text,
  _items jsonb,
  _payments jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_pay jsonb;
  v_subtotal numeric := 0;
  v_total numeric;
  v_old_total numeric;
  v_qty int;
  v_price numeric;
  v_pid uuid;
  v_is_service boolean;
  v_stock int;
  v_pay_sum numeric := 0;
  v_allow_negative boolean := false;
  v_had_trade boolean := false;
  v_new_has_trade boolean := false;
  v_before jsonb;
  v_after jsonb;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT store_id, total INTO v_store_id, v_old_total
  FROM public.sales WHERE id = _sale_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'venda não encontrada';
  END IF;

  IF NOT public.user_has_store_access(v_uid, v_store_id) THEN
    RAISE EXCEPTION 'sem acesso a esta loja' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(allow_negative_stock, false) INTO v_allow_negative
    FROM public.stores WHERE id = v_store_id;

  -- Trade-in: se existia parcela de troca, não pode ser removida via edição
  SELECT EXISTS(
    SELECT 1 FROM public.sale_payments
    WHERE sale_id = _sale_id AND trade_in_id IS NOT NULL
  ) INTO v_had_trade;

  IF v_had_trade AND _payments IS NOT NULL THEN
    FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
      IF (v_pay->>'method') = 'troca' THEN
        v_new_has_trade := true;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_new_has_trade THEN
      RAISE EXCEPTION 'Esta venda tem parcela de troca vinculada a um trade-in. Cancele a venda em vez de remover a troca pela edição.';
    END IF;
  END IF;

  -- Snapshot "antes"
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'name', name, 'is_service', is_service,
    'quantity', quantity, 'unit_price', unit_price, 'total', total
  )) INTO v_before
  FROM public.sale_items WHERE sale_id = _sale_id;

  -- 1) Devolve o estoque dos itens antigos
  FOR r IN
    SELECT product_id, quantity FROM public.sale_items
    WHERE sale_id = _sale_id AND is_service = false AND product_id IS NOT NULL
  LOOP
    UPDATE public.products
       SET stock_current = COALESCE(stock_current,0) + r.quantity
     WHERE id = r.product_id;
  END LOOP;

  -- 2) Remove itens e pagamentos antigos
  DELETE FROM public.sale_items WHERE sale_id = _sale_id;
  DELETE FROM public.sale_payments WHERE sale_id = _sale_id;

  -- 3) Reaplica itens novos com baixa de estoque
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'venda precisa de ao menos um item';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_pid        := NULLIF(v_item->>'product_id','')::uuid;
    v_qty        := COALESCE((v_item->>'quantity')::int, 0);
    v_price      := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_is_service := COALESCE((v_item->>'is_service')::boolean, false);

    IF v_qty <= 0 THEN RAISE EXCEPTION 'quantidade inválida no item'; END IF;
    IF v_price < 0 THEN RAISE EXCEPTION 'preço unitário inválido no item'; END IF;

    IF NOT v_is_service THEN
      IF v_pid IS NULL THEN RAISE EXCEPTION 'item de produto sem product_id'; END IF;

      IF v_allow_negative THEN
        UPDATE public.products SET stock_current = stock_current - v_qty, last_sold_at = now()
         WHERE id = v_pid AND store_id = v_store_id
         RETURNING stock_current INTO v_stock;
        IF NOT FOUND THEN RAISE EXCEPTION 'produto % não encontrado', v_pid; END IF;
      ELSE
        UPDATE public.products SET stock_current = stock_current - v_qty, last_sold_at = now()
         WHERE id = v_pid AND store_id = v_store_id AND stock_current >= v_qty
         RETURNING stock_current INTO v_stock;
        IF NOT FOUND THEN RAISE EXCEPTION 'estoque insuficiente para o produto %', v_pid; END IF;
      END IF;
    END IF;

    INSERT INTO public.sale_items (
      sale_id, product_id, is_service, description,
      quantity, unit_price, total,
      name, sku, category, brand, model, unit,
      discount_amount, warranty_days, imei_serial
    ) VALUES (
      _sale_id,
      CASE WHEN v_is_service THEN NULL ELSE v_pid END,
      v_is_service,
      NULLIF(v_item->>'description',''),
      v_qty, v_price, v_qty * v_price,
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
     SET customer_id = _customer_id,
         customer_name = _customer_name,
         customer_doc = _customer_doc,
         customer_whatsapp = _customer_whatsapp,
         payment_method = _payment_method,
         installments = COALESCE(_installments, 1),
         discount = COALESCE(_discount, 0),
         subtotal = v_subtotal,
         total = v_total,
         notes = _notes,
         updated_at = now()
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

  -- Snapshot "depois"
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'name', name, 'is_service', is_service,
    'quantity', quantity, 'unit_price', unit_price, 'total', total
  )) INTO v_after
  FROM public.sale_items WHERE sale_id = _sale_id;

  INSERT INTO public.audit_log (
    user_id, store_id, action, entity, entity_id, details
  ) VALUES (
    v_uid, v_store_id, 'edicao', 'sale', _sale_id,
    jsonb_build_object(
      'antes', jsonb_build_object('total', v_old_total, 'items', v_before),
      'depois', jsonb_build_object('total', v_total, 'items', v_after)
    )
  );

  RETURN jsonb_build_object('sale_id', _sale_id, 'subtotal', v_subtotal, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.update_sale_with_stock(uuid, uuid, text, text, text, payment_method, integer, numeric, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_sale_with_stock(uuid, uuid, text, text, text, payment_method, integer, numeric, text, jsonb, jsonb) TO authenticated;
