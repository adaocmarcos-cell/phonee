CREATE OR REPLACE FUNCTION public.search_sale_products(
  _store_id uuid,
  _query text DEFAULT '',
  _limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  name text,
  sku text,
  sale_price numeric,
  cost_price numeric,
  stock_current integer,
  category text,
  subcategory text,
  ean text,
  brand text,
  compatible_model text,
  color text,
  storage text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_q text := lower(trim(coalesce(_query, '')));
  v_limit integer := greatest(1, least(coalesce(_limit, 20), 50));
BEGIN
  IF _store_id IS NULL OR NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.sku,
    p.sale_price,
    p.cost_price,
    p.stock_current,
    p.category,
    p.subcategory,
    p.ean,
    p.brand,
    p.compatible_model,
    p.color,
    p.storage
  FROM public.products p
  WHERE p.store_id = _store_id
    AND (
      v_q = ''
      OR lower(coalesce(p.name, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.sku, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.ean, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.category, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.subcategory, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.brand, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.compatible_model, '')) LIKE '%' || v_q || '%'
    )
  ORDER BY
    CASE
      WHEN v_q <> '' AND lower(coalesce(p.sku, '')) = v_q THEN 0
      WHEN v_q <> '' AND lower(coalesce(p.ean, '')) = v_q THEN 1
      WHEN v_q <> '' AND lower(coalesce(p.name, '')) = v_q THEN 2
      WHEN v_q <> '' AND lower(coalesce(p.name, '')) LIKE v_q || '%' THEN 3
      ELSE 4
    END,
    p.name ASC
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.product_stock_metrics(_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  WHERE store_id = _store_id;

  SELECT
    count(*),
    coalesce(sum(coalesce(stock_current, 0)), 0),
    count(*) FILTER (WHERE coalesce(stock_current, 0) <= coalesce(stock_min, 0)),
    coalesce(sum(coalesce(sale_price, 0) * coalesce(stock_current, 0)), 0)
  INTO v_parts_count, v_parts_units, v_parts_low_count, v_parts_sale_value
  FROM public.parts_inventory
  WHERE store_id = _store_id;

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

GRANT EXECUTE ON FUNCTION public.product_stock_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_stock_metrics(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS products_store_name_idx ON public.products (store_id, name);
CREATE INDEX IF NOT EXISTS products_store_sku_idx ON public.products (store_id, sku);
CREATE INDEX IF NOT EXISTS products_store_ean_idx ON public.products (store_id, ean);
CREATE INDEX IF NOT EXISTS products_store_stock_metrics_idx ON public.products (store_id, stock_current, stock_min, last_sold_at);
CREATE INDEX IF NOT EXISTS parts_inventory_store_stock_metrics_idx ON public.parts_inventory (store_id, stock_current, stock_min);