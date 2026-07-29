CREATE OR REPLACE FUNCTION public.receive_purchase_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid; v_status purchase_order_status; v_received timestamptz;
  v_it record; v_units numeric := 0; v_now timestamptz := now();
BEGIN
  SELECT store_id, status, received_at INTO v_store, v_status, v_received
    FROM public.purchase_orders WHERE id = _order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'Compra não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_status = 'recebido' THEN
    RAISE EXCEPTION 'Esta compra já foi recebida' USING ERRCODE = '22023';
  END IF;

  FOR v_it IN
    SELECT id, product_id, quantity, unit_cost
      FROM public.purchase_order_items
     WHERE order_id = _order_id AND product_id IS NOT NULL AND quantity > 0
  LOOP
    PERFORM set_config('app.stock_origin', 'compra:purchase_orders:' || _order_id, true);
    UPDATE public.products
       SET stock_current = COALESCE(stock_current, 0) + v_it.quantity,
           cost_price = CASE WHEN v_it.unit_cost > 0 THEN v_it.unit_cost ELSE cost_price END,
           updated_at = v_now
     WHERE id = v_it.product_id AND store_id = v_store;
    v_units := v_units + v_it.quantity;
  END LOOP;

  UPDATE public.purchase_orders
     SET status = 'recebido', received_at = COALESCE(v_received, v_now), updated_at = v_now
   WHERE id = _order_id;

  RETURN jsonb_build_object('order_id', _order_id, 'units', v_units);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid) TO authenticated;