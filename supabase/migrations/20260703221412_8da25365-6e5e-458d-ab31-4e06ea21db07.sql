CREATE OR REPLACE FUNCTION public.phonee_test_negative_stock_sale(_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_store_id uuid;
  v_product_id uuid;
  v_result jsonb;
  v_stock_after int;
  v_prev_jwt text;
  v_error text;
  v_negative_ok boolean := false;
  v_positive_blocks boolean := false;
BEGIN
  v_prev_jwt := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _owner::text, 'role', 'authenticated')::text, true);

  INSERT INTO public.stores (name, slug, owner_id, allow_negative_stock)
  VALUES ('smoke-neg-stock', 'smoke-neg-'||substr(gen_random_uuid()::text,1,8), _owner, true)
  RETURNING id INTO v_store_id;

  INSERT INTO public.products (store_id, name, sku, sale_price, cost_price, stock_current, category)
  VALUES (v_store_id, 'Produto Smoke Neg', 'SMK-NEG-'||substr(gen_random_uuid()::text,1,6), 100.00, 50.00, 0, 'acessorio'::public.product_category)
  RETURNING id INTO v_product_id;

  BEGIN
    v_result := public.create_sale(
      v_store_id, NULL, 'Cliente Teste', NULL, NULL,
      'dinheiro'::public.payment_method, 1, 0, 'smoke test',
      jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 1, 'unit_price', 100.00)),
      jsonb_build_array(jsonb_build_object('method', 'dinheiro', 'amount', 100.00))
    );
    SELECT stock_current INTO v_stock_after FROM public.products WHERE id = v_product_id;
    v_negative_ok := (v_stock_after = -1);
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_negative_ok := false;
  END;

  UPDATE public.stores SET allow_negative_stock = false WHERE id = v_store_id;
  BEGIN
    PERFORM public.create_sale(
      v_store_id, NULL, 'Cliente Teste 2', NULL, NULL,
      'dinheiro'::public.payment_method, 1, 0, 'smoke test bloqueio',
      jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 100, 'unit_price', 100.00)),
      jsonb_build_array(jsonb_build_object('method', 'dinheiro', 'amount', 10000.00))
    );
    v_positive_blocks := false;
  EXCEPTION WHEN OTHERS THEN
    v_positive_blocks := (SQLERRM ILIKE '%estoque insuficiente%');
  END;

  DELETE FROM public.alerts WHERE store_id = v_store_id;
  DELETE FROM public.sales WHERE store_id = v_store_id;
  DELETE FROM public.products WHERE store_id = v_store_id;
  DELETE FROM public.stores WHERE id = v_store_id;

  PERFORM set_config('request.jwt.claims', COALESCE(v_prev_jwt, ''), true);

  RETURN jsonb_build_object(
    'pass', v_negative_ok AND v_positive_blocks,
    'allow_negative_created_sale', v_negative_ok,
    'stock_after_negative_sale', v_stock_after,
    'block_when_disabled', v_positive_blocks,
    'error', v_error,
    'result', v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.phonee_test_negative_stock_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phonee_test_negative_stock_sale(uuid) TO service_role, authenticated;