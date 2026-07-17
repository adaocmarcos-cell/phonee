
CREATE OR REPLACE FUNCTION public.consume_customer_order_deposit(_order_id uuid, _sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.customer_orders;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_row FROM public.customer_orders WHERE id = _order_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'encomenda não encontrada'; END IF;
  IF NOT public.user_has_store_access(v_uid, v_row.store_id) THEN RAISE EXCEPTION 'sem acesso'; END IF;
  IF v_row.status = 'entregue' THEN RETURN; END IF;
  IF v_row.status = 'cancelado' THEN RAISE EXCEPTION 'encomenda cancelada'; END IF;

  UPDATE public.customer_orders
    SET status = 'entregue',
        sale_id = _sale_id,
        deposit_consumed = CASE WHEN has_deposit THEN true ELSE deposit_consumed END
    WHERE id = _order_id;

  INSERT INTO public.customer_order_events(order_id, store_id, from_status, to_status, actor_id, reason)
    VALUES (_order_id, v_row.store_id, v_row.status, 'entregue', v_uid,
            'venda concretizada '||_sale_id::text ||
            CASE WHEN v_row.has_deposit THEN ' — sinal '||v_row.deposit_amount||' abatido' ELSE '' END);
END $$;
