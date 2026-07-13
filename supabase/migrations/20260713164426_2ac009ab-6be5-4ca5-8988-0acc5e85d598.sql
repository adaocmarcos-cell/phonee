
CREATE OR REPLACE FUNCTION public.create_sale(
  _store_id uuid,
  _customer_id uuid,
  _customer_name text,
  _customer_doc text,
  _customer_whatsapp text,
  _payment_method public.payment_method,
  _installments int,
  _discount numeric,
  _notes text,
  _items jsonb,
  _payments jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale_id uuid;
  v_sale_number int;
  v_item jsonb;
  v_pay jsonb;
  v_subtotal numeric := 0;
  v_total numeric;
  v_qty int;
  v_price numeric;
  v_disc numeric;
  v_line_total numeric;
  v_pid uuid;
  v_is_service boolean;
  v_stock int;
  v_pay_sum numeric := 0;
  v_uid uuid := auth.uid();
  v_allow_negative boolean := false;
  v_extra jsonb;
  v_freight numeric := 0;
  v_other numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF NOT (public.is_owner(v_uid, _store_id) OR public.user_has_store_access(v_uid, _store_id)) THEN
    RAISE EXCEPTION 'sem acesso a esta loja';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'venda precisa de ao menos um item';
  END IF;

  SELECT COALESCE(allow_negative_stock, false)
    INTO v_allow_negative
    FROM public.stores
   WHERE id = _store_id;

  -- Parse seguro do _notes para extrair frete/outras despesas
  BEGIN
    v_extra := _notes::jsonb;
  EXCEPTION WHEN others THEN
    v_extra := NULL;
  END;
  v_freight := COALESCE((v_extra->'extras'->'payment'->>'freight')::numeric, 0);
  v_other   := COALESCE((v_extra->'extras'->'payment'->>'other_expenses')::numeric, 0);

  INSERT INTO public.sales (
    store_id, seller_id, customer_id,
    customer_name, customer_doc, customer_whatsapp,
    payment_method, installments, discount, subtotal, total, notes
  )
  VALUES (
    _store_id, v_uid, _customer_id,
    _customer_name, _customer_doc, _customer_whatsapp,
    _payment_method, COALESCE(_installments, 1), COALESCE(_discount, 0), 0, 0, _notes
  )
  RETURNING id, sale_number INTO v_sale_id, v_sale_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_pid        := NULLIF(v_item->>'product_id','')::uuid;
    v_qty        := COALESCE((v_item->>'quantity')::int, 0);
    v_price      := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_disc       := COALESCE((v_item->>'discount_amount')::numeric, 0);
    v_is_service := COALESCE((v_item->>'is_service')::boolean, false);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'quantidade inválida no item';
    END IF;
    IF v_price < 0 THEN
      RAISE EXCEPTION 'preço unitário inválido no item';
    END IF;

    IF NOT v_is_service THEN
      IF v_pid IS NULL THEN
        RAISE EXCEPTION 'item de produto sem product_id';
      END IF;

      IF v_allow_negative THEN
        UPDATE public.products
           SET stock_current = stock_current - v_qty,
               last_sold_at  = now()
         WHERE id = v_pid
           AND store_id = _store_id
         RETURNING stock_current INTO v_stock;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'produto % não encontrado nesta loja', v_pid
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        UPDATE public.products
           SET stock_current = stock_current - v_qty,
               last_sold_at  = now()
         WHERE id = v_pid
           AND store_id = _store_id
           AND stock_current >= v_qty
         RETURNING stock_current INTO v_stock;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'estoque insuficiente para o produto %', v_pid
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;

    v_line_total := (v_qty * v_price) - v_disc;

    INSERT INTO public.sale_items (
      sale_id, product_id, is_service, description,
      quantity, unit_price, total,
      name, sku, category, brand, model, unit,
      discount_amount, warranty_days, imei_serial
    ) VALUES (
      v_sale_id,
      CASE WHEN v_is_service THEN NULL ELSE v_pid END,
      v_is_service,
      NULLIF(v_item->>'description',''),
      v_qty, v_price, v_line_total,
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
  IF v_total < 0 THEN
    RAISE EXCEPTION 'desconto maior que o subtotal';
  END IF;

  UPDATE public.sales
     SET subtotal = v_subtotal,
         total    = v_total
   WHERE id = v_sale_id;

  IF _payments IS NOT NULL AND jsonb_array_length(_payments) > 0 THEN
    FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
      INSERT INTO public.sale_payments (sale_id, store_id, method, amount, installments, notes)
      VALUES (
        v_sale_id, _store_id,
        v_pay->>'method',
        (v_pay->>'amount')::numeric,
        NULLIF(v_pay->>'installments','')::int,
        NULLIF(v_pay->>'notes','')
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
    'total',       v_total
  );
END;
$$;


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
  v_disc numeric;
  v_line_total numeric;
  v_pid uuid;
  v_is_service boolean;
  v_stock int;
  v_pay_sum numeric := 0;
  v_allow_negative boolean := false;
  v_had_trade boolean := false;
  v_new_has_trade boolean := false;
  v_before jsonb;
  v_after jsonb;
  v_extra jsonb;
  v_freight numeric := 0;
  v_other numeric := 0;
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

  BEGIN
    v_extra := _notes::jsonb;
  EXCEPTION WHEN others THEN
    v_extra := NULL;
  END;
  v_freight := COALESCE((v_extra->'extras'->'payment'->>'freight')::numeric, 0);
  v_other   := COALESCE((v_extra->'extras'->'payment'->>'other_expenses')::numeric, 0);

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

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'name', name, 'is_service', is_service,
    'quantity', quantity, 'unit_price', unit_price, 'total', total
  )) INTO v_before
  FROM public.sale_items WHERE sale_id = _sale_id;

  FOR r IN
    SELECT product_id, quantity FROM public.sale_items
    WHERE sale_id = _sale_id AND is_service = false AND product_id IS NOT NULL
  LOOP
    UPDATE public.products
       SET stock_current = COALESCE(stock_current,0) + r.quantity
     WHERE id = r.product_id;
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
    v_disc       := COALESCE((v_item->>'discount_amount')::numeric, 0);
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

    v_line_total := (v_qty * v_price) - v_disc;

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
      v_qty, v_price, v_line_total,
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
