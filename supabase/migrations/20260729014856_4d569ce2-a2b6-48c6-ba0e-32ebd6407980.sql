CREATE OR REPLACE FUNCTION public.split_device_units(_product_id uuid, _units jsonb)
RETURNS TABLE (product_id uuid, imei text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.products%ROWTYPE;
  u jsonb;
  idx int := 0;
  new_id uuid;
  v_imei text;
  v_cost numeric;
  n int;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin_master(auth.uid())
     AND NOT public.user_has_store_access(auth.uid(), p.store_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta loja';
  END IF;

  IF p.item_kind <> 'aparelho' THEN
    RAISE EXCEPTION 'Somente aparelhos podem ser desdobrados';
  END IF;

  n := jsonb_array_length(COALESCE(_units, '[]'::jsonb));
  IF n <> COALESCE(p.stock_current, 0) THEN
    RAISE EXCEPTION 'Informe exatamente % unidade(s); recebidas %', COALESCE(p.stock_current,0), n;
  END IF;
  IF n < 2 THEN
    RAISE EXCEPTION 'Produto não possui quantidade maior que 1';
  END IF;

  FOR u IN SELECT * FROM jsonb_array_elements(_units) LOOP
    idx := idx + 1;
    v_imei := NULLIF(btrim(COALESCE(u->>'imei','')), '');
    v_cost := COALESCE(NULLIF(u->>'cost_price','')::numeric, p.cost_price);

    IF v_imei IS NOT NULL AND NOT public.is_valid_imei(v_imei) THEN
      RAISE EXCEPTION 'IMEI inválido na unidade %: %', idx, v_imei;
    END IF;

    IF idx = 1 THEN
      -- a primeira unidade permanece no registro original
      UPDATE public.products
         SET stock_current = 1,
             imei = v_imei,
             imei2 = NULLIF(btrim(COALESCE(u->>'imei2','')), ''),
             color = COALESCE(NULLIF(btrim(COALESCE(u->>'color','')), ''), color),
             storage_gb = COALESCE(NULLIF(u->>'storage_gb','')::int, storage_gb),
             battery_health = COALESCE(NULLIF(u->>'battery_health','')::int, battery_health),
             cost_price = v_cost,
             updated_at = now()
       WHERE id = p.id;

      INSERT INTO public.stock_movements
        (store_id, product_id, occurred_at, type, quantity, unit_cost, origin_table, origin_id, notes)
      VALUES (p.store_id, p.id, now(), 'ajuste', 1 - COALESCE(p.stock_current,0), v_cost,
              'products', p.id,
              format('Desdobramento em %s unidades individuais', n));

      product_id := p.id; imei := v_imei; RETURN NEXT;
    ELSE
      INSERT INTO public.products (
        store_id, name, sku, ean, brand, compatible_model, category, subcategory, condition,
        supplier, cost_price, sale_price, stock_current, stock_min, stock_max, location, photos,
        visible_in_catalog, status, data_entrada, imei, imei2, item_kind, battery_health, color,
        storage_gb, compatible_models, category_other, notes
      )
      VALUES (
        p.store_id, p.name,
        CASE WHEN p.sku IS NULL THEN NULL ELSE p.sku || '-' || lpad(idx::text, 2, '0') END,
        p.ean, p.brand, p.compatible_model, p.category, p.subcategory, p.condition,
        p.supplier, v_cost, p.sale_price, 1, p.stock_min, p.stock_max, p.location, p.photos,
        p.visible_in_catalog, p.status, p.data_entrada,
        v_imei,
        NULLIF(btrim(COALESCE(u->>'imei2','')), ''),
        p.item_kind,
        COALESCE(NULLIF(u->>'battery_health','')::int, p.battery_health),
        COALESCE(NULLIF(btrim(COALESCE(u->>'color','')), ''), p.color),
        COALESCE(NULLIF(u->>'storage_gb','')::int, p.storage_gb),
        p.compatible_models, p.category_other, p.notes
      )
      RETURNING id INTO new_id;

      INSERT INTO public.stock_movements
        (store_id, product_id, occurred_at, type, quantity, unit_cost, origin_table, origin_id, notes)
      VALUES (p.store_id, new_id, now(), 'saldo_inicial', 1, v_cost, 'products', p.id,
              format('Unidade desdobrada do produto %s', p.id));

      product_id := new_id; imei := v_imei; RETURN NEXT;
    END IF;
  END LOOP;

  INSERT INTO public.audit_log (store_id, user_id, action, table_name, record_id, new_values)
  VALUES (p.store_id, auth.uid(), 'desdobramento_aparelho', 'products', p.id,
          jsonb_build_object('units', n, 'product_name', p.name));

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.split_device_units(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.split_device_units(uuid, jsonb) TO authenticated, service_role;