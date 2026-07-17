
-- 1. Tabela principal
CREATE TABLE public.customer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_whatsapp text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  agreed_price numeric(14,2) NOT NULL CHECK (agreed_price >= 0),
  has_deposit boolean NOT NULL DEFAULT false,
  deposit_amount numeric(14,2),
  deposit_method text,
  deposit_cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  deposit_consumed boolean NOT NULL DEFAULT false,
  expected_at date,
  status text NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando','pedido_ao_fornecedor','chegou','entregue','cancelado')),
  cancel_reason text,
  cancel_refund_mode text CHECK (cancel_refund_mode IN ('devolver','vale')),
  store_credit_id uuid REFERENCES public.store_credits(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_notified_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (has_deposit = false OR (deposit_amount IS NOT NULL AND deposit_amount > 0))
);
CREATE INDEX customer_orders_store_status_idx ON public.customer_orders(store_id, status);
CREATE INDEX customer_orders_product_status_idx ON public.customer_orders(product_id, status) WHERE product_id IS NOT NULL;
CREATE INDEX customer_orders_purchase_idx ON public.customer_orders(purchase_order_id) WHERE purchase_order_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.customer_orders TO authenticated;
GRANT ALL ON public.customer_orders TO service_role;
ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_orders read"
  ON public.customer_orders FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "customer_orders insert"
  ON public.customer_orders FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id) AND created_by = auth.uid());
CREATE POLICY "customer_orders update"
  ON public.customer_orders FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "customer_orders service_role"
  ON public.customer_orders FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_customer_orders_updated
  BEFORE UPDATE ON public.customer_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Histórico de eventos
CREATE TABLE public.customer_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_order_events_order_idx ON public.customer_order_events(order_id, created_at DESC);
GRANT SELECT, INSERT ON public.customer_order_events TO authenticated;
GRANT ALL ON public.customer_order_events TO service_role;
ALTER TABLE public.customer_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_order_events read"
  ON public.customer_order_events FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "customer_order_events insert"
  ON public.customer_order_events FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "customer_order_events service_role"
  ON public.customer_order_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Ampliar check de whatsapp_templates para incluir 'encomenda_chegou'
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_event_chk;
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_event_chk
  CHECK (event_key IN (
    'os_criada','orcamento_pronto','orcamento_aprovado','aparelho_pronto',
    'os_entregue_garantia','venda_concluida','cobranca_pendente','cobranca_vencida',
    'encomenda_chegou'
  ));

-- 4. RPC: criar encomenda
CREATE OR REPLACE FUNCTION public.create_customer_order(
  _store_id uuid,
  _customer_id uuid,
  _customer_name text,
  _customer_whatsapp text,
  _product_id uuid,
  _description text,
  _quantity int,
  _agreed_price numeric,
  _expected_at date,
  _notes text,
  _has_deposit boolean,
  _deposit_amount numeric,
  _deposit_method text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_session uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.user_has_store_access(v_uid, _store_id) THEN
    RAISE EXCEPTION 'sem acesso a esta loja';
  END IF;
  IF _description IS NULL OR btrim(_description) = '' THEN
    RAISE EXCEPTION 'descrição obrigatória';
  END IF;
  IF _agreed_price IS NULL OR _agreed_price < 0 THEN
    RAISE EXCEPTION 'preço inválido';
  END IF;
  IF COALESCE(_quantity,0) < 1 THEN _quantity := 1; END IF;

  IF _has_deposit THEN
    IF _deposit_amount IS NULL OR _deposit_amount <= 0 THEN
      RAISE EXCEPTION 'sinal precisa ter valor';
    END IF;
    IF _deposit_amount > (_agreed_price * _quantity) THEN
      RAISE EXCEPTION 'sinal maior que o total da encomenda';
    END IF;
    IF _deposit_method = 'dinheiro' THEN
      SELECT id INTO v_session FROM public.cash_sessions
        WHERE store_id = _store_id AND status = 'aberto'
        ORDER BY opened_at DESC LIMIT 1;
      IF v_session IS NULL THEN
        RAISE EXCEPTION 'não há sessão de caixa aberta para registrar o sinal em dinheiro';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.customer_orders(
    store_id, customer_id, customer_name, customer_whatsapp, product_id,
    description, quantity, agreed_price, expected_at, notes,
    has_deposit, deposit_amount, deposit_method, deposit_cash_session_id, created_by
  ) VALUES (
    _store_id, _customer_id, _customer_name, _customer_whatsapp, _product_id,
    _description, _quantity, _agreed_price, _expected_at, _notes,
    COALESCE(_has_deposit,false),
    CASE WHEN _has_deposit THEN _deposit_amount END,
    CASE WHEN _has_deposit THEN _deposit_method END,
    v_session, v_uid
  ) RETURNING id INTO v_id;

  INSERT INTO public.customer_order_events(order_id, store_id, from_status, to_status, actor_id, reason)
    VALUES (v_id, _store_id, NULL, 'aguardando', v_uid,
            CASE WHEN _has_deposit THEN 'criada com sinal '||_deposit_method||' de R$ '||_deposit_amount ELSE 'criada sem sinal' END);

  IF _has_deposit AND _deposit_method = 'dinheiro' AND v_session IS NOT NULL THEN
    INSERT INTO public.cash_movements(store_id, session_id, type, amount, reason, created_by)
      VALUES (_store_id, v_session, 'suprimento', _deposit_amount,
              'Sinal de encomenda '||_customer_name, v_uid);
  END IF;

  RETURN jsonb_build_object('id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.create_customer_order(uuid,uuid,text,text,uuid,text,int,numeric,date,text,boolean,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_order(uuid,uuid,text,text,uuid,text,int,numeric,date,text,boolean,numeric,text) TO authenticated;

-- 5. RPC: vincular pedido de compra
CREATE OR REPLACE FUNCTION public.link_customer_order_to_purchase(_order_id uuid, _purchase_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_store uuid; v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT store_id, status INTO v_store, v_status FROM public.customer_orders WHERE id = _order_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'encomenda não encontrada'; END IF;
  IF NOT public.user_has_store_access(v_uid, v_store) THEN RAISE EXCEPTION 'sem acesso'; END IF;
  IF v_status NOT IN ('aguardando','pedido_ao_fornecedor') THEN
    RAISE EXCEPTION 'encomenda não pode ser vinculada neste status (%)', v_status;
  END IF;
  UPDATE public.customer_orders
    SET purchase_order_id = _purchase_order_id,
        status = 'pedido_ao_fornecedor'
    WHERE id = _order_id;
  INSERT INTO public.customer_order_events(order_id, store_id, from_status, to_status, actor_id, reason)
    VALUES (_order_id, v_store, v_status, 'pedido_ao_fornecedor', v_uid, 'vinculada ao pedido de compra');
END $$;
REVOKE ALL ON FUNCTION public.link_customer_order_to_purchase(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_customer_order_to_purchase(uuid,uuid) TO authenticated;

-- 6. RPC: marcar chegou (manual ou via trigger)
CREATE OR REPLACE FUNCTION public.mark_customer_order_arrived(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_store uuid; v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT store_id, status INTO v_store, v_status FROM public.customer_orders WHERE id = _order_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'encomenda não encontrada'; END IF;
  IF NOT public.user_has_store_access(v_uid, v_store) THEN RAISE EXCEPTION 'sem acesso'; END IF;
  IF v_status NOT IN ('aguardando','pedido_ao_fornecedor') THEN
    RAISE EXCEPTION 'encomenda já está em outro status (%)', v_status;
  END IF;
  UPDATE public.customer_orders SET status = 'chegou' WHERE id = _order_id;
  INSERT INTO public.customer_order_events(order_id, store_id, from_status, to_status, actor_id, reason)
    VALUES (_order_id, v_store, v_status, 'chegou', v_uid, 'produto disponível');
END $$;
REVOKE ALL ON FUNCTION public.mark_customer_order_arrived(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_customer_order_arrived(uuid) TO authenticated;

-- 7. RPC: marcar cliente avisado
CREATE OR REPLACE FUNCTION public.notify_customer_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_store uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT store_id INTO v_store FROM public.customer_orders WHERE id = _order_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'encomenda não encontrada'; END IF;
  IF NOT public.user_has_store_access(v_uid, v_store) THEN RAISE EXCEPTION 'sem acesso'; END IF;
  UPDATE public.customer_orders SET customer_notified_at = now() WHERE id = _order_id;
END $$;
REVOKE ALL ON FUNCTION public.notify_customer_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_customer_order(uuid) TO authenticated;

-- 8. RPC: cancelar (com opção de reembolso do sinal)
CREATE OR REPLACE FUNCTION public.cancel_customer_order(_order_id uuid, _refund_mode text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.customer_orders;
  v_session uuid;
  v_credit_id uuid;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN RAISE EXCEPTION 'motivo obrigatório'; END IF;
  SELECT * INTO v_row FROM public.customer_orders WHERE id = _order_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'encomenda não encontrada'; END IF;
  IF NOT public.user_has_store_access(v_uid, v_row.store_id) THEN RAISE EXCEPTION 'sem acesso'; END IF;
  IF v_row.status IN ('entregue','cancelado') THEN
    RAISE EXCEPTION 'encomenda já está %', v_row.status;
  END IF;

  IF v_row.has_deposit AND NOT v_row.deposit_consumed THEN
    IF _refund_mode NOT IN ('devolver','vale') THEN
      RAISE EXCEPTION 'refund_mode obrigatório: devolver ou vale';
    END IF;
    IF _refund_mode = 'devolver' AND v_row.deposit_method = 'dinheiro' THEN
      SELECT id INTO v_session FROM public.cash_sessions
        WHERE store_id = v_row.store_id AND status = 'aberto'
        ORDER BY opened_at DESC LIMIT 1;
      IF v_session IS NULL THEN
        RAISE EXCEPTION 'abra o caixa para devolver o sinal em dinheiro';
      END IF;
      INSERT INTO public.cash_movements(store_id, session_id, type, amount, reason, created_by)
        VALUES (v_row.store_id, v_session, 'sangria', v_row.deposit_amount,
                'Devolução de sinal — encomenda cancelada: '||_reason, v_uid);
    ELSIF _refund_mode = 'vale' THEN
      v_code := public.generate_store_credit_code(v_row.store_id);
      INSERT INTO public.store_credits(store_id, code, customer_id, customer_name,
                                       original_amount, balance, status)
        VALUES (v_row.store_id, v_code, v_row.customer_id, v_row.customer_name,
                v_row.deposit_amount, v_row.deposit_amount, 'ativo')
        RETURNING id INTO v_credit_id;
    END IF;
  END IF;

  UPDATE public.customer_orders
    SET status = 'cancelado',
        cancel_reason = _reason,
        cancel_refund_mode = CASE WHEN v_row.has_deposit AND NOT v_row.deposit_consumed THEN _refund_mode END,
        store_credit_id = v_credit_id
    WHERE id = _order_id;

  INSERT INTO public.customer_order_events(order_id, store_id, from_status, to_status, actor_id, reason)
    VALUES (_order_id, v_row.store_id, v_row.status, 'cancelado', v_uid, _reason);

  RETURN jsonb_build_object('store_credit_id', v_credit_id, 'store_credit_code', v_code);
END $$;
REVOKE ALL ON FUNCTION public.cancel_customer_order(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(uuid,text,text) TO authenticated;

-- 9. RPC: consumir sinal ao concretizar venda (chamado pelo PDV após create_sale)
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

  IF v_row.has_deposit AND NOT v_row.deposit_consumed THEN
    -- registra o abatimento como forma de pagamento informativa (não impacta o caixa: já foi lançado ao receber o sinal)
    INSERT INTO public.sale_payments(sale_id, store_id, method, amount, notes)
      VALUES (_sale_id, v_row.store_id, 'sinal_encomenda', v_row.deposit_amount,
              'Sinal da encomenda '||v_row.id||' abatido');
  END IF;

  INSERT INTO public.customer_order_events(order_id, store_id, from_status, to_status, actor_id, reason)
    VALUES (_order_id, v_row.store_id, v_row.status, 'entregue', v_uid, 'venda concretizada '||_sale_id::text);
END $$;
REVOKE ALL ON FUNCTION public.consume_customer_order_deposit(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_customer_order_deposit(uuid,uuid) TO authenticated;

-- 10. Reserva de estoque: quantidade reservada por produto
CREATE OR REPLACE FUNCTION public.get_reserved_qty(_product_id uuid, _store_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(quantity), 0)::int
    FROM public.customer_orders
   WHERE product_id = _product_id AND store_id = _store_id
     AND status IN ('aguardando','pedido_ao_fornecedor','chegou')
$$;
GRANT EXECUTE ON FUNCTION public.get_reserved_qty(uuid,uuid) TO authenticated;

-- 11. Trigger: quando pedido de compra é recebido, encomendas viram 'chegou'
CREATE OR REPLACE FUNCTION public.tg_customer_orders_on_purchase_received()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'recebido' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.customer_orders
      SET status = 'chegou'
      WHERE purchase_order_id = NEW.id
        AND status IN ('aguardando','pedido_ao_fornecedor');
    INSERT INTO public.customer_order_events(order_id, store_id, from_status, to_status, reason)
      SELECT id, store_id, 'pedido_ao_fornecedor', 'chegou',
             'pedido de compra '||NEW.id||' recebido'
        FROM public.customer_orders
       WHERE purchase_order_id = NEW.id AND status = 'chegou';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_customer_orders_on_purchase_received ON public.purchase_orders;
CREATE TRIGGER trg_customer_orders_on_purchase_received
  AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_customer_orders_on_purchase_received();
