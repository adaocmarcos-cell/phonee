
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  product_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL CHECK (type IN (
    'venda','compra','entrada_troca','ajuste','devolucao',
    'uso_os','transferencia_in','transferencia_out','edicao_manual','saldo_inicial'
  )),
  quantity NUMERIC NOT NULL,
  balance_before NUMERIC,
  balance_after NUMERIC,
  unit_cost NUMERIC,
  origin_table TEXT,
  origin_id UUID,
  created_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sm_store_time ON public.stock_movements(store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sm_product_time ON public.stock_movements(product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sm_type ON public.stock_movements(store_id, type, occurred_at DESC);

DROP POLICY IF EXISTS "sm_select_by_store" ON public.stock_movements;
CREATE POLICY "sm_select_by_store" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
DROP POLICY IF EXISTS "sm_insert_by_store" ON public.stock_movements;
CREATE POLICY "sm_insert_by_store" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

CREATE TABLE IF NOT EXISTS public.stock_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  product_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, product_id, snapshot_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_daily_snapshots TO authenticated;
GRANT ALL ON public.stock_daily_snapshots TO service_role;
ALTER TABLE public.stock_daily_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_snap_store_date ON public.stock_daily_snapshots(store_id, snapshot_date DESC);
DROP POLICY IF EXISTS "snap_select_by_store" ON public.stock_daily_snapshots;
CREATE POLICY "snap_select_by_store" ON public.stock_daily_snapshots
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE OR REPLACE FUNCTION public.tg_products_stock_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qty NUMERIC; v_type TEXT; v_origin TEXT;
  v_origin_table TEXT; v_origin_id UUID; v_notes TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_qty := COALESCE(NEW.stock_current, 0);
    IF v_qty = 0 THEN RETURN NEW; END IF;
    INSERT INTO public.stock_movements(
      store_id, product_id, type, quantity, balance_before, balance_after,
      unit_cost, origin_table, origin_id, created_by, notes
    ) VALUES (
      NEW.store_id, NEW.id, 'saldo_inicial', v_qty, 0, v_qty,
      NEW.cost_price, 'products', NEW.id, auth.uid(), 'Cadastro do produto'
    );
    RETURN NEW;
  END IF;

  v_qty := COALESCE(NEW.stock_current, 0) - COALESCE(OLD.stock_current, 0);
  IF v_qty = 0 THEN RETURN NEW; END IF;

  BEGIN v_origin := current_setting('app.stock_origin', true);
  EXCEPTION WHEN OTHERS THEN v_origin := NULL; END;

  IF v_origin IS NULL OR v_origin = '' THEN
    v_type := 'edicao_manual'; v_origin_table := 'products';
    v_origin_id := NEW.id; v_notes := 'Alteração direta no cadastro do produto';
  ELSE
    v_type := split_part(v_origin, ':', 1);
    v_origin_table := NULLIF(split_part(v_origin, ':', 2), '');
    BEGIN v_origin_id := NULLIF(split_part(v_origin, ':', 3), '')::UUID;
    EXCEPTION WHEN OTHERS THEN v_origin_id := NULL; END;
    IF v_type NOT IN ('venda','compra','entrada_troca','ajuste','devolucao','uso_os','transferencia_in','transferencia_out') THEN
      v_type := 'edicao_manual';
    END IF;
  END IF;

  INSERT INTO public.stock_movements(
    store_id, product_id, type, quantity, balance_before, balance_after,
    unit_cost, origin_table, origin_id, created_by, notes
  ) VALUES (
    NEW.store_id, NEW.id, v_type, v_qty,
    COALESCE(OLD.stock_current, 0), COALESCE(NEW.stock_current, 0),
    NEW.cost_price, v_origin_table, v_origin_id, auth.uid(), v_notes
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_products_stock_ledger_ins ON public.products;
DROP TRIGGER IF EXISTS tg_products_stock_ledger_upd ON public.products;
CREATE TRIGGER tg_products_stock_ledger_ins
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_products_stock_ledger();
CREATE TRIGGER tg_products_stock_ledger_upd
  AFTER UPDATE OF stock_current ON public.products
  FOR EACH ROW
  WHEN (OLD.stock_current IS DISTINCT FROM NEW.stock_current)
  EXECUTE FUNCTION public.tg_products_stock_ledger();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE notes = 'backfill' LIMIT 1) THEN RETURN; END IF;

  INSERT INTO public.stock_movements(store_id, product_id, occurred_at, type, quantity, unit_cost, origin_table, origin_id, notes)
  SELECT s.store_id, si.product_id, s.created_at, 'venda',
         -COALESCE(si.quantity, 0),
         COALESCE(si.unit_cost, p.cost_price),
         'sale_items', si.id, 'backfill'
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  LEFT JOIN public.products p ON p.id = si.product_id
  WHERE si.product_id IS NOT NULL AND COALESCE(si.is_service,false) = false;

  INSERT INTO public.stock_movements(store_id, product_id, occurred_at, type, quantity, unit_cost, origin_table, origin_id, notes)
  SELECT po.store_id, poi.product_id, COALESCE(po.received_at, po.created_at), 'compra',
         COALESCE(poi.quantity, 0),
         COALESCE(poi.unit_cost, p.cost_price),
         'purchase_order_items', poi.id, 'backfill'
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.order_id
  LEFT JOIN public.products p ON p.id = poi.product_id
  WHERE poi.product_id IS NOT NULL
    AND po.status IN ('recebido'::purchase_order_status, 'parcial'::purchase_order_status);

  INSERT INTO public.stock_movements(store_id, product_id, occurred_at, type, quantity, unit_cost, origin_table, origin_id, notes)
  SELECT sa.store_id, sa.product_id, sa.created_at, 'ajuste',
         COALESCE(sa.qty_change, 0),
         p.cost_price,
         'stock_adjustments', sa.id, 'backfill'
  FROM public.stock_adjustments sa
  LEFT JOIN public.products p ON p.id = sa.product_id
  WHERE sa.item_kind = 'product' AND sa.product_id IS NOT NULL;

  INSERT INTO public.stock_movements(store_id, product_id, occurred_at, type, quantity, origin_table, origin_id, notes)
  SELECT sop.store_id, sop.part_id, sop.created_at, 'uso_os',
         -COALESCE(sop.qty, 0),
         'service_order_parts', sop.id, 'backfill'
  FROM public.service_order_parts sop
  WHERE sop.part_id IS NOT NULL AND sop.store_id IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.get_stock_movement_report(
  p_store_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ,
  p_category TEXT DEFAULT NULL, p_brand TEXT DEFAULT NULL, p_supplier TEXT DEFAULT NULL
)
RETURNS TABLE (
  product_id UUID, product_name TEXT, sku TEXT, category TEXT, brand TEXT, supplier TEXT,
  saldo_inicial NUMERIC, entrada_compra NUMERIC, entrada_troca NUMERIC, entrada_devolucao NUMERIC,
  ajuste_positivo NUMERIC, saida_venda NUMERIC, saida_os NUMERIC, saida_transferencia NUMERIC,
  ajuste_negativo NUMERIC, saldo_calculado NUMERIC, saldo_atual NUMERIC, divergencia NUMERIC, unit_cost NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), p_store_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH prods AS (
    SELECT p.id, p.name, p.sku, p.category::TEXT AS category, p.brand, p.supplier,
           COALESCE(p.stock_current,0)::NUMERIC AS stock_current, p.cost_price
    FROM public.products p
    WHERE p.store_id = p_store_id
      AND (p_category IS NULL OR p.category::TEXT = ANY(string_to_array(p_category, ',')))
      AND (p_brand IS NULL OR p.brand = p_brand)
      AND (p_supplier IS NULL OR p.supplier = p_supplier)
  ),
  inicial AS (
    SELECT sm.product_id, COALESCE(SUM(sm.quantity),0) AS q
    FROM public.stock_movements sm
    WHERE sm.store_id = p_store_id AND sm.occurred_at < p_start
    GROUP BY sm.product_id
  ),
  periodo AS (
    SELECT sm.product_id, sm.type, sm.quantity
    FROM public.stock_movements sm
    WHERE sm.store_id = p_store_id
      AND sm.occurred_at >= p_start AND sm.occurred_at <= p_end
  ),
  agg AS (
    SELECT
      pr.id AS pid,
      COALESCE(i.q, 0) AS saldo_inicial,
      COALESCE(SUM(CASE WHEN pe.type='compra' THEN pe.quantity END),0) AS entrada_compra,
      COALESCE(SUM(CASE WHEN pe.type='entrada_troca' THEN pe.quantity END),0) AS entrada_troca,
      COALESCE(SUM(CASE WHEN pe.type='devolucao' THEN pe.quantity END),0) AS entrada_devolucao,
      COALESCE(SUM(CASE WHEN pe.type IN ('ajuste','edicao_manual','saldo_inicial','transferencia_in') AND pe.quantity>0 THEN pe.quantity END),0) AS ajuste_positivo,
      COALESCE(SUM(CASE WHEN pe.type='venda' THEN -pe.quantity END),0) AS saida_venda,
      COALESCE(SUM(CASE WHEN pe.type='uso_os' THEN -pe.quantity END),0) AS saida_os,
      COALESCE(SUM(CASE WHEN pe.type='transferencia_out' AND pe.quantity<0 THEN -pe.quantity END),0) AS saida_transferencia,
      COALESCE(SUM(CASE WHEN pe.type IN ('ajuste','edicao_manual') AND pe.quantity<0 THEN -pe.quantity END),0) AS ajuste_negativo
    FROM prods pr
    LEFT JOIN inicial i ON i.product_id = pr.id
    LEFT JOIN periodo pe ON pe.product_id = pr.id
    GROUP BY pr.id, i.q
  )
  SELECT
    pr.id, pr.name, pr.sku, pr.category, pr.brand, pr.supplier,
    a.saldo_inicial, a.entrada_compra, a.entrada_troca, a.entrada_devolucao, a.ajuste_positivo,
    a.saida_venda, a.saida_os, a.saida_transferencia, a.ajuste_negativo,
    (a.saldo_inicial + a.entrada_compra + a.entrada_troca + a.entrada_devolucao + a.ajuste_positivo
       - a.saida_venda - a.saida_os - a.saida_transferencia - a.ajuste_negativo) AS saldo_calculado,
    pr.stock_current AS saldo_atual,
    (pr.stock_current
      - (a.saldo_inicial + a.entrada_compra + a.entrada_troca + a.entrada_devolucao + a.ajuste_positivo
         - a.saida_venda - a.saida_os - a.saida_transferencia - a.ajuste_negativo)) AS divergencia,
    pr.cost_price
  FROM prods pr
  JOIN agg a ON a.pid = pr.id
  ORDER BY pr.name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_stock_movement_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.take_stock_snapshot(p_date DATE DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT; v_date DATE;
BEGIN
  v_date := COALESCE(p_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  INSERT INTO public.stock_daily_snapshots(store_id, product_id, snapshot_date, balance, unit_cost)
  SELECT store_id, id, v_date, COALESCE(stock_current,0), cost_price
  FROM public.products
  ON CONFLICT (store_id, product_id, snapshot_date)
  DO UPDATE SET balance = EXCLUDED.balance, unit_cost = EXCLUDED.unit_cost;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.take_stock_snapshot(DATE) TO authenticated, service_role;

SELECT public.take_stock_snapshot();
