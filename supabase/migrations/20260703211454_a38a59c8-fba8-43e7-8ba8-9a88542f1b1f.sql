
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
      plan_id, customer_name, customer_email, customer_doc,
      amount_cents, billing_cycle, status, payment_method, asaas_charge_id
    )
    SELECT id, 'probe',
           'probe-' || v_charge || '@example.invalid',
           v_charge,
           0, 'annual', 'pending', 'PIX', v_charge
      FROM public.plans
     ORDER BY created_at ASC
     LIMIT 1;
    v_first_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_sqlstate := SQLSTATE;
  END;

  IF v_first_ok THEN
    BEGIN
      INSERT INTO public.subscriptions (
        plan_id, customer_name, customer_email, customer_doc,
        amount_cents, billing_cycle, status, payment_method, asaas_charge_id
      )
      SELECT id, 'probe2',
             'probe2-' || v_charge || '@example.invalid',
             v_charge || '2',
             0, 'annual', 'pending', 'PIX', v_charge
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
