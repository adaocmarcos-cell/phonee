-- ============================================================
-- ETAPA 1/3: Unificar parts_inventory dentro de products
-- Estratégia: preservar o id original -> FKs continuam válidas
-- Nada é removido nesta etapa.
-- ============================================================

-- 1. Coluna de rastreio da migração
ALTER TABLE public.parts_inventory
  ADD COLUMN IF NOT EXISTS migrated_at timestamptz;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS migrated_from_parts boolean NOT NULL DEFAULT false;

-- 2. Copiar dados preservando o id
INSERT INTO public.products (
  id, store_id, name, sku, brand,
  category, subcategory, category_other,
  item_kind, condition, status,
  compatible_models, supplier, location, notes,
  cost_price, sale_price, stock_current, stock_min, stock_max,
  visible_in_catalog, patrimonio,
  created_at, updated_at, data_entrada, migrated_from_parts
)
SELECT
  pi.id,
  pi.store_id,
  pi.name,
  pi.sku,
  pi.brand,
  'peca'::product_category,
  pi.category::text,
  pi.category_other,
  CASE WHEN pi.is_tool THEN 'ferramenta'::item_kind ELSE 'peca'::item_kind END,
  'novo'::product_condition,
  'ativo'::product_status,
  pi.compatible_models,
  pi.supplier,
  pi.location,
  pi.notes,
  COALESCE(pi.cost_price, 0),
  COALESCE(pi.sale_price, 0),
  COALESCE(pi.stock_current, 0),
  COALESCE(pi.stock_min, 0),
  0,
  false,
  NULL,
  pi.created_at,
  pi.updated_at,
  pi.created_at::date,
  true
FROM public.parts_inventory pi
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = pi.id);

UPDATE public.parts_inventory SET migrated_at = now() WHERE migrated_at IS NULL;

-- 3. Repontar as chaves estrangeiras para products
ALTER TABLE public.service_order_parts
  DROP CONSTRAINT IF EXISTS service_order_parts_part_id_fkey;
