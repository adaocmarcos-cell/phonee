-- Adiciona parts_cost_value às métricas de estoque para permitir
-- comparativo custo x venda considerando todo o estoque.
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
  v_parts_cost_value numeric;
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
    coalesce(sum(coalesce(sale_price, 0) * coalesce(stock_current, 0)), 0),
    coalesce(sum(coalesce(cost_price, 0) * coalesce(stock_current, 0)), 0)
  INTO v_parts_count, v_parts_units, v_parts_low_count, v_parts_sale_value, v_parts_cost_value
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
    'parts_cost_value', v_parts_cost_value,
    'alert_count', v_low_count + v_parts_low_count
  );
END;
$function$;