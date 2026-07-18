
ALTER TABLE public.service_order_parts ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.service_order_parts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.service_order_parts ALTER COLUMN part_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.recalc_service_order_totals(_os_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parts numeric; v_labor numeric;
BEGIN
  SELECT COALESCE(SUM(qty * unit_price), 0) INTO v_parts FROM public.service_order_parts WHERE service_order_id = _os_id;
  SELECT COALESCE(labor_value, 0) INTO v_labor FROM public.service_orders WHERE id = _os_id;
  UPDATE public.service_orders SET parts_value = v_parts, total_value = v_parts + COALESCE(v_labor,0), updated_at = now() WHERE id = _os_id;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_service_order_parts_recalc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM public.recalc_service_order_totals(OLD.service_order_id); RETURN OLD;
  ELSE PERFORM public.recalc_service_order_totals(NEW.service_order_id);
    IF TG_OP='UPDATE' AND NEW.service_order_id<>OLD.service_order_id THEN
      PERFORM public.recalc_service_order_totals(OLD.service_order_id);
    END IF;
    RETURN NEW;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS trg_service_order_parts_recalc ON public.service_order_parts;
CREATE TRIGGER trg_service_order_parts_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.service_order_parts
FOR EACH ROW EXECUTE FUNCTION public.tg_service_order_parts_recalc();

CREATE OR REPLACE FUNCTION public.add_os_part(
  _os_id uuid, _part_id uuid, _qty numeric,
  _unit_price numeric DEFAULT NULL, _description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_allow_neg boolean; v_price numeric; v_cost numeric; v_stock numeric; v_line_id uuid;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser positiva'; END IF;
  SELECT store_id INTO v_store FROM public.service_orders WHERE id = _os_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'OS não encontrada'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso à loja'; END IF;
  SELECT COALESCE(allow_negative_stock,false) INTO v_allow_neg FROM public.stores WHERE id=v_store;
  IF _part_id IS NOT NULL THEN
    SELECT sale_price, cost_price, stock_current INTO v_price, v_cost, v_stock
      FROM public.parts_inventory WHERE id=_part_id AND store_id=v_store FOR UPDATE;
    IF v_price IS NULL THEN RAISE EXCEPTION 'Peça não encontrada nesta loja'; END IF;
    IF _qty > v_stock AND NOT v_allow_neg THEN RAISE EXCEPTION 'Estoque insuficiente (disponível: %)', v_stock; END IF;
    UPDATE public.parts_inventory SET stock_current=stock_current-_qty WHERE id=_part_id;
  ELSE v_price:=0; v_cost:=0; END IF;
  INSERT INTO public.service_order_parts(service_order_id, part_id, store_id, qty, unit_price, unit_cost, description)
  VALUES (_os_id, _part_id, v_store, _qty, COALESCE(_unit_price, v_price, 0), COALESCE(v_cost,0), _description)
  RETURNING id INTO v_line_id;
  RETURN v_line_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.add_os_part(uuid,uuid,numeric,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_os_part(_line_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_part uuid; v_qty numeric;
BEGIN
  SELECT store_id, part_id, qty INTO v_store, v_part, v_qty FROM public.service_order_parts WHERE id=_line_id FOR UPDATE;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Linha não encontrada'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso à loja'; END IF;
  IF v_part IS NOT NULL THEN UPDATE public.parts_inventory SET stock_current=stock_current+v_qty WHERE id=v_part; END IF;
  DELETE FROM public.service_order_parts WHERE id=_line_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.remove_os_part(uuid) TO authenticated;

ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION public.cancel_service_order(_os_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; r record;
BEGIN
  SELECT store_id INTO v_store FROM public.service_orders WHERE id=_os_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'OS não encontrada'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), v_store) THEN RAISE EXCEPTION 'Sem acesso à loja'; END IF;
  FOR r IN SELECT id, part_id, qty FROM public.service_order_parts WHERE service_order_id=_os_id AND part_id IS NOT NULL FOR UPDATE LOOP
    UPDATE public.parts_inventory SET stock_current=stock_current+r.qty WHERE id=r.part_id;
    DELETE FROM public.service_order_parts WHERE id=r.id;
  END LOOP;
  UPDATE public.service_orders SET status='cancelado', cancellation_reason=COALESCE(_reason,cancellation_reason), updated_at=now() WHERE id=_os_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.cancel_service_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_tradein_repair_cost(
  _trade_in_id uuid, _parts jsonb DEFAULT '[]'::jsonb, _manual_cost numeric DEFAULT 0, _notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      FROM public.parts_inventory WHERE id=v_part_id AND store_id=v_store FOR UPDATE;
    IF v_price IS NULL THEN RAISE EXCEPTION 'Peça % não encontrada', v_part_id; END IF;
    IF v_qty > v_stock AND NOT v_allow_neg THEN RAISE EXCEPTION 'Estoque insuficiente para peça %', v_part_id; END IF;
    UPDATE public.parts_inventory SET stock_current=stock_current-v_qty WHERE id=v_part_id;
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
END; $$;
GRANT EXECUTE ON FUNCTION public.add_tradein_repair_cost(uuid, jsonb, numeric, text) TO authenticated;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS imei text;

CREATE OR REPLACE FUNCTION public.tg_tradein_propagate_imei()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.imei IS NOT NULL AND NEW.imei<>'' THEN
    UPDATE public.products SET imei = NEW.imei WHERE id=NEW.product_id AND (imei IS NULL OR imei='');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_tradein_propagate_imei ON public.trade_ins;
CREATE TRIGGER trg_tradein_propagate_imei
AFTER INSERT OR UPDATE OF product_id, imei ON public.trade_ins
FOR EACH ROW EXECUTE FUNCTION public.tg_tradein_propagate_imei();

CREATE OR REPLACE FUNCTION public.validate_imei_15()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE col text := TG_ARGV[0]; v text;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', col) INTO v USING NEW;
  IF v IS NOT NULL AND v<>'' AND v !~ '^\d{15}$' THEN
    RAISE EXCEPTION 'IMEI inválido em %: deve ter 15 dígitos numéricos', col;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_imei_products ON public.products;
CREATE TRIGGER trg_validate_imei_products BEFORE INSERT OR UPDATE OF imei ON public.products
FOR EACH ROW EXECUTE FUNCTION public.validate_imei_15('imei');
DROP TRIGGER IF EXISTS trg_validate_imei_tradeins ON public.trade_ins;
CREATE TRIGGER trg_validate_imei_tradeins BEFORE INSERT OR UPDATE OF imei ON public.trade_ins
FOR EACH ROW EXECUTE FUNCTION public.validate_imei_15('imei');
DROP TRIGGER IF EXISTS trg_validate_imei_sale_items ON public.sale_items;
CREATE TRIGGER trg_validate_imei_sale_items BEFORE INSERT OR UPDATE OF imei_serial ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.validate_imei_15('imei_serial');
DROP TRIGGER IF EXISTS trg_validate_imei_os1 ON public.service_orders;
CREATE TRIGGER trg_validate_imei_os1 BEFORE INSERT OR UPDATE OF device_imei1 ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.validate_imei_15('device_imei1');
DROP TRIGGER IF EXISTS trg_validate_imei_os2 ON public.service_orders;
CREATE TRIGGER trg_validate_imei_os2 BEFORE INSERT OR UPDATE OF device_imei2 ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.validate_imei_15('device_imei2');

CREATE UNIQUE INDEX IF NOT EXISTS products_active_imei_unique
  ON public.products (store_id, imei) WHERE imei IS NOT NULL AND status='ativo' AND stock_current > 0;

CREATE OR REPLACE FUNCTION public.track_device_by_imei(_store_id uuid, _imei text)
RETURNS TABLE(event_at timestamptz, event_type text, ref_id uuid, label text, details jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ti.created_at, 'trade_in'::text, ti.id,
         format('Entrada por troca: %s %s', COALESCE(ti.brand,''), COALESCE(ti.model,'')),
         jsonb_build_object('customer', ti.customer_name, 'entry_value', ti.entry_value, 'status', ti.status)
    FROM public.trade_ins ti
   WHERE ti.store_id=_store_id AND ti.imei=_imei
     AND public.user_has_store_access(auth.uid(), _store_id)
  UNION ALL
  SELECT p.created_at, 'produto', p.id,
         format('Em estoque: %s', p.name),
         jsonb_build_object('sku', p.sku, 'stock_current', p.stock_current, 'status', p.status, 'sale_price', p.sale_price)
    FROM public.products p
   WHERE p.store_id=_store_id AND p.imei=_imei
     AND public.user_has_store_access(auth.uid(), _store_id)
  UNION ALL
  SELECT s.created_at, 'venda', s.id,
         format('Venda #%s', s.sale_number),
         jsonb_build_object('customer', s.customer_name, 'total', s.total)
    FROM public.sale_items si JOIN public.sales s ON s.id=si.sale_id
   WHERE s.store_id=_store_id AND si.imei_serial=_imei
     AND public.user_has_store_access(auth.uid(), _store_id)
  UNION ALL
  SELECT so.created_at, 'os', so.id,
         format('OS #%s', so.os_number),
         jsonb_build_object('status', so.status, 'customer', so.customer_name, 'total', so.total_value)
    FROM public.service_orders so
   WHERE so.store_id=_store_id
     AND (so.device_imei1=_imei OR so.device_imei2=_imei)
     AND public.user_has_store_access(auth.uid(), _store_id)
  ORDER BY 1 ASC
$$;
GRANT EXECUTE ON FUNCTION public.track_device_by_imei(uuid, text) TO authenticated;
