
-- 1) Extend alerts with lifecycle + typed context
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_kind text,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trade_in_id uuid REFERENCES public.trade_ins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imei text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='alerts_status_check') THEN
    ALTER TABLE public.alerts
      ADD CONSTRAINT alerts_status_check CHECK (status IN ('open','archived','resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS alerts_store_status_idx ON public.alerts(store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_tradein_idx ON public.alerts(trade_in_id) WHERE trade_in_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS alerts_imei_idx ON public.alerts(imei) WHERE imei IS NOT NULL;

-- 2) Store-level threshold + severity for trade-in cost divergence
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS tradein_divergence_threshold numeric NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS tradein_divergence_severity text NOT NULL DEFAULT 'warning';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='stores_tradein_sev_check') THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_tradein_sev_check CHECK (tradein_divergence_severity IN ('info','warning','danger'));
  END IF;
END $$;

-- 3) Rewrite scanner to use store settings + rich metadata + lifecycle-aware de-dup
CREATE OR REPLACE FUNCTION public.check_tradein_cost_divergence()
RETURNS TABLE(store_id uuid, imei text, expected numeric, actual numeric, diff numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_link text;
  v_expected numeric;
  v_actual numeric;
  v_diff numeric;
  v_tol numeric;
  v_sev text;
BEGIN
  FOR r IN
    SELECT t.id AS trade_id,
           t.store_id,
           t.product_id,
           COALESCE(t.imei, p.imei) AS imei_val,
           COALESCE(t.entry_value,0) AS entry_value,
           COALESCE(t.repair_costs,0) AS repair_costs,
           COALESCE(p.cost_price,0) AS product_cost,
           p.name AS product_name,
           COALESCE(s.tradein_divergence_threshold, 0.50) AS tol,
           COALESCE(s.tradein_divergence_severity, 'warning') AS sev
    FROM public.trade_ins t
    JOIN public.products p ON p.id = t.product_id
    JOIN public.stores s   ON s.id = t.store_id
    WHERE t.product_id IS NOT NULL
      AND t.received_in_sale_id IS NULL
      AND COALESCE(t.imei, p.imei) IS NOT NULL
  LOOP
    v_expected := r.entry_value + r.repair_costs;
    v_actual   := r.product_cost;
    v_diff     := round(abs(v_expected - v_actual)::numeric, 2);
    v_tol      := r.tol;
    v_sev      := r.sev;
    IF v_diff > v_tol THEN
      v_link := '/painel/estoque/rastreio-imei?imei=' || r.imei_val;
      -- Only insert if there's no active (open or archived) alert for the same trade-in
      IF NOT EXISTS (
        SELECT 1 FROM public.alerts a
        WHERE a.store_id = r.store_id
          AND a.type = 'tradein_cost_divergence'
          AND a.trade_in_id = r.trade_id
          AND a.status IN ('open','archived')
      ) THEN
        INSERT INTO public.alerts(
          store_id, type, severity, title, message, link,
          trade_in_id, product_id, imei, metadata
        )
        VALUES (
          r.store_id,
          'tradein_cost_divergence',
          v_sev::alert_severity,
          'Divergência de custo no seminovo',
          format('%s (IMEI %s): entrada + reparos = R$ %s, mas o custo em estoque é R$ %s (diferença R$ %s).',
                 COALESCE(r.product_name,'Aparelho'), r.imei_val,
                 to_char(v_expected,'FM999G999G990D00'),
                 to_char(v_actual,'FM999G999G990D00'),
                 to_char(v_diff,'FM999G999G990D00')),
          v_link,
          r.trade_id, r.product_id, r.imei_val,
          jsonb_build_object(
            'entry_value', r.entry_value,
            'repair_costs', r.repair_costs,
            'expected_cost', v_expected,
            'current_cost', v_actual,
            'diff', v_diff,
            'product_name', r.product_name,
            'threshold', v_tol
          )
        );
      END IF;
      store_id := r.store_id; imei := r.imei_val;
      expected := v_expected; actual := v_actual; diff := v_diff;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END; $function$;

-- 4) Track first_opened_at automatically when alert is first viewed
CREATE OR REPLACE FUNCTION public.tg_alerts_track_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.is_read = true AND (OLD.is_read = false OR OLD.is_read IS NULL) AND NEW.first_opened_at IS NULL THEN
    NEW.first_opened_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alerts_track_open_trg ON public.alerts;
CREATE TRIGGER alerts_track_open_trg
BEFORE UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.tg_alerts_track_open();

