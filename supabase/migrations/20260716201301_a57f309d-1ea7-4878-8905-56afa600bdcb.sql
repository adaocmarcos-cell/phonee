
-- 1) Colunas faltantes em purchase_order_items
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS purchase_order_items_order_created_idx
  ON public.purchase_order_items (order_id, created_at);

-- 2) Backfill do SKU a partir do produto vinculado
UPDATE public.purchase_order_items poi
   SET sku = p.sku
  FROM public.products p
 WHERE poi.product_id = p.id
   AND poi.sku IS NULL
   AND p.sku IS NOT NULL;

-- 3) Atualiza create_purchase_with_stock para gravar sku
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
  v_sku text;
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
    _due_date, _tags
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_name := trim(both ' ' from (v_item->>'product_name'));
    v_sku := NULLIF(trim(both ' ' from COALESCE(v_item->>'sku','')), '');
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
        store_id, name, sku, category, condition, status,
        cost_price, sale_price, stock_current, stock_min
      ) VALUES (
        _store_id, v_name, v_sku, 'acessorio', 'novo', 'ativo',
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

    -- Se ainda não temos sku do item, tentar puxar do produto
    IF v_sku IS NULL THEN
      SELECT sku INTO v_sku FROM public.products WHERE id = v_product_id;
    END IF;

    INSERT INTO public.purchase_order_items (
      order_id, product_id, product_name, sku, quantity, unit_cost, total, notes, created_at
    ) VALUES (
      v_order_id, v_product_id, v_name, v_sku, v_qty, v_unit_cost, v_qty * v_unit_cost,
      NULLIF(v_item->>'notes',''), v_now
    );

    v_total_units := v_total_units + v_qty;
  END LOOP;

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

-- 4) Atualiza update_purchase_with_stock para gravar sku
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
  v_sku text;
  v_qty numeric;
  v_unit_cost numeric;
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

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'name', product_name, 'sku', sku,
    'quantity', quantity, 'unit_cost', unit_cost, 'total', total
  )) INTO v_before
  FROM public.purchase_order_items WHERE order_id = _order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_total := v_total + (COALESCE((v_item->>'quantity')::numeric,0) * COALESCE((v_item->>'unit_cost')::numeric,0));
  END LOOP;

  FOR r IN
    SELECT product_id, quantity FROM public.purchase_order_items
    WHERE order_id = _order_id AND product_id IS NOT NULL
  LOOP
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_name := trim(both ' ' from (v_item->>'product_name'));
    v_sku := NULLIF(trim(both ' ' from COALESCE(v_item->>'sku','')), '');
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
        store_id, name, sku, category, condition, status,
        cost_price, sale_price, stock_current, stock_min
      ) VALUES (
        v_store_id, v_name, v_sku, 'acessorio', 'novo', 'ativo',
        v_unit_cost, v_unit_cost, v_qty, 0
      ) RETURNING id INTO v_product_id;
    ELSE
      UPDATE public.products
        SET stock_current = COALESCE(stock_current,0) + v_qty,
            cost_price = CASE WHEN v_unit_cost > 0 THEN v_unit_cost ELSE cost_price END
        WHERE id = v_product_id;
    END IF;

    IF v_sku IS NULL THEN
      SELECT sku INTO v_sku FROM public.products WHERE id = v_product_id;
    END IF;

    INSERT INTO public.purchase_order_items (
      order_id, product_id, product_name, sku, quantity, unit_cost, total, notes, created_at
    ) VALUES (
      _order_id, v_product_id, v_name, v_sku, v_qty, v_unit_cost, v_qty * v_unit_cost,
      NULLIF(v_item->>'notes',''), v_now
    );
  END LOOP;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'name', product_name, 'sku', sku,
    'quantity', quantity, 'unit_cost', unit_cost, 'total', total
  )) INTO v_after
  FROM public.purchase_order_items WHERE order_id = _order_id;

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
