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
    p.category::text,
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

REVOKE EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) TO service_role;