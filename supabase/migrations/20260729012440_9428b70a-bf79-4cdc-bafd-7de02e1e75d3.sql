-- ============================================================
-- ETAPA 2/3: separar visualmente venda (aparelho/acessorio)
-- de assistência (peca/ferramenta) no cadastro unificado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.stock_products_page(_store_id uuid, _query text DEFAULT ''::text, _filter text DEFAULT 'all'::text, _brand text DEFAULT 'all'::text, _category text DEFAULT 'all'::text, _page integer DEFAULT 1, _page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, name text, sku text, brand text, category text, condition text, status text, cost_price numeric, sale_price numeric, stock_current integer, stock_min integer, last_sold_at timestamp with time zone, supplier text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    p.category::text,
    p.condition::text,
    p.status::text,
    p.cost_price,
    p.sale_price,
    p.stock_current,
    p.stock_min,
    p.last_sold_at,
    p.supplier,
    count(*) OVER() AS total_count
  FROM public.products p
  WHERE p.store_id = _store_id
    AND p.item_kind IN ('aparelho','acessorio')
    AND (v_q = '' OR lower(coalesce(p.name, '') || ' ' || coalesce(p.sku, '') || ' ' || coalesce(p.brand, '') || ' ' || coalesce(p.category::text, '') || ' ' || coalesce(p.subcategory, '') || ' ' || coalesce(p.ean, '')) LIKE '%' || v_q || '%')
    AND (v_brand = 'all' OR coalesce(p.brand, '—') = v_brand)
    AND (v_category = 'all' OR coalesce(p.category::text, '—') = v_category)
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

CREATE OR REPLACE FUNCTION public.product_stock_filter_options(_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    WHERE store_id = _store_id
      AND item_kind IN ('aparelho','acessorio')
      AND nullif(trim(coalesce(brand, '')), '') IS NOT NULL
  ) x;

  SELECT coalesce(jsonb_agg(x.category ORDER BY x.category), '[]'::jsonb)
    INTO v_categories
  FROM (
    SELECT DISTINCT category
    FROM public.products
    WHERE store_id = _store_id
      AND item_kind IN ('aparelho','acessorio')
      AND nullif(trim(coalesce(category, '')), '') IS NOT NULL
  ) x;

  SELECT coalesce(jsonb_agg(x.supplier ORDER BY x.supplier), '[]'::jsonb)
    INTO v_suppliers
  FROM (
    SELECT DISTINCT supplier
    FROM public.products
    WHERE store_id = _store_id
      AND item_kind IN ('aparelho','acessorio')
      AND nullif(trim(coalesce(supplier, '')), '') IS NOT NULL
  ) x;

  RETURN jsonb_build_object('brands', v_brands, 'categories', v_categories, 'suppliers', v_suppliers);
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_sale_products(_store_id uuid, _query text DEFAULT ''::text, _limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, name text, sku text, sale_price numeric, cost_price numeric, stock_current integer, category text, subcategory text, ean text, brand text, compatible_model text, color text, storage text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    p.category::text,
    p.subcategory,
    p.ean,
    p.brand,
    p.compatible_model,
    NULL::text AS color,
    NULL::text AS storage
  FROM public.products p
  WHERE p.store_id = _store_id
    AND p.item_kind IN ('aparelho','acessorio')
    AND (
      v_q = ''
      OR lower(coalesce(p.name, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.sku, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.ean, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.category::text, '')) LIKE '%' || v_q || '%'
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