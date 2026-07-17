
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS block_sale_when_cash_closed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
  closed_by uuid,
  closed_at timestamptz,
  expected_cash numeric(14,2),
  counted_cash numeric(14,2),
  difference numeric(14,2),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_store_uidx
  ON public.cash_sessions (store_id) WHERE status = 'aberto';
CREATE INDEX IF NOT EXISTS cash_sessions_store_opened_idx
  ON public.cash_sessions (store_id, opened_at DESC);

CREATE POLICY "cash_sessions read" ON public.cash_sessions FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "cash_sessions insert" ON public.cash_sessions FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id) AND opened_by = auth.uid());
CREATE POLICY "cash_sessions update" ON public.cash_sessions FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "cash_sessions service_role" ON public.cash_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sangria','suprimento')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cash_movements_session_idx ON public.cash_movements (session_id, created_at);
CREATE INDEX IF NOT EXISTS cash_movements_store_idx ON public.cash_movements (store_id, created_at DESC);

CREATE POLICY "cash_movements read" ON public.cash_movements FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "cash_movements insert" ON public.cash_movements FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id) AND created_by = auth.uid());
CREATE POLICY "cash_movements service_role" ON public.cash_movements FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_cash_session_idx ON public.sales (cash_session_id) WHERE cash_session_id IS NOT NULL;

ALTER TABLE public.receivable_payments
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS receivable_payments_cash_session_idx ON public.receivable_payments (cash_session_id) WHERE cash_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_stamp_sale_cash_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid; v_block boolean; v_involves_cash boolean;
BEGIN
  IF NEW.cash_session_id IS NOT NULL THEN RETURN NEW; END IF;
  v_involves_cash := (NEW.payment_method::text IN ('dinheiro','misto'));
  SELECT id INTO v_session FROM public.cash_sessions
   WHERE store_id = NEW.store_id AND status = 'aberto' LIMIT 1;
  IF v_involves_cash AND v_session IS NULL THEN
    SELECT COALESCE(block_sale_when_cash_closed, false) INTO v_block FROM public.stores WHERE id = NEW.store_id;
    IF v_block THEN
      RAISE EXCEPTION 'Caixa fechado: abra o caixa antes de registrar uma venda em dinheiro.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF v_session IS NOT NULL AND v_involves_cash THEN NEW.cash_session_id := v_session; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS tg_stamp_sale_cash_session ON public.sales;
CREATE TRIGGER tg_stamp_sale_cash_session BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_stamp_sale_cash_session();

CREATE OR REPLACE FUNCTION public.tg_stamp_receivable_cash_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid;
BEGIN
  IF NEW.cash_session_id IS NOT NULL OR NEW.method <> 'dinheiro' THEN RETURN NEW; END IF;
  SELECT id INTO v_session FROM public.cash_sessions
   WHERE store_id = NEW.store_id AND status = 'aberto' LIMIT 1;
  IF v_session IS NOT NULL THEN NEW.cash_session_id := v_session; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS tg_stamp_receivable_cash_session ON public.receivable_payments;
CREATE TRIGGER tg_stamp_receivable_cash_session BEFORE INSERT ON public.receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_stamp_receivable_cash_session();

