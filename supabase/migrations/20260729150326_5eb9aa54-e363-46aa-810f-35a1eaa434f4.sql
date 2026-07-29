CREATE OR REPLACE FUNCTION public.tg_purchase_order_payables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat uuid;
  v_due date;
BEGIN
  IF NEW.status = 'cancelado' THEN
    DELETE FROM public.payables
      WHERE purchase_order_id = NEW.id AND status <> 'pago';
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payment_status, '') <> 'a_pagar' THEN
    DELETE FROM public.payables
      WHERE purchase_order_id = NEW.id AND status <> 'pago';
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.total_cost, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.payables WHERE purchase_order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_due := COALESCE(
    NEW.due_date,
    NEW.expected_delivery_at,
    (COALESCE(NEW.received_at, NEW.created_at, now())::date + 30)
  );

  SELECT id INTO v_cat
    FROM public.expense_categories
   WHERE (store_id = NEW.store_id OR store_id IS NULL)
     AND (is_stock_purchase IS TRUE OR lower(name) LIKE 'compra de mercadoria%')
   ORDER BY (store_id = NEW.store_id) DESC, (is_stock_purchase IS TRUE) DESC
   LIMIT 1;

  INSERT INTO public.payables (
    store_id, supplier_id, category_id, purchase_order_id, description,
    amount, due_date, installment_number, total_installments,
    payment_method, created_by
  ) VALUES (
    NEW.store_id, NEW.supplier_id, v_cat, NEW.id,
    concat('Compra ', COALESCE(NEW.supplier, 'fornecedor'), ' — pedido de compra'),
    NEW.total_cost, v_due, 1, 1, NEW.payment_method, NEW.created_by
  );

  RETURN NEW;
END;
$$;