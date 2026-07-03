-- Enable pg_cron if not already
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Audit table for smoke test runs
CREATE TABLE IF NOT EXISTS public.phonee_smoke_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  pass boolean NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  run_by uuid,
  checks jsonb NOT NULL,
  failed_checks jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.phonee_smoke_test_runs TO authenticated;
GRANT ALL ON public.phonee_smoke_test_runs TO service_role;

ALTER TABLE public.phonee_smoke_test_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_master can read smoke test runs" ON public.phonee_smoke_test_runs;
CREATE POLICY "admin_master can read smoke test runs"
  ON public.phonee_smoke_test_runs
  FOR SELECT
  TO authenticated
  USING (public.is_admin_master(auth.uid()));

CREATE INDEX IF NOT EXISTS phonee_smoke_test_runs_ran_at_idx
  ON public.phonee_smoke_test_runs (ran_at DESC);
CREATE INDEX IF NOT EXISTS phonee_smoke_test_runs_pass_idx
  ON public.phonee_smoke_test_runs (pass, ran_at DESC);

-- Wrapper that picks an admin_master, executes phonee_smoke_test, logs result.
CREATE OR REPLACE FUNCTION public.phonee_smoke_test_run_and_log(_source text DEFAULT 'cron')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid;
  v_result jsonb;
  v_pass boolean;
  v_failed jsonb;
  v_id uuid;
BEGIN
  -- Only admin_master can call this manually. Cron runs as postgres/superuser and passes the check.
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
  v_pass := COALESCE((v_result->>'pass')::boolean, false);

  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_failed
    FROM jsonb_array_elements(v_result->'checks') c
   WHERE (c->>'pass')::boolean = false;

  INSERT INTO public.phonee_smoke_test_runs (pass, source, run_by, checks, failed_checks)
  VALUES (v_pass, _source, COALESCE(auth.uid(), v_admin), v_result->'checks', v_failed)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.phonee_smoke_test_run_and_log(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_smoke_test_run_and_log(text) TO authenticated, service_role;

-- Security-negative test: try each phonee_* as the CURRENT (non-admin) user and confirm it is blocked.
-- Returns a report with pass=true only when every function raised a permission error.
CREATE OR REPLACE FUNCTION public.phonee_security_test()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_pass boolean := true;
  v_blocked boolean;
  v_err text;
BEGIN
  -- If the caller is admin_master, this test is meaningless.
  IF public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'phonee_security_test must be executed by a NON admin_master user';
  END IF;

  -- phonee_overview
  BEGIN PERFORM public.phonee_overview(); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_overview','blocked',v_blocked,'error',v_err));

  -- phonee_sales_traffic
  BEGIN PERFORM public.phonee_sales_traffic(30,NULL,NULL,NULL,NULL); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_sales_traffic','blocked',v_blocked,'error',v_err));

  -- phonee_coupons_revenue
  BEGIN PERFORM public.phonee_coupons_revenue(90); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_coupons_revenue','blocked',v_blocked,'error',v_err));

  -- phonee_referrals_overview
  BEGIN PERFORM public.phonee_referrals_overview(); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_referrals_overview','blocked',v_blocked,'error',v_err));

  -- phonee_pixel_events_overview
  BEGIN PERFORM public.phonee_pixel_events_overview(30); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_pixel_events_overview','blocked',v_blocked,'error',v_err));

  -- phonee_user_metrics
  BEGIN PERFORM public.phonee_user_metrics(); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_user_metrics','blocked',v_blocked,'error',v_err));

  -- phonee_marketing_dashboard
  BEGIN PERFORM public.phonee_marketing_dashboard(); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_marketing_dashboard','blocked',v_blocked,'error',v_err));

  -- TABLE functions
  BEGIN PERFORM count(*) FROM public.phonee_stores(); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_stores','blocked',v_blocked,'error',v_err));

  BEGIN PERFORM count(*) FROM public.phonee_users(); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_users','blocked',v_blocked,'error',v_err));

  BEGIN PERFORM count(*) FROM public.phonee_growth(); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_growth','blocked',v_blocked,'error',v_err));

  BEGIN PERFORM count(*) FROM public.phonee_traffic_paths(); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_traffic_paths','blocked',v_blocked,'error',v_err));

  BEGIN PERFORM count(*) FROM public.phonee_plans_list(); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_plans_list','blocked',v_blocked,'error',v_err));

  -- Smoke test itself must be blocked for non-admins
  BEGIN PERFORM public.phonee_smoke_test(NULL); v_blocked := false; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_blocked := true; v_err := SQLERRM; END;
  v_pass := v_pass AND v_blocked;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('fn','phonee_smoke_test','blocked',v_blocked,'error',v_err));

  RETURN jsonb_build_object('pass', v_pass, 'as_user', auth.uid(), 'run_at', now(), 'checks', v_checks);
END $$;

GRANT EXECUTE ON FUNCTION public.phonee_security_test() TO authenticated;

-- Schedule the smoke test every 6 hours (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('phonee-smoke-test-6h');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'phonee-smoke-test-6h',
  '0 */6 * * *',
  $$ SELECT public.phonee_smoke_test_run_and_log('cron'); $$
);