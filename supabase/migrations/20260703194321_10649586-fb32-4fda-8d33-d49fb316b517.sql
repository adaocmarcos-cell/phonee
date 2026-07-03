
CREATE OR REPLACE FUNCTION public.phonee_smoke_test(_as_admin uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin_master(v_admin) THEN
    RAISE EXCEPTION 'forbidden: smoke_test só pode ser executado como admin_master'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  -- 1) Nenhuma mobileplus_* deve existir
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'mobileplus_%';
  v_ok := (v_count = 0);
  v_pass := v_pass AND v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','no_mobileplus_functions','pass',v_ok,
    'detail', jsonb_build_object('remaining', v_count)));

  -- 2) Todas as 14 phonee_* esperadas existem
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

  -- 3) Executa cada função e confere shape/execução
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

  -- funções TABLE
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

  RETURN jsonb_build_object(
    'pass', v_pass,
    'as_admin', v_admin,
    'run_at', now(),
    'checks', v_checks
  );
END $function$;

REVOKE ALL ON FUNCTION public.phonee_smoke_test(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phonee_smoke_test(uuid) TO authenticated, service_role;
