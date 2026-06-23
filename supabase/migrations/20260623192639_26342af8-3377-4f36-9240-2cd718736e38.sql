
CREATE OR REPLACE FUNCTION public.create_purchase_with_stock(
  _store_id uuid,
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
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_name text;
  v_qty numeric;
  v_unit_cost numeric;
  v_existing_stock numeric;
  v_total numeric := 0;
  v_created int := 0;
  v_updated int := 0;
  v_total_units numeric := 0;
  v_now timestamptz := now();
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Total da compra
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_total := v_total + (COALESCE((v_item->>'quantity')::numeric,0) * COALESCE((v_item->>'unit_cost')::numeric,0));
  END LOOP;

  -- Cria o pedido (já recebido)
  INSERT INTO public.purchase_orders (
    store_id, supplier_id, supplier, status, total_cost, notes,
    payment_method, expected_delivery_at, received_at, sent_at,
    payment_status, paid_at, due_date, tags
  ) VALUES (
    _store_id, _supplier_id, _supplier_name, 'recebido', v_total, _notes,
    _payment_method, _expected_delivery_at, v_now, v_now,
    COALESCE(_payment_status,'a_pagar'),
    CASE WHEN _payment_status = 'pago' THEN v_now ELSE NULL END,
    _due_date, _tags
  ) RETURNING id INTO v_order_id;

  -- Itens + sincronização de estoque
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_name := trim(both ' ' from (v_item->>'product_name'));
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;

    IF v_qty <= 0 OR v_name = '' THEN
      CONTINUE;
    END IF;

    IF v_product_id IS NULL THEN
      SELECT id, stock_current INTO v_product_id, v_existing_stock
      FROM public.products
      WHERE store_id = _store_id AND name ILIKE v_name
      LIMIT 1;
    ELSE
      SELECT stock_current INTO v_existing_stock
      FROM public.products WHERE id = v_product_id;
    END IF;

    IF v_product_id IS NULL THEN
      INSERT INTO public.products (
        store_id, name, category, condition, status,
        cost_price, sale_price, stock_current, stock_min
      ) VALUES (
        _store_id, v_name, 'acessorio', 'novo', 'ativo',
        v_unit_cost, v_unit_cost, v_qty, 0
      ) RETURNING id INTO v_product_id;
      v_created := v_created + 1;
    ELSE
      UPDATE public.products
        SET stock_current = COALESCE(v_existing_stock,0) + v_qty,
            cost_price = CASE WHEN v_unit_cost > 0 THEN v_unit_cost ELSE cost_price END
        WHERE id = v_product_id;
      v_updated := v_updated + 1;
    END IF;

    INSERT INTO public.purchase_order_items (
      order_id, product_id, product_name, quantity, unit_cost, total, notes
    ) VALUES (
      v_order_id, v_product_id, v_name, v_qty, v_unit_cost, v_qty * v_unit_cost,
      NULLIF(v_item->>'notes','')
    );

    v_total_units := v_total_units + v_qty;
  END LOOP;

  -- Lança despesa se pago
  IF _create_expense AND _payment_status = 'pago' AND v_total > 0 THEN
    INSERT INTO public.expenses (
      store_id, category_name, subcategory, description, amount,
      expense_date, payment_method, notes
    ) VALUES (
      _store_id, 'Compras / Mercadorias', _supplier_name,
      'Entrada de mercadorias' ||
        COALESCE(' · ' || _supplier_name, '') ||
        CASE WHEN _tags IS NOT NULL AND array_length(_tags,1) > 0
             THEN ' · ' || array_to_string(_tags, ', ') ELSE '' END,
      v_total, current_date, _payment_method, _notes
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'total', v_total,
    'created', v_created,
    'updated', v_updated,
    'total_units', v_total_units
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_purchase_with_stock(uuid,uuid,text,text,text,date,timestamptz,text,text[],jsonb,boolean) TO authenticated;
