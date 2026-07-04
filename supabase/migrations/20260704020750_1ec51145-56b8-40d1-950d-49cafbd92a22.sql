REVOKE EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_sale_products(uuid, text, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.product_stock_metrics(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_stock_metrics(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.product_stock_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_stock_metrics(uuid) TO service_role;