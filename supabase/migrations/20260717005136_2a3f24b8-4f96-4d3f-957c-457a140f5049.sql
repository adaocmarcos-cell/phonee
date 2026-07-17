-- 1) create_sale: adicionar parâmetro opcional _trade_in e persistir trade_in_id
DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, text, text, text, public.payment_method, integer, numeric, text, jsonb, jsonb);

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_trade_in_id uuid := NULL;
  v_needs_repair boolean := false;
  v_new_status public.trade_in_status;
  v_pay_trade_id uuid;
  v_troca_count int := 0;
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

  SELECT COALESCE(allow_negative_stock, false) INTO v_allow_negative
    FROM public.stores WHERE id = _store_id;

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
  ) VALUES (
    _store_id, v_uid, _customer_id,
    _customer_name, _customer_doc, _customer_whatsapp,
    _payment_method, COALESCE(_installments, 1), COALESCE(_discount, 0), 0, 0, _notes
  )
  RETURNING id, sale_number INTO v_sale_id, v_sale_number;

  -- Itens + baixa de estoque
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
         WHERE id = v_pid AND store_id = _store_id
         RETURNING stock_current INTO v_stock;
        IF NOT FOUND THEN RAISE EXCEPTION 'produto % não encontrado nesta loja', v_pid USING ERRCODE='P0001'; END IF;
      ELSE
        UPDATE public.products SET stock_current = stock_current - v_qty, last_sold_at = now()
         WHERE id = v_pid AND store_id = _store_id AND stock_current >= v_qty
         RETURNING stock_current INTO v_stock;
        IF NOT FOUND THEN RAISE EXCEPTION 'estoque insuficiente para o produto %', v_pid USING ERRCODE='P0001'; END IF;
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
  IF v_total < 0 THEN RAISE EXCEPTION 'desconto maior que o subtotal'; END IF;

  UPDATE public.sales SET subtotal = v_subtotal, total = v_total WHERE id = v_sale_id;

  -- Cria trade-in DENTRO da transação se _trade_in for enviado
  -- SEM despesa (entry_expense_id fica NULL) — regra contábil.
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
      v_sale_id,
      0,
      '[]'::jsonb,
      false,
      NULL  -- SEM despesa
    )
    RETURNING id INTO v_trade_in_id;
  END IF;

  -- Pagamentos
  IF _payments IS NOT NULL AND jsonb_array_length(_payments) > 0 THEN
    FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
      v_pay_trade_id := NULLIF(v_pay->>'trade_in_id','')::uuid;
      IF (v_pay->>'method') = 'troca' THEN
        v_troca_count := v_troca_count + 1;
        IF v_troca_count > 1 THEN
          RAISE EXCEPTION 'só é permitida uma parcela de troca por venda';
        END IF;
        -- Se cliente criou trade-in agora, injeta o id na parcela de troca
        IF v_pay_trade_id IS NULL AND v_trade_in_id IS NOT NULL THEN
          v_pay_trade_id := v_trade_in_id;
        END IF;
        IF v_pay_trade_id IS NULL THEN
          RAISE EXCEPTION 'parcela de troca sem aparelho vinculado';
        END IF;
        -- Se veio trade_in existente, marca received_in_sale_id se ainda vazio
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