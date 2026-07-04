CREATE OR REPLACE FUNCTION public.stock_products_page(
  _store_id uuid,
  _query text DEFAULT '',
  _filter text DEFAULT 'all',
  _brand text DEFAULT 'all',
  _category text DEFAULT 'all',
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  name text,
  sku text,
  brand text,
  category text,
  condition text,
  status public.product_status,
  cost_price numeric,
  sale_price numeric,
  stock_current integer,
  stock_min integer,
  last_sold_at timestamp with time zone,
  supplier text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_q text := lower(trim(coalesce(_query, '')));
  v_filter text := coalesce(nullif(_filter, ''), 'all');
  v_brand text := coalesce(nullif(_brand, ''), 'all');
  v_category text := coalesce(nullif(_category, ''), 'all');
  v_page integer := greatest(1, coalesce(_page, 1));
  v_page_size integer := greatest(1, least(coalesce(_page_size, 20), 100));
BEGIN
  IF _store_id IS NULL OR NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.sku,
    p.brand,
    p.category,
    p.condition,
    p.status,
    p.cost_price,
    p.sale_price,
    p.stock_current,
    p.stock_min,
    p.last_sold_at,
    p.supplier,
    count(*) OVER() AS total_count
  FROM public.products p
  WHERE p.store_id = _store_id
    AND (v_q = '' OR lower(coalesce(p.name, '') || ' ' || coalesce(p.sku, '') || ' ' || coalesce(p.brand, '') || ' ' || coalesce(p.category, '') || ' ' || coalesce(p.subcategory, '') || ' ' || coalesce(p.ean, '')) LIKE '%' || v_q || '%')
    AND (v_brand = 'all' OR coalesce(p.brand, '—') = v_brand)
    AND (v_category = 'all' OR coalesce(p.category, '—') = v_category)
    AND (
      v_filter = 'all'
      OR (v_filter = 'low' AND coalesce(p.stock_current, 0) <= coalesce(p.stock_min, 0))
      OR (v_filter = 'stalled' AND (p.last_sold_at IS NULL OR p.last_sold_at < now() - interval '30 days'))
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT v_page_size
  OFFSET (v_page - 1) * v_page_size;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.stock_products_page(uuid, text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stock_products_page(uuid, text, text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.stock_products_page(uuid, text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_products_page(uuid, text, text, text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.product_stock_filter_options(_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brands jsonb;
  v_categories jsonb;
  v_suppliers jsonb;
BEGIN
  IF _store_id IS NULL OR NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(x.brand ORDER BY x.brand), '[]'::jsonb)
    INTO v_brands
  FROM (
    SELECT DISTINCT brand
    FROM public.products
    WHERE store_id = _store_id AND nullif(trim(coalesce(brand, '')), '') IS NOT NULL
  ) x;

  SELECT coalesce(jsonb_agg(x.category ORDER BY x.category), '[]'::jsonb)
    INTO v_categories
  FROM (
    SELECT DISTINCT category
    FROM public.products
    WHERE store_id = _store_id AND nullif(trim(coalesce(category, '')), '') IS NOT NULL
  ) x;

  SELECT coalesce(jsonb_agg(x.supplier ORDER BY x.supplier), '[]'::jsonb)
    INTO v_suppliers
  FROM (
    SELECT DISTINCT supplier
    FROM public.products
    WHERE store_id = _store_id AND nullif(trim(coalesce(supplier, '')), '') IS NOT NULL
  ) x;

  RETURN jsonb_build_object('brands', v_brands, 'categories', v_categories, 'suppliers', v_suppliers);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.product_stock_filter_options(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_stock_filter_options(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.product_stock_filter_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_stock_filter_options(uuid) TO service_role;