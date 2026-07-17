
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS technician_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_technician_id ON public.service_orders(technician_id);
CREATE INDEX IF NOT EXISTS idx_sales_seller_id ON public.sales(seller_id);

CREATE OR REPLACE FUNCTION public.get_store_technicians(_store_id uuid)
RETURNS TABLE (user_id uuid, full_name text, email text, role public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (ur.user_id)
    ur.user_id,
    COALESCE(NULLIF(p.full_name, ''), p.email, 'Sem nome') AS full_name,
    p.email,
    ur.role
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.store_id = _store_id
    AND ur.role IN ('tecnico','gerente','dono')
    AND public.user_has_store_access(auth.uid(), _store_id)
  ORDER BY ur.user_id, ur.role;
$$;
REVOKE EXECUTE ON FUNCTION public.get_store_technicians(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_store_technicians(uuid) TO authenticated;

-- Helper: gerencial na loja?
CREATE OR REPLACE FUNCTION public.can_manage_commissions(_uid uuid, _store_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND store_id = _store_id
      AND role IN ('dono','gerente','financeiro','admin_master','administrador')
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_commissions(uuid, uuid) TO authenticated;

-- commission_rules
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  applies_to text NOT NULL CHECK (applies_to IN ('vendedor','tecnico')),
  scope text NOT NULL CHECK (scope IN ('geral','categoria','produto','servico')),
  scope_ref text,
  type text NOT NULL CHECK (type IN ('percentual','fixo')),
  value numeric NOT NULL CHECK (value >= 0),
  base text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_rules_base_check CHECK (
    (applies_to='vendedor' AND base IN ('venda_bruta','lucro'))
    OR (applies_to='tecnico' AND base IN ('mao_de_obra','total_os'))
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_rules TO authenticated;
GRANT ALL ON public.commission_rules TO service_role;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rules_select_store_member" ON public.commission_rules
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "rules_manage_manager" ON public.commission_rules
  FOR ALL TO authenticated
  USING (public.can_manage_commissions(auth.uid(), store_id))
  WITH CHECK (public.can_manage_commissions(auth.uid(), store_id));

CREATE INDEX IF NOT EXISTS idx_commission_rules_store ON public.commission_rules(store_id, applies_to, is_active);

CREATE TRIGGER trg_commission_rules_updated_at
  BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- commission_entries
CREATE TABLE IF NOT EXISTS public.commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  origin text NOT NULL CHECK (origin IN ('venda','os')),
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  os_id uuid REFERENCES public.service_orders(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.commission_rules(id) ON DELETE SET NULL,
  base_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'a_pagar' CHECK (status IN ('a_pagar','pago','estornado')),
  paid_at timestamptz,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_entries_origin_ref CHECK (
    (origin='venda' AND sale_id IS NOT NULL AND os_id IS NULL)
    OR (origin='os' AND os_id IS NOT NULL AND sale_id IS NULL)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_entries TO authenticated;
GRANT ALL ON public.commission_entries TO service_role;
ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_entries_sale
  ON public.commission_entries(sale_id, user_id, rule_id) WHERE sale_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_entries_os
  ON public.commission_entries(os_id, user_id, rule_id) WHERE os_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commission_entries_store_status ON public.commission_entries(store_id, status);
CREATE INDEX IF NOT EXISTS idx_commission_entries_user ON public.commission_entries(user_id, status);

CREATE POLICY "entries_select_own_or_manager" ON public.commission_entries
  FOR SELECT TO authenticated
  USING (
    public.user_has_store_access(auth.uid(), store_id)
    AND (user_id = auth.uid() OR public.can_manage_commissions(auth.uid(), store_id))
  );

CREATE POLICY "entries_update_manager" ON public.commission_entries
  FOR UPDATE TO authenticated
  USING (public.can_manage_commissions(auth.uid(), store_id))
  WITH CHECK (public.can_manage_commissions(auth.uid(), store_id));

CREATE POLICY "entries_delete_manager" ON public.commission_entries
  FOR DELETE TO authenticated
  USING (public.can_manage_commissions(auth.uid(), store_id));

CREATE POLICY "entries_insert_none" ON public.commission_entries
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE TRIGGER trg_commission_entries_updated_at
  BEFORE UPDATE ON public.commission_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Aplicar comissões — VENDA
CREATE OR REPLACE FUNCTION public.apply_commissions_for_sale(_sale_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale record;
  v_seller uuid;
  v_rule record;
  v_item record;
  v_base numeric;
  v_agg jsonb := '{}'::jsonb;
  v_key text;
  v_map_base numeric;
  v_map_comm numeric;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id;
  IF NOT FOUND OR v_sale.seller_id IS NULL THEN RETURN; END IF;
  v_seller := v_sale.seller_id;

  FOR v_item IN
    SELECT si.*, p.category::text AS product_category, COALESCE(p.cost_price,0) AS cost_price
    FROM public.sale_items si
    LEFT JOIN public.products p ON p.id = si.product_id
    WHERE si.sale_id = _sale_id
  LOOP
    SELECT r.* INTO v_rule
    FROM public.commission_rules r
    WHERE r.store_id = v_sale.store_id
      AND r.applies_to = 'vendedor'
      AND r.is_active
      AND (
        (r.scope='produto'   AND v_item.product_id IS NOT NULL AND r.scope_ref = v_item.product_id::text)
        OR (r.scope='categoria' AND v_item.product_category IS NOT NULL AND r.scope_ref = v_item.product_category)
        OR (r.scope='geral')
      )
    ORDER BY CASE r.scope WHEN 'produto' THEN 1 WHEN 'categoria' THEN 2 ELSE 3 END
    LIMIT 1;

    IF v_rule.id IS NULL THEN CONTINUE; END IF;

    IF v_rule.base = 'venda_bruta' THEN
      v_base := COALESCE(v_item.total, v_item.quantity * v_item.unit_price);
    ELSE
      v_base := GREATEST(COALESCE(v_item.total,0) - (v_item.cost_price * v_item.quantity), 0);
    END IF;

    v_key := v_rule.id::text;
    v_map_base := COALESCE((v_agg->v_key->>'base')::numeric, 0) + v_base;
    v_map_comm := COALESCE((v_agg->v_key->>'comm')::numeric, 0)
                + CASE WHEN v_rule.type='percentual' THEN v_base * v_rule.value / 100.0
                       ELSE v_rule.value * v_item.quantity END;
    v_agg := v_agg || jsonb_build_object(v_key, jsonb_build_object('base', v_map_base, 'comm', v_map_comm));
  END LOOP;

  FOR v_key IN SELECT jsonb_object_keys(v_agg) LOOP
    INSERT INTO public.commission_entries (
      store_id, user_id, origin, sale_id, rule_id, base_amount, commission_amount, status
    ) VALUES (
      v_sale.store_id, v_seller, 'venda', _sale_id, v_key::uuid,
      (v_agg->v_key->>'base')::numeric,
      round((v_agg->v_key->>'comm')::numeric, 2),
      'a_pagar'
    )
    ON CONFLICT (sale_id, user_id, rule_id) WHERE sale_id IS NOT NULL DO UPDATE
      SET base_amount = EXCLUDED.base_amount,
          commission_amount = EXCLUDED.commission_amount,
          status = CASE WHEN public.commission_entries.status='estornado'
                        THEN 'estornado' ELSE 'a_pagar' END,
          updated_at = now();
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_commissions_for_sale(uuid) TO authenticated, service_role;

-- Aplicar — OS
CREATE OR REPLACE FUNCTION public.apply_commissions_for_os(_os_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_os record;
  v_rule record;
  v_base numeric;
  v_comm numeric;
BEGIN
  SELECT * INTO v_os FROM public.service_orders WHERE id = _os_id;
  IF NOT FOUND OR v_os.technician_id IS NULL THEN RETURN; END IF;

  SELECT r.* INTO v_rule
  FROM public.commission_rules r
  WHERE r.store_id = v_os.store_id
    AND r.applies_to = 'tecnico'
    AND r.is_active
    AND (
      (r.scope='servico' AND r.scope_ref IS NOT NULL AND v_os.reasons IS NOT NULL AND r.scope_ref = ANY(v_os.reasons))
      OR (r.scope='geral')
    )
  ORDER BY CASE r.scope WHEN 'servico' THEN 1 ELSE 3 END
  LIMIT 1;

  IF v_rule.id IS NULL THEN RETURN; END IF;

  v_base := CASE v_rule.base
              WHEN 'mao_de_obra' THEN COALESCE(v_os.labor_value, 0)
              ELSE COALESCE(v_os.total_value, 0)
            END;

  v_comm := CASE WHEN v_rule.type='percentual' THEN v_base * v_rule.value / 100.0
                 ELSE v_rule.value END;

  INSERT INTO public.commission_entries (
    store_id, user_id, origin, os_id, rule_id, base_amount, commission_amount, status
  ) VALUES (
    v_os.store_id, v_os.technician_id, 'os', _os_id, v_rule.id,
    v_base, round(v_comm, 2), 'a_pagar'
  )
  ON CONFLICT (os_id, user_id, rule_id) WHERE os_id IS NOT NULL DO UPDATE
    SET base_amount = EXCLUDED.base_amount,
        commission_amount = EXCLUDED.commission_amount,
        status = CASE WHEN public.commission_entries.status='estornado'
                      THEN 'estornado' ELSE 'a_pagar' END,
        updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.apply_commissions_for_os(uuid) TO authenticated, service_role;

-- Triggers
CREATE OR REPLACE FUNCTION public.tg_sale_apply_commissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.apply_commissions_for_sale(NEW.id); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS tg_sales_apply_commissions ON public.sales;
CREATE TRIGGER tg_sales_apply_commissions
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_sale_apply_commissions();

CREATE OR REPLACE FUNCTION public.tg_sale_reverse_commissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.commission_entries SET status='estornado', updated_at=now()
   WHERE sale_id = OLD.id AND status <> 'pago';
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS tg_sales_reverse_commissions ON public.sales;
CREATE TRIGGER tg_sales_reverse_commissions
  BEFORE DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_sale_reverse_commissions();

CREATE OR REPLACE FUNCTION public.tg_os_apply_commissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW.status='entregue')
     OR (TG_OP='UPDATE' AND NEW.status='entregue'
         AND (OLD.status IS DISTINCT FROM 'entregue'
              OR OLD.technician_id IS DISTINCT FROM NEW.technician_id
              OR OLD.labor_value IS DISTINCT FROM NEW.labor_value
              OR OLD.total_value IS DISTINCT FROM NEW.total_value))
  THEN
    PERFORM public.apply_commissions_for_os(NEW.id);
  ELSIF (TG_OP='UPDATE' AND OLD.status='entregue' AND NEW.status<>'entregue') THEN
    UPDATE public.commission_entries SET status='estornado', updated_at=now()
     WHERE os_id = NEW.id AND status <> 'pago';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_service_orders_apply_commissions ON public.service_orders;
CREATE TRIGGER tg_service_orders_apply_commissions
  AFTER INSERT OR UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_os_apply_commissions();

-- Ajuste create_sale para respeitar seller_id do PDV
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

-- Pagamento em lote
CREATE OR REPLACE FUNCTION public.pay_commission_entries(
  _entry_ids uuid[],
  _payment_method text DEFAULT 'dinheiro',
  _expense_date date DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store uuid; v_stores int; v_total numeric; v_count int;
  v_cat_id uuid; v_cat_name text := 'Comissões';
  v_expense_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT COUNT(DISTINCT store_id), MAX(store_id), COUNT(*), SUM(commission_amount)
    INTO v_stores, v_store, v_count, v_total
  FROM public.commission_entries
  WHERE id = ANY(_entry_ids) AND status='a_pagar';

  IF v_count = 0 THEN RAISE EXCEPTION 'nenhum lançamento válido para pagar'; END IF;
  IF v_stores > 1 THEN RAISE EXCEPTION 'lançamentos de lojas diferentes'; END IF;
  IF NOT public.can_manage_commissions(v_uid, v_store) THEN
    RAISE EXCEPTION 'sem permissão para pagar comissões';
  END IF;

  SELECT id INTO v_cat_id FROM public.expense_categories
   WHERE store_id = v_store AND lower(name) = lower(v_cat_name) LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO public.expense_categories (store_id, name, is_system, created_by)
    VALUES (v_store, v_cat_name, false, v_uid)
    RETURNING id INTO v_cat_id;
  END IF;

  INSERT INTO public.expenses (
    store_id, category_id, category_name, description, amount,
    expense_date, payment_method, notes, created_by
  ) VALUES (
    v_store, v_cat_id, v_cat_name,
    'Pagamento de comissões (' || v_count || ' lançamento(s))',
    round(v_total, 2),
    COALESCE(_expense_date, CURRENT_DATE),
    _payment_method, _notes, v_uid
  ) RETURNING id INTO v_expense_id;

  UPDATE public.commission_entries
     SET status='pago', paid_at=now(), expense_id=v_expense_id, updated_at=now()
   WHERE id = ANY(_entry_ids) AND status='a_pagar';

  RETURN jsonb_build_object('expense_id', v_expense_id, 'count', v_count, 'total', v_total);
END $$;
GRANT EXECUTE ON FUNCTION public.pay_commission_entries(uuid[], text, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_commission_payment(_expense_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_uid uuid := auth.uid();
BEGIN
  SELECT store_id INTO v_store FROM public.expenses WHERE id = _expense_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'despesa não encontrada'; END IF;
  IF NOT public.can_manage_commissions(v_uid, v_store) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  UPDATE public.commission_entries
     SET status='a_pagar', paid_at=NULL, expense_id=NULL, updated_at=now()
   WHERE expense_id = _expense_id;
  DELETE FROM public.expenses WHERE id = _expense_id;
END $$;
GRANT EXECUTE ON FUNCTION public.reverse_commission_payment(uuid) TO authenticated;
