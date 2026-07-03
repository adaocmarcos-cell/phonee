
-- 1) List any Asaas charge id present in more than one subscription row.
CREATE OR REPLACE FUNCTION public.phonee_asaas_charge_duplicates()
RETURNS TABLE(asaas_charge_id text, qtd bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.asaas_charge_id, count(*)::bigint
  FROM public.subscriptions s
  WHERE s.asaas_charge_id IS NOT NULL
  GROUP BY s.asaas_charge_id
  HAVING count(*) > 1;
END $$;

REVOKE ALL ON FUNCTION public.phonee_asaas_charge_duplicates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_asaas_charge_duplicates() TO authenticated;

-- 2) Return whether the partial unique index exists.
CREATE OR REPLACE FUNCTION public.phonee_asaas_index_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_def text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT indexdef INTO v_def
    FROM pg_indexes
   WHERE schemaname='public'
     AND tablename='subscriptions'
     AND indexname='subscriptions_charge_uidx';
  RETURN jsonb_build_object(
    'exists', v_def IS NOT NULL,
    'is_unique', v_def IS NOT NULL AND position('UNIQUE' in v_def) > 0,
    'is_partial', v_def IS NOT NULL AND position('WHERE' in v_def) > 0,
    'definition', v_def
  );
END $$;

REVOKE ALL ON FUNCTION public.phonee_asaas_index_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_asaas_index_status() TO authenticated;

-- 3) Live probe: inserts one row with a synthetic charge id, then tries to
--    insert a duplicate. The second insert MUST fail with unique_violation
--    (SQLSTATE 23505). Both rows are cleaned up before returning.
CREATE OR REPLACE FUNCTION public.phonee_asaas_idempotency_probe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge text := 'PROBE_' || replace(gen_random_uuid()::text, '-', '');
  v_first_ok boolean := false;
  v_second_blocked boolean := false;
  v_sqlstate text;
  v_err text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  BEGIN
    INSERT INTO public.subscriptions (
      plan_id, customer_name, customer_email, amount_cents,
      billing_cycle, status, payment_method, asaas_charge_id
    )
    SELECT id, 'probe', 'probe-' || v_charge || '@example.invalid', 0,
           'annual', 'pending', 'PIX', v_charge
      FROM public.plans
     ORDER BY created_at ASC
     LIMIT 1;
    v_first_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  IF v_first_ok THEN
    BEGIN
      INSERT INTO public.subscriptions (
        plan_id, customer_name, customer_email, amount_cents,
        billing_cycle, status, payment_method, asaas_charge_id
      )
      SELECT id, 'probe2', 'probe2-' || v_charge || '@example.invalid', 0,
             'annual', 'pending', 'PIX', v_charge
        FROM public.plans
       ORDER BY created_at ASC
       LIMIT 1;
      v_second_blocked := false;
    EXCEPTION WHEN unique_violation THEN
      v_second_blocked := true;
      v_sqlstate := SQLSTATE;
    WHEN OTHERS THEN
      v_second_blocked := false;
      v_sqlstate := SQLSTATE;
      v_err := SQLERRM;
    END;
  END IF;

  -- Cleanup probe rows (both survivor and any partial insert).
  DELETE FROM public.subscriptions WHERE asaas_charge_id = v_charge;

  RETURN jsonb_build_object(
    'pass', v_first_ok AND v_second_blocked,
    'first_insert_ok', v_first_ok,
    'duplicate_rejected', v_second_blocked,
    'sqlstate', v_sqlstate,
    'error', v_err,
    'charge_probe', v_charge
  );
END $$;

REVOKE ALL ON FUNCTION public.phonee_asaas_idempotency_probe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_asaas_idempotency_probe() TO authenticated;

-- 4) Extend phonee_smoke_test with 3 new checks for Asaas idempotency.
CREATE OR REPLACE FUNCTION public.phonee_smoke_test(_as_admin uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_admin uuid := COALESCE(_as_admin, auth.uid());
  v_checks jsonb := '[]'::jsonb;
  v_pass boolean := true;
  v_count int;
  v_missing text[];
  v_expected text[] := ARRAY[
    'phonee_coupons_revenue','phonee_growth','phonee_marketing_dashboard',
    'phonee_overview','phonee_partner_trials_list','phonee_pixel_events_overview',
    'phonee_plans_list','phonee_referrals_overview','phonee_sales_traffic',
    'phonee_stores','phonee_traffic_paths','phonee_user_metrics',
    'phonee_user_subscriptions','phonee_users'
  ];
  v_json jsonb;
  v_ok boolean;
  v_err text;
  v_dup_count int;
  v_idx jsonb;
  v_probe jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin_master(v_admin) THEN
    RAISE EXCEPTION 'forbidden: smoke_test só pode ser executado como admin_master'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'mobileplus_%';
  v_ok := (v_count = 0);
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','no_mobileplus_functions','pass',v_ok,
    'detail', jsonb_build_object('remaining', v_count)));

  SELECT array_agg(name) INTO v_missing
  FROM unnest(v_expected) AS name
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = name
  );
  v_ok := (v_missing IS NULL);
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','all_phonee_functions_exist','pass',v_ok,
    'detail', jsonb_build_object('missing', COALESCE(to_jsonb(v_missing), '[]'::jsonb))));

  BEGIN
    v_json := public.phonee_overview();
    v_ok := (v_json ? 'total_stores') AND (v_json ? 'active_subscriptions')
            AND (v_json ? 'mrr_estimate') AND (v_json ? 'gmv_30d');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_overview','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN
    v_json := public.phonee_sales_traffic(30, NULL, NULL, NULL, NULL);
    v_ok := (v_json ? 'total') AND (v_json ? 'by_day') AND (v_json ? 'by_path');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_sales_traffic','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN
    v_json := public.phonee_coupons_revenue(90);
    v_ok := (v_json ? 'receita_total') AND (v_json ? 'usos') AND (v_json ? 'by_day');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_coupons_revenue','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN
    v_json := public.phonee_referrals_overview();
    v_ok := (v_json ? 'total') AND (v_json ? 'convertidas') AND (v_json ? 'taxa_conversao');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_referrals_overview','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN
    v_json := public.phonee_marketing_dashboard();
    v_ok := (v_json ? 'investment') AND (v_json ? 'by_day') AND (v_json ? 'funnel');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_marketing_dashboard','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN
    v_json := public.phonee_pixel_events_overview(30);
    v_ok := (v_json ? 'total') AND (v_json ? 'by_day') AND (v_json ? 'attribution');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_pixel_events_overview','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN
    v_json := public.phonee_user_metrics();
    v_ok := jsonb_typeof(v_json) = 'object';
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_user_metrics','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN PERFORM count(*) FROM public.phonee_stores();
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_stores','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN PERFORM count(*) FROM public.phonee_users();
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_users','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN PERFORM count(*) FROM public.phonee_growth();
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_growth','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN PERFORM count(*) FROM public.phonee_traffic_paths();
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_traffic_paths','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN PERFORM count(*) FROM public.phonee_plans_list();
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_plans_list','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN PERFORM count(*) FROM public.phonee_partner_trials_list();
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_partner_trials_list','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  BEGIN PERFORM count(*) FROM public.phonee_user_subscriptions(v_admin);
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','phonee_user_subscriptions','pass',v_ok,'detail',jsonb_build_object('error',v_err)));

  -- NEW: Asaas idempotency checks
  BEGIN
    v_idx := public.phonee_asaas_index_status();
    v_ok := COALESCE((v_idx->>'exists')::boolean, false)
        AND COALESCE((v_idx->>'is_unique')::boolean, false)
        AND COALESCE((v_idx->>'is_partial')::boolean, false);
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','asaas_unique_index_present','pass',v_ok,
    'detail', jsonb_build_object('index', v_idx, 'error', v_err)));

  BEGIN
    SELECT count(*) INTO v_dup_count FROM public.phonee_asaas_charge_duplicates();
    v_ok := (v_dup_count = 0);
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','asaas_no_duplicate_charges','pass',v_ok,
    'detail', jsonb_build_object('duplicates', v_dup_count, 'error', v_err)));

  BEGIN
    v_probe := public.phonee_asaas_idempotency_probe();
    v_ok := COALESCE((v_probe->>'pass')::boolean, false);
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; v_probe := NULL; END;
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','asaas_idempotency_probe','pass',v_ok,
    'detail', jsonb_build_object('probe', v_probe, 'error', v_err)));

  RETURN jsonb_build_object(
    'pass', v_pass,
    'as_admin', v_admin,
    'run_at', now(),
    'checks', v_checks
  );
END $function$;
