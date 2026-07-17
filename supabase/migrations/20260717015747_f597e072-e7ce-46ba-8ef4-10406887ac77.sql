
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_credit_default_days integer NOT NULL DEFAULT 90;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS returned_total numeric NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS sales_returned_total_idx ON public.sales (store_id) WHERE returned_total > 0;

CREATE TABLE IF NOT EXISTS public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  created_by uuid,
  reason text, notes text,
  refund_method text NOT NULL CHECK (refund_method IN ('dinheiro','pix','cartao_estorno','vale_troca','troca_imediata')),
  total_returned numeric NOT NULL DEFAULT 0,
  expense_id uuid, store_credit_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_returns_store_created_idx ON public.sale_returns(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sale_returns_sale_idx ON public.sale_returns(sale_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_returns TO authenticated;
GRANT ALL ON public.sale_returns TO service_role;
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sale_returns_store_all" ON public.sale_returns;
CREATE POLICY "sale_returns_store_all" ON public.sale_returns FOR ALL
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE RESTRICT,
  product_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_value numeric NOT NULL DEFAULT 0,
  restock boolean NOT NULL DEFAULT true,
  defect_note text, warranty_os_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_return_items_return_idx ON public.sale_return_items(return_id);
CREATE INDEX IF NOT EXISTS sale_return_items_sale_item_idx ON public.sale_return_items(sale_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_return_items TO authenticated;
GRANT ALL ON public.sale_return_items TO service_role;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sale_return_items_store_all" ON public.sale_return_items;
CREATE POLICY "sale_return_items_store_all" ON public.sale_return_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.sale_returns r WHERE r.id = return_id AND public.user_has_store_access(auth.uid(), r.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sale_returns r WHERE r.id = return_id AND public.user_has_store_access(auth.uid(), r.store_id)));

CREATE TABLE IF NOT EXISTS public.store_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code text NOT NULL,
  customer_id uuid, customer_name text, customer_doc text,
  original_amount numeric NOT NULL CHECK (original_amount > 0),
  balance numeric NOT NULL,
  expires_at timestamptz,
  origin_return_id uuid REFERENCES public.sale_returns(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','usado','expirado','cancelado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_credits_store_code_uidx ON public.store_credits(store_id, upper(code));
CREATE INDEX IF NOT EXISTS store_credits_status_idx ON public.store_credits(store_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_credits TO authenticated;
GRANT ALL ON public.store_credits TO service_role;
ALTER TABLE public.store_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_credits_store_all" ON public.store_credits;
CREATE POLICY "store_credits_store_all" ON public.store_credits FOR ALL
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

DROP TRIGGER IF EXISTS trg_sale_returns_upd ON public.sale_returns;
CREATE TRIGGER trg_sale_returns_upd BEFORE UPDATE ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_store_credits_upd ON public.store_credits;
CREATE TRIGGER trg_store_credits_upd BEFORE UPDATE ON public.store_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_store_credit_code(_store_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_i int; v_try int := 0;
BEGIN
  LOOP
    v_code := 'VT-';
    FOR v_i IN 1..6 LOOP v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.store_credits WHERE store_id = _store_id AND upper(code) = upper(v_code));
    v_try := v_try + 1;
    IF v_try > 20 THEN RAISE EXCEPTION 'Não foi possível gerar código'; END IF;
  END LOOP;
  RETURN v_code;
END $$;
REVOKE ALL ON FUNCTION public.generate_store_credit_code(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_store_credit_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_sale_return(
  _sale_id uuid, _reason text, _notes text, _refund_method text, _items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_return_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_si public.sale_items%ROWTYPE;
  v_qty int; v_prior int; v_unit numeric;
  v_credit_id uuid; v_credit_code text; v_expense_id uuid;
  v_uid uuid := auth.uid();
  v_expense_cat uuid; v_pay_method_expense text; v_expiry_days int;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF NOT public.user_has_store_access(v_uid, v_sale.store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF _refund_method NOT IN ('dinheiro','pix','cartao_estorno','vale_troca','troca_imediata') THEN
    RAISE EXCEPTION 'refund_method inválido: %', _refund_method;
  END IF;

  INSERT INTO public.sale_returns (store_id, sale_id, created_by, reason, notes, refund_method, total_returned)
  VALUES (v_sale.store_id, v_sale.id, v_uid, _reason, _notes, _refund_method, 0)
  RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) LOOP
    SELECT * INTO v_si FROM public.sale_items WHERE id = (v_item->>'sale_item_id')::uuid AND sale_id = _sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item não pertence a esta venda'; END IF;
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));

    SELECT COALESCE(SUM(ri.quantity),0) INTO v_prior
      FROM public.sale_return_items ri JOIN public.sale_returns r ON r.id = ri.return_id
      WHERE ri.sale_item_id = v_si.id AND r.id <> v_return_id;

    IF v_prior + v_qty > v_si.quantity THEN
      RAISE EXCEPTION 'Quantidade a devolver (%) excede disponível (%) para o item %',
        v_qty, v_si.quantity - v_prior, COALESCE(v_si.name, v_si.description);
    END IF;

    v_unit := COALESCE((v_item->>'unit_value')::numeric,
      CASE WHEN v_si.quantity > 0 THEN (v_si.total::numeric / v_si.quantity) ELSE 0 END);

    INSERT INTO public.sale_return_items (return_id, sale_item_id, product_id, quantity, unit_value, restock, defect_note)
    VALUES (v_return_id, v_si.id, v_si.product_id, v_qty, v_unit,
            COALESCE((v_item->>'restock')::boolean, true), v_item->>'defect_note');

    IF COALESCE((v_item->>'restock')::boolean, true)
       AND v_si.product_id IS NOT NULL
       AND COALESCE(v_si.is_service, false) = false THEN
      UPDATE public.products SET stock_current = stock_current + v_qty WHERE id = v_si.product_id;
    END IF;

    v_total := v_total + (v_unit * v_qty);
  END LOOP;

  IF v_total <= 0 THEN RAISE EXCEPTION 'Nenhum item válido informado'; END IF;

  UPDATE public.sale_returns SET total_returned = v_total WHERE id = v_return_id;
  UPDATE public.sales SET returned_total = COALESCE(returned_total,0) + v_total WHERE id = v_sale.id;

  IF _refund_method = 'vale_troca' THEN
    SELECT COALESCE(store_credit_default_days,90) INTO v_expiry_days FROM public.stores WHERE id = v_sale.store_id;
    v_credit_code := public.generate_store_credit_code(v_sale.store_id);
    INSERT INTO public.store_credits (store_id, code, customer_id, customer_name, customer_doc,
        original_amount, balance, expires_at, origin_return_id)
    VALUES (v_sale.store_id, v_credit_code, v_sale.customer_id, v_sale.customer_name, v_sale.customer_doc,
        v_total, v_total,
        CASE WHEN v_expiry_days > 0 THEN now() + make_interval(days => v_expiry_days) ELSE NULL END,
        v_return_id)
    RETURNING id INTO v_credit_id;
    UPDATE public.sale_returns SET store_credit_id = v_credit_id WHERE id = v_return_id;

  ELSIF _refund_method IN ('dinheiro','pix','cartao_estorno') THEN
    SELECT id INTO v_expense_cat FROM public.expense_categories
      WHERE store_id = v_sale.store_id AND lower(name) = 'devoluções' LIMIT 1;
    IF v_expense_cat IS NULL THEN
      INSERT INTO public.expense_categories(store_id, name, description, color, icon, is_system, created_by)
      VALUES (v_sale.store_id, 'Devoluções', 'Estornos de vendas', '#EF4444', 'RotateCcw', true, v_uid)
      RETURNING id INTO v_expense_cat;
    END IF;
    v_pay_method_expense := CASE _refund_method WHEN 'dinheiro' THEN 'dinheiro' WHEN 'pix' THEN 'pix' ELSE 'cartao' END;
    INSERT INTO public.expenses (store_id, category_id, category_name, description, amount, expense_date, payment_method, created_by)
    VALUES (v_sale.store_id, v_expense_cat, 'Devoluções',
      'Devolução venda #' || COALESCE(v_sale.sale_number::text, substr(v_sale.id::text,1,8)) ||
        CASE WHEN _reason IS NOT NULL AND _reason <> '' THEN ' — ' || _reason ELSE '' END,
      v_total, CURRENT_DATE, v_pay_method_expense, v_uid)
    RETURNING id INTO v_expense_id;
    UPDATE public.sale_returns SET expense_id = v_expense_id WHERE id = v_return_id;
  END IF;

  BEGIN
    IF v_total >= COALESCE(v_sale.total,0) THEN
      UPDATE public.commission_entries
         SET status = 'estornado', updated_at = now(),
             notes = COALESCE(notes,'') || ' | Estornado por devolução ' || v_return_id::text
       WHERE sale_id = v_sale.id AND status = 'a_pagar';
    ELSE
      INSERT INTO public.commission_entries(store_id, user_id, origin, sale_id, rule_id, base_amount, commission_amount, status, notes)
      SELECT ce.store_id, ce.user_id, 'venda', ce.sale_id, ce.rule_id,
             -1 * (ce.base_amount * (v_total / NULLIF(v_sale.total,0))),
             -1 * (ce.commission_amount * (v_total / NULLIF(v_sale.total,0))),
             'a_pagar', 'Ajuste devolução ' || v_return_id::text
        FROM public.commission_entries ce
       WHERE ce.sale_id = v_sale.id AND ce.status = 'a_pagar' AND ce.commission_amount > 0;
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object(
    'return_id', v_return_id, 'total_returned', v_total,
    'store_credit_id', v_credit_id, 'store_credit_code', v_credit_code,
    'expense_id', v_expense_id
  );
END $$;
REVOKE ALL ON FUNCTION public.create_sale_return(uuid,text,text,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_sale_return(uuid,text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_store_credit(_store_id uuid, _code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.store_credits%ROWTYPE;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v FROM public.store_credits WHERE store_id = _store_id AND upper(code) = upper(trim(_code));
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v.status <> 'ativo' THEN RETURN jsonb_build_object('ok', false, 'reason', v.status, 'balance', v.balance); END IF;
  IF v.expires_at IS NOT NULL AND v.expires_at < now() THEN
    UPDATE public.store_credits SET status='expirado' WHERE id = v.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expirado', 'balance', v.balance);
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v.id, 'code', v.code, 'balance', v.balance,
    'original_amount', v.original_amount, 'expires_at', v.expires_at, 'customer_name', v.customer_name);
END $$;
REVOKE ALL ON FUNCTION public.validate_store_credit(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.validate_store_credit(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_store_credit(_store_id uuid, _code text, _amount numeric, _sale_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.store_credits%ROWTYPE; v_new numeric;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  SELECT * INTO v FROM public.store_credits WHERE store_id = _store_id AND upper(code) = upper(trim(_code)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vale-troca não encontrado'; END IF;
  IF v.status <> 'ativo' THEN RAISE EXCEPTION 'Vale-troca % (saldo %)', v.status, v.balance; END IF;
  IF v.expires_at IS NOT NULL AND v.expires_at < now() THEN
    UPDATE public.store_credits SET status='expirado' WHERE id = v.id;
    RAISE EXCEPTION 'Vale-troca expirado';
  END IF;
  IF _amount > v.balance THEN RAISE EXCEPTION 'Saldo insuficiente (disponível %)', v.balance; END IF;
  v_new := v.balance - _amount;
  UPDATE public.store_credits
     SET balance = v_new, status = CASE WHEN v_new <= 0 THEN 'usado' ELSE 'ativo' END, updated_at = now()
   WHERE id = v.id;
  RETURN jsonb_build_object('ok', true, 'id', v.id, 'debited', _amount, 'balance', v_new);
END $$;
REVOKE ALL ON FUNCTION public.redeem_store_credit(uuid,text,numeric,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_store_credit(uuid,text,numeric,uuid) TO authenticated;
