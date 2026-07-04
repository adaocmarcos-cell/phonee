DROP FUNCTION IF EXISTS public.stock_products_page(uuid, text, text, text, text, integer, integer);

CREATE FUNCTION public.stock_products_page(
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
  status text,
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

REVOKE EXECUTE ON FUNCTION public.stock_products_page(uuid, text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stock_products_page(uuid, text, text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.stock_products_page(uuid, text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_products_page(uuid, text, text, text, text, integer, integer) TO service_role;