CREATE OR REPLACE FUNCTION public.get_open_cash_session(_store_id uuid)
RETURNS SETOF public.cash_sessions LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.cash_sessions
   WHERE store_id = _store_id AND status = 'aberto'
     AND public.user_has_store_access(auth.uid(), _store_id)
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_open_cash_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.open_cash_session(_store_id uuid, _opening_amount numeric, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_sessions WHERE store_id = _store_id AND status = 'aberto') THEN
    RAISE EXCEPTION 'Já existe um caixa aberto para esta loja.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.cash_sessions (store_id, opened_by, opening_amount, notes)
  VALUES (_store_id, auth.uid(), COALESCE(_opening_amount,0), _notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_cash_movement(_session_id uuid, _type text, _amount numeric, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_status text; v_id uuid;
BEGIN
  SELECT store_id, status INTO v_store, v_status FROM public.cash_sessions WHERE id = _session_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada.'; END IF;
  IF v_status <> 'aberto' THEN RAISE EXCEPTION 'Sessão fechada.'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Valor inválido.'; END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN RAISE EXCEPTION 'Motivo é obrigatório.'; END IF;
  IF _type NOT IN ('sangria','suprimento') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;
  INSERT INTO public.cash_movements (store_id, session_id, type, amount, reason, created_by)
  VALUES (v_store, _session_id, _type, _amount, _reason, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.add_cash_movement(uuid, text, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cash_session_summary(_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store uuid; v_open numeric; v_status text;
  v_sales_cash numeric := 0; v_recv_cash numeric := 0;
  v_supr numeric := 0; v_sang numeric := 0;
  v_by_method jsonb := '[]'::jsonb; v_expected numeric := 0;
BEGIN
  SELECT store_id, opening_amount, status INTO v_store, v_open, v_status
    FROM public.cash_sessions WHERE id = _session_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada.'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(SUM(sp.amount),0) INTO v_sales_cash
    FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
   WHERE s.cash_session_id = _session_id AND sp.method = 'dinheiro';

  SELECT COALESCE(SUM(amount),0) INTO v_recv_cash
    FROM public.receivable_payments WHERE cash_session_id = _session_id AND method = 'dinheiro';

  SELECT COALESCE(SUM(amount) FILTER (WHERE type='suprimento'),0),
         COALESCE(SUM(amount) FILTER (WHERE type='sangria'),0)
    INTO v_supr, v_sang FROM public.cash_movements WHERE session_id = _session_id;

  v_expected := COALESCE(v_open,0) + v_sales_cash + v_recv_cash + v_supr - v_sang;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('method', method, 'amount', amt) ORDER BY method), '[]'::jsonb)
    INTO v_by_method FROM (
      SELECT sp.method, SUM(sp.amount) AS amt
        FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
       WHERE s.cash_session_id = _session_id GROUP BY sp.method
    ) x;

  RETURN jsonb_build_object(
    'session_id', _session_id, 'status', v_status,
    'opening_amount', v_open, 'sales_cash', v_sales_cash,
    'receivables_cash', v_recv_cash, 'suprimentos', v_supr, 'sangrias', v_sang,
    'expected_cash', v_expected, 'by_method', v_by_method
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_cash_session_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_cash_session(_session_id uuid, _counted_cash numeric, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_status text; v_summary jsonb; v_expected numeric; v_diff numeric;
BEGIN
  SELECT store_id, status INTO v_store, v_status FROM public.cash_sessions WHERE id = _session_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada.'; END IF;
  IF v_status = 'fechado' THEN RAISE EXCEPTION 'Sessão já fechada.'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  IF _counted_cash IS NULL OR _counted_cash < 0 THEN RAISE EXCEPTION 'Valor contado inválido.'; END IF;

  v_summary := public.get_cash_session_summary(_session_id);
  v_expected := (v_summary->>'expected_cash')::numeric;
  v_diff := _counted_cash - v_expected;

  UPDATE public.cash_sessions
     SET status='fechado', closed_by=auth.uid(), closed_at=now(),
         expected_cash=v_expected, counted_cash=_counted_cash, difference=v_diff,
         notes=COALESCE(_notes, notes), updated_at=now()
   WHERE id = _session_id;

  RETURN jsonb_build_object('expected_cash', v_expected, 'counted_cash', _counted_cash, 'difference', v_diff, 'summary', v_summary);
END; $$;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cash_consolidated(_store_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;

  WITH sess AS (
    SELECT * FROM public.cash_sessions
     WHERE store_id = _store_id AND opened_at::date BETWEEN _from AND _to
  ),
  by_day AS (
    SELECT opened_at::date AS d, COUNT(*) AS sessions_count,
           COALESCE(SUM(expected_cash),0) AS expected_sum,
           COALESCE(SUM(counted_cash),0) AS counted_sum,
           COALESCE(SUM(difference),0) AS diff_sum
      FROM sess GROUP BY 1 ORDER BY 1
  ),
  by_method AS (
    SELECT sp.method, COALESCE(SUM(sp.amount),0) AS amount
      FROM public.sale_payments sp JOIN public.sales s ON s.id = sp.sale_id
     WHERE s.cash_session_id IN (SELECT id FROM sess) GROUP BY sp.method
  ),
  mov AS (
    SELECT COALESCE(SUM(amount) FILTER (WHERE type='sangria'),0) AS sangrias,
           COALESCE(SUM(amount) FILTER (WHERE type='suprimento'),0) AS suprimentos
      FROM public.cash_movements WHERE session_id IN (SELECT id FROM sess)
  ),
  by_operator AS (
    SELECT opened_by AS user_id, COUNT(*) AS sessions_count,
           COALESCE(SUM(difference),0) AS diff_sum
      FROM sess GROUP BY opened_by ORDER BY 3
  )
  SELECT jsonb_build_object(
    'by_day', COALESCE((SELECT jsonb_agg(to_jsonb(by_day)) FROM by_day),'[]'::jsonb),
    'by_method', COALESCE((SELECT jsonb_agg(to_jsonb(by_method)) FROM by_method),'[]'::jsonb),
    'movements', COALESCE((SELECT to_jsonb(mov) FROM mov),'{}'::jsonb),
    'by_operator', COALESCE((SELECT jsonb_agg(to_jsonb(by_operator)) FROM by_operator),'[]'::jsonb),
    'diff_sum', COALESCE((SELECT SUM(diff_sum) FROM by_day),0)
  ) INTO v_result;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_cash_consolidated(uuid, date, date) TO authenticated;