ALTER TABLE public.service_order_parts
  ADD CONSTRAINT service_order_parts_part_id_fkey
  FOREIGN KEY (part_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.parts_sales
  DROP CONSTRAINT IF EXISTS parts_sales_part_id_fkey;
ALTER TABLE public.parts_sales
  ADD CONSTRAINT parts_sales_part_id_fkey
  FOREIGN KEY (part_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.stock_adjustments
  DROP CONSTRAINT IF EXISTS stock_adjustments_part_id_fkey;
ALTER TABLE public.stock_adjustments
  ADD CONSTRAINT stock_adjustments_part_id_fkey
  FOREIGN KEY (part_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- 4. Funções passam a movimentar products
CREATE OR REPLACE FUNCTION public.add_os_part(_os_id uuid, _part_id uuid, _qty numeric, _unit_price numeric DEFAULT NULL::numeric, _description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_allow_neg boolean; v_price numeric; v_cost numeric; v_stock numeric; v_line_id uuid;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser positiva'; END IF;
  SELECT store_id INTO v_store FROM public.service_orders WHERE id = _os_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'OS não encontrada'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso à loja'; END IF;
  SELECT COALESCE(allow_negative_stock,false) INTO v_allow_neg FROM public.stores WHERE id=v_store;
  IF _part_id IS NOT NULL THEN
    SELECT sale_price, cost_price, stock_current INTO v_price, v_cost, v_stock
      FROM public.products WHERE id=_part_id AND store_id=v_store FOR UPDATE;
    IF v_price IS NULL THEN RAISE EXCEPTION 'Peça não encontrada nesta loja'; END IF;
    IF _qty > v_stock AND NOT v_allow_neg THEN RAISE EXCEPTION 'Estoque insuficiente (disponível: %)', v_stock; END IF;
    UPDATE public.products SET stock_current=stock_current-_qty WHERE id=_part_id;
  ELSE v_price:=0; v_cost:=0; END IF;
  INSERT INTO public.service_order_parts(service_order_id, part_id, store_id, qty, unit_price, unit_cost, description)
  VALUES (_os_id, _part_id, v_store, _qty, COALESCE(_unit_price, v_price, 0), COALESCE(v_cost,0), _description)
  RETURNING id INTO v_line_id;
  RETURN v_line_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.remove_os_part(_line_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_part uuid; v_qty numeric;
BEGIN
  SELECT store_id, part_id, qty INTO v_store, v_part, v_qty FROM public.service_order_parts WHERE id=_line_id FOR UPDATE;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Linha não encontrada'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso à loja'; END IF;
  IF v_part IS NOT NULL THEN UPDATE public.products SET stock_current=stock_current+v_qty WHERE id=v_part; END IF;
  DELETE FROM public.service_order_parts WHERE id=_line_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.cancel_service_order(_os_id uuid, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; r record;
BEGIN
  SELECT store_id INTO v_store FROM public.service_orders WHERE id=_os_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'OS não encontrada'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso à loja'; END IF;
  FOR r IN SELECT id, part_id, qty FROM public.service_order_parts WHERE service_order_id=_os_id AND part_id IS NOT NULL FOR UPDATE LOOP
    UPDATE public.products SET stock_current=stock_current+r.qty WHERE id=r.part_id;
    DELETE FROM public.service_order_parts WHERE id=r.id;
  END LOOP;
  UPDATE public.service_orders SET status='cancelado', cancellation_reason=COALESCE(_reason,cancellation_reason), updated_at=now() WHERE id=_os_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.add_tradein_repair_cost(_trade_in_id uuid, _parts jsonb DEFAULT '[]'::jsonb, _manual_cost numeric DEFAULT 0, _notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_current_costs numeric; v_current_parts jsonb;
  v_add_cost numeric := COALESCE(_manual_cost,0);
  v_part_id uuid; v_qty numeric; v_price numeric; v_cost numeric; v_stock numeric; v_allow_neg boolean; it jsonb;
BEGIN
  SELECT store_id, COALESCE(repair_costs,0), COALESCE(repair_parts,'[]'::jsonb)
    INTO v_store, v_current_costs, v_current_parts
    FROM public.trade_ins WHERE id=_trade_in_id FOR UPDATE;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Trade-in não encontrado'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso à loja'; END IF;
  SELECT COALESCE(allow_negative_stock,false) INTO v_allow_neg FROM public.stores WHERE id=v_store;
  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(_parts,'[]'::jsonb)) LOOP
    v_part_id := (it->>'part_id')::uuid;
    v_qty := COALESCE((it->>'qty')::numeric, 0);
    IF v_part_id IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
    SELECT sale_price, cost_price, stock_current INTO v_price, v_cost, v_stock
      FROM public.products WHERE id=v_part_id AND store_id=v_store FOR UPDATE;
    IF v_price IS NULL THEN RAISE EXCEPTION 'Peça % não encontrada', v_part_id; END IF;
    IF v_qty > v_stock AND NOT v_allow_neg THEN RAISE EXCEPTION 'Estoque insuficiente para peça %', v_part_id; END IF;
    UPDATE public.products SET stock_current=stock_current-v_qty WHERE id=v_part_id;
    v_add_cost := v_add_cost + (v_qty * COALESCE(v_cost,0));
    v_current_parts := v_current_parts || jsonb_build_array(jsonb_build_object(
      'part_id', v_part_id, 'qty', v_qty, 'unit_cost', v_cost, 'unit_price', v_price, 'added_at', now()));
  END LOOP;
  UPDATE public.trade_ins
     SET repair_costs = v_current_costs + v_add_cost,
         repair_parts = v_current_parts,
         notes = CASE WHEN _notes IS NULL OR _notes='' THEN notes ELSE COALESCE(notes,'') || E'\n[reparo pós-estoque] ' || _notes END,
         updated_at = now()
   WHERE id = _trade_in_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.finish_trade_in_repair(_trade_in_id uuid, _parts jsonb DEFAULT '[]'::jsonb, _manual_cost numeric DEFAULT 0, _manual_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ti record;
  v_uid uuid := auth.uid();
  v_store uuid;
  v_part jsonb;
  v_part_id uuid;
  v_qty numeric;
  v_unit_cost numeric;
  v_available int;
  v_name text;
  v_parts_cost numeric := 0;
  v_total_cost numeric;
  v_repair_snapshot jsonb := '[]'::jsonb;
  v_de text;
BEGIN
  SELECT * INTO v_ti FROM public.trade_ins WHERE id = _trade_in_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'trade_in not found'; END IF;
  v_store := v_ti.store_id;
  v_de := v_ti.status;

  IF NOT public.user_has_store_access(v_uid, v_store) THEN
    RAISE EXCEPTION 'sem permissão nesta loja';
  END IF;

  IF v_ti.status = 'em_estoque' THEN
    RETURN _trade_in_id;
  END IF;

  IF _parts IS NOT NULL AND jsonb_array_length(_parts) > 0 THEN
    FOR v_part IN SELECT * FROM jsonb_array_elements(_parts) LOOP
      v_part_id  := NULLIF(v_part->>'part_id','')::uuid;
      v_qty      := COALESCE((v_part->>'qty')::numeric, 0);
      v_unit_cost:= COALESCE((v_part->>'unit_cost')::numeric, 0);
      v_name     := COALESCE(v_part->>'name','');
      IF v_qty <= 0 THEN CONTINUE; END IF;

      IF v_part_id IS NOT NULL THEN
        SELECT stock_current, name, cost_price INTO v_available, v_name, v_unit_cost
        FROM public.products
        WHERE id = v_part_id AND store_id = v_store
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Peça % não encontrada nesta loja', v_part_id;
        END IF;
        IF v_available < v_qty THEN
          RAISE EXCEPTION 'Estoque insuficiente da peça "%": disponível % / necessário %', v_name, v_available, v_qty;
        END IF;
        UPDATE public.products
          SET stock_current = stock_current - v_qty
          WHERE id = v_part_id;
      END IF;

      v_parts_cost := v_parts_cost + (v_qty * COALESCE(v_unit_cost,0));
      v_repair_snapshot := v_repair_snapshot || jsonb_build_object(
        'part_id', v_part_id,
        'name', v_name,
        'qty', v_qty,
        'unit_cost', v_unit_cost,
        'source', CASE WHEN v_part_id IS NOT NULL THEN 'estoque' ELSE 'externo' END
      );
    END LOOP;
  END IF;

  v_total_cost := v_parts_cost + COALESCE(_manual_cost,0);

  UPDATE public.trade_ins
    SET status = 'em_estoque',
        repair_parts = v_repair_snapshot,
        repair_costs = v_total_cost,
        notes = CASE WHEN _manual_notes IS NOT NULL AND length(_manual_notes) > 0
                     THEN COALESCE(notes,'') || CASE WHEN notes IS NULL OR notes='' THEN '' ELSE E'\n' END || '[preparo] ' || _manual_notes
                     ELSE notes END
    WHERE id = _trade_in_id;

  INSERT INTO public.audit_log(user_id, store_id, action, entity, entity_id, module, details)
  VALUES (v_uid, v_store, 'mudanca_status', 'trade_in', _trade_in_id, 'trade_in',
          jsonb_build_object(
            'status', jsonb_build_object('de', v_de, 'para', 'em_estoque'),
            'motivo', 'Preparo concluído',
            'parts_cost', v_parts_cost,
            'manual_cost', COALESCE(_manual_cost,0),
            'total_cost', v_total_cost,
            'notas_preparo', _manual_notes,
            'parts', v_repair_snapshot
          ));

  RETURN _trade_in_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.product_stock_metrics(_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product_count bigint;
  v_units bigint;
  v_low_count bigint;
  v_stalled_count bigint;
  v_sale_value numeric;
  v_cost_value numeric;
  v_parts_count bigint;
  v_parts_units bigint;
  v_parts_low_count bigint;
  v_parts_sale_value numeric;
BEGIN
  IF _store_id IS NULL OR NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*),
    coalesce(sum(coalesce(stock_current, 0)), 0),
    count(*) FILTER (WHERE coalesce(stock_current, 0) <= coalesce(stock_min, 0)),
    count(*) FILTER (WHERE last_sold_at IS NULL OR last_sold_at < now() - interval '30 days'),
    coalesce(sum(coalesce(sale_price, 0) * coalesce(stock_current, 0)), 0),
    coalesce(sum(coalesce(cost_price, 0) * coalesce(stock_current, 0)), 0)
  INTO v_product_count, v_units, v_low_count, v_stalled_count, v_sale_value, v_cost_value
  FROM public.products
  WHERE store_id = _store_id
    AND item_kind IN ('aparelho','acessorio');

  SELECT
    count(*),
    coalesce(sum(coalesce(stock_current, 0)), 0),
    count(*) FILTER (WHERE coalesce(stock_current, 0) <= coalesce(stock_min, 0)),
    coalesce(sum(coalesce(sale_price, 0) * coalesce(stock_current, 0)), 0)
  INTO v_parts_count, v_parts_units, v_parts_low_count, v_parts_sale_value
  FROM public.products
  WHERE store_id = _store_id
    AND item_kind IN ('peca','ferramenta');

  RETURN jsonb_build_object(
    'product_count', v_product_count,
    'units', v_units,
    'low_count', v_low_count,
    'stalled_count', v_stalled_count,
    'sale_value', v_sale_value,
    'cost_value', v_cost_value,
    'parts_count', v_parts_count,
    'parts_units', v_parts_units,
    'parts_low_count', v_parts_low_count,
    'parts_sale_value', v_parts_sale_value,
    'alert_count', v_low_count + v_parts_low_count
  );
END;
$function$;