-- 5) Lifecycle RPC: archive / reactivate / mark resolved
CREATE OR REPLACE FUNCTION public.set_alert_status(
  _alert_id uuid, _status text, _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF _status NOT IN ('open','archived','resolved') THEN
    RAISE EXCEPTION 'Status inválido: %', _status;
  END IF;
  UPDATE public.alerts SET
    status = _status,
    is_read = CASE WHEN _status <> 'open' THEN true ELSE is_read END,
    resolved_at = CASE WHEN _status='resolved' THEN COALESCE(resolved_at, now()) ELSE NULL END,
    resolved_by = CASE WHEN _status='resolved' THEN COALESCE(resolved_by, v_uid) ELSE NULL END,
    resolution_note = CASE WHEN _status='resolved' THEN COALESCE(_note, resolution_note) ELSE resolution_note END,
    archived_at = CASE WHEN _status='archived' THEN COALESCE(archived_at, now()) ELSE NULL END,
    archived_by = CASE WHEN _status='archived' THEN COALESCE(archived_by, v_uid) ELSE NULL END
  WHERE id = _alert_id
    AND store_id IN (SELECT s.id FROM public.stores s WHERE s.owner_id = v_uid
                     UNION SELECT us.store_id FROM public.user_stores us WHERE us.user_id = v_uid);
  IF NOT FOUND THEN RAISE EXCEPTION 'Alerta não encontrado ou sem permissão'; END IF;
END $$;

-- 6) One-click action RPC: creates a replenishment PO or fixes a trade-in cost, then resolves alert
CREATE OR REPLACE FUNCTION public.resolve_alert_action(
  _alert_id uuid,
  _action text,
  _params jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_alert public.alerts%ROWTYPE;
  v_prod public.products%ROWTYPE;
  v_trade public.trade_ins%ROWTYPE;
  v_order_id uuid;
  v_qty int;
  v_unit_cost numeric;
  v_expected numeric;
  v_link text;
BEGIN
  SELECT * INTO v_alert FROM public.alerts WHERE id = _alert_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alerta não encontrado'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = v_alert.store_id AND s.owner_id = v_uid
    UNION SELECT 1 FROM public.user_stores us WHERE us.store_id = v_alert.store_id AND us.user_id = v_uid
  ) THEN RAISE EXCEPTION 'Sem permissão para esta loja'; END IF;

  IF _action = 'create_replenishment_order' THEN
    IF v_alert.product_id IS NULL THEN RAISE EXCEPTION 'Alerta sem produto vinculado'; END IF;
    SELECT * INTO v_prod FROM public.products WHERE id = v_alert.product_id;
    v_qty := GREATEST(1, COALESCE((_params->>'quantity')::int, GREATEST(v_prod.stock_max - v_prod.stock_current, v_prod.stock_min - v_prod.stock_current, 1)));
    v_unit_cost := COALESCE((_params->>'unit_cost')::numeric, v_prod.cost_price, 0);
    INSERT INTO public.purchase_orders(store_id, created_by, supplier, status, total_cost, notes)
    VALUES (v_alert.store_id, v_uid, COALESCE(v_prod.supplier,'A definir'), 'rascunho', v_qty * v_unit_cost,
            format('Gerado a partir do alerta %s', substring(v_alert.id::text, 1, 8)))
    RETURNING id INTO v_order_id;
    INSERT INTO public.purchase_order_items(order_id, product_id, product_name, quantity, unit_cost, total, sku)
    VALUES (v_order_id, v_prod.id, v_prod.name, v_qty, v_unit_cost, v_qty * v_unit_cost, v_prod.sku);
    v_link := '/painel/compras';

  ELSIF _action = 'fix_tradein_cost' THEN
    IF v_alert.trade_in_id IS NULL OR v_alert.product_id IS NULL THEN
      RAISE EXCEPTION 'Alerta sem trade-in/produto vinculado';
    END IF;
    SELECT * INTO v_trade FROM public.trade_ins WHERE id = v_alert.trade_in_id;
    v_expected := COALESCE(v_trade.entry_value,0) + COALESCE(v_trade.repair_costs,0);
    UPDATE public.products SET cost_price = v_expected, updated_at = now() WHERE id = v_alert.product_id;
    v_link := '/painel/estoque/rastreio-imei?imei=' || COALESCE(v_alert.imei, v_trade.imei, '');

  ELSIF _action = 'mark_resolved' THEN
    v_link := v_alert.link;

  ELSE
    RAISE EXCEPTION 'Ação desconhecida: %', _action;
  END IF;

  UPDATE public.alerts SET
    status = 'resolved',
    is_read = true,
    resolved_at = now(),
    resolved_by = v_uid,
    resolution_kind = _action,
    resolution_note = COALESCE(_params->>'note', resolution_note),
    first_opened_at = COALESCE(first_opened_at, now())
  WHERE id = _alert_id;

  RETURN jsonb_build_object('ok', true, 'action', _action, 'link', v_link, 'purchase_order_id', v_order_id);
END $$;

GRANT EXECUTE ON FUNCTION public.set_alert_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_alert_action(uuid, text, jsonb) TO authenticated;
