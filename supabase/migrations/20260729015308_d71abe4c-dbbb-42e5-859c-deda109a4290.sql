CREATE OR REPLACE FUNCTION public.phonee_stock_contract_test()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_pass boolean := true;
  v_ok boolean;
  v_n int;
  v_missing text[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 1) rotinas obrigatórias existem
  SELECT array_agg(name) INTO v_missing
  FROM unnest(ARRAY['reconcile_stock','split_device_units','product_stock_metrics',
                    'stock_products_page','search_sale_products','is_valid_imei']) AS name
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = name
  );
  v_ok := v_missing IS NULL; v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','stock_functions_exist','pass',v_ok,
    'detail', jsonb_build_object('missing', COALESCE(to_jsonb(v_missing), '[]'::jsonb))));

  -- 2) livro-razão bate com a quantidade atual (sem divergência)
  SELECT count(*) INTO v_n FROM (
    SELECT p.id
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT m.balance_after
      FROM public.stock_movements m
      WHERE m.product_id = p.id
      ORDER BY m.occurred_at DESC, m.created_at DESC, m.id DESC
      LIMIT 1
    ) l ON true
    WHERE COALESCE(p.stock_current,0) <> COALESCE(l.balance_after,0)
  ) t;
  v_ok := (v_n = 0); v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','ledger_matches_stock','pass',v_ok,'detail',jsonb_build_object('divergentes', v_n)));

  -- 3) todo produto com estoque possui saldo de abertura no livro
  SELECT count(*) INTO v_n
  FROM public.products p
  WHERE COALESCE(p.stock_current,0) <> 0
    AND NOT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.product_id = p.id);
  v_ok := (v_n = 0); v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','all_products_have_ledger','pass',v_ok,'detail',jsonb_build_object('sem_ledger', v_n)));

  -- 4) aparelho é unitário
  SELECT count(*) INTO v_n
  FROM public.products
  WHERE item_kind = 'aparelho' AND COALESCE(stock_current,0) > 1;
  v_ok := (v_n = 0); v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','devices_are_unitary','pass',v_ok,'detail',jsonb_build_object('com_qtd_maior_que_1', v_n)));

  -- 5) IMEI preenchido é sempre válido
  SELECT count(*) INTO v_n
  FROM public.products
  WHERE imei IS NOT NULL AND imei <> '' AND NOT public.is_valid_imei(imei);
  v_ok := (v_n = 0); v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','imei_valid','pass',v_ok,'detail',jsonb_build_object('invalidos', v_n)));

  -- 6) IMEI único por loja
  SELECT count(*) INTO v_n FROM (
    SELECT store_id, imei FROM public.products
    WHERE imei IS NOT NULL AND imei <> ''
    GROUP BY store_id, imei HAVING count(*) > 1
  ) d;
  v_ok := (v_n = 0); v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','imei_unique_per_store','pass',v_ok,'detail',jsonb_build_object('duplicados', v_n)));

  -- 7) tabela legada removida
  v_ok := to_regclass('public.parts_inventory') IS NULL; v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','parts_inventory_removed','pass',v_ok,'detail','{}'::jsonb));

  -- 8) ferramentas não somam valor de estoque nas métricas
  v_ok := (SELECT prosrc LIKE '%item_kind = ''ferramenta''%'
             FROM pg_proc WHERE proname = 'product_stock_metrics' LIMIT 1);
  v_ok := COALESCE(v_ok, false); v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','tools_excluded_from_stock_value','pass',v_ok,'detail','{}'::jsonb));

  RETURN jsonb_build_object('pass', v_pass, 'checks', v_checks, 'ran_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.phonee_stock_contract_test() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.phonee_stock_contract_test() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.phonee_smoke_test_run_and_log(_source text DEFAULT 'manual')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_result jsonb;
  v_stock jsonb;
  v_all_checks jsonb;
  v_pass boolean;
  v_failed jsonb;
  v_id uuid;
BEGIN
  IF _source = 'manual' AND NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT ur.user_id INTO v_admin
    FROM public.user_roles ur
   WHERE ur.role = 'admin_master'
   ORDER BY ur.user_id
   LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'no admin_master user available to run smoke test';
  END IF;

  v_result := public.phonee_smoke_test(v_admin);
  v_stock := public.phonee_stock_contract_test();

  v_all_checks := COALESCE(v_result->'checks', '[]'::jsonb) || COALESCE(v_stock->'checks', '[]'::jsonb);
  v_pass := COALESCE((v_result->>'pass')::boolean, false)
        AND COALESCE((v_stock->>'pass')::boolean, false);

  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_failed
    FROM jsonb_array_elements(v_all_checks) c
   WHERE (c->>'pass')::boolean = false;

  INSERT INTO public.phonee_smoke_test_runs (pass, source, run_by, checks, failed_checks)
  VALUES (v_pass, _source, COALESCE(auth.uid(), v_admin), v_all_checks, v_failed)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.phonee_smoke_test_run_and_log(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.phonee_smoke_test_run_and_log(text) TO authenticated, service_role;