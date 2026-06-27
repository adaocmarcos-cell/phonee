
CREATE OR REPLACE FUNCTION public.phonee_plans_list()
RETURNS TABLE(id uuid, name text, price_cents integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, price_cents FROM public.plans
  WHERE public.is_admin_master(auth.uid())
  ORDER BY price_cents NULLS LAST, name;
$$;

REVOKE EXECUTE ON FUNCTION public.phonee_plans_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_plans_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_change_user_plan(
  _subscription_id uuid,
  _new_plan_id uuid,
  _new_expires_at timestamptz DEFAULT NULL,
  _new_status text DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.plans%ROWTYPE;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription not found'; END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = _new_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan not found'; END IF;

  -- Signal change reason to audit trigger
  PERFORM set_config('app.change_reason', COALESCE(_reason, 'Alteração direta pelo admin master'), true);

  UPDATE public.subscriptions
     SET plan_id      = v_plan.id,
         amount_cents = v_plan.price_cents,
         expires_at   = COALESCE(_new_expires_at, expires_at),
         status       = COALESCE(_new_status, status),
         updated_at   = now()
   WHERE id = v_sub.id;

  RETURN jsonb_build_object('ok', true, 'subscription_id', v_sub.id, 'plan', v_plan.name);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_change_user_plan(uuid,uuid,timestamptz,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_user_plan(uuid,uuid,timestamptz,text,text) TO authenticated;

-- Helper for the admin UI to list subscriptions by user (one row per user/store)
CREATE OR REPLACE FUNCTION public.phonee_user_subscriptions(_user_id uuid)
RETURNS TABLE(
  subscription_id uuid,
  store_id uuid,
  store_name text,
  plan_id uuid,
  plan_name text,
  status text,
  billing_cycle text,
  amount_cents integer,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT ON (sub.store_id)
    sub.id, sub.store_id, st.name, sub.plan_id, p.name,
    sub.status, sub.billing_cycle, sub.amount_cents, sub.expires_at, sub.created_at
  FROM public.subscriptions sub
  LEFT JOIN public.plans p   ON p.id = sub.plan_id
  LEFT JOIN public.stores st ON st.id = sub.store_id
  WHERE public.is_admin_master(auth.uid())
    AND (sub.user_id = _user_id OR st.owner_id = _user_id)
  ORDER BY sub.store_id, sub.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.phonee_user_subscriptions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_user_subscriptions(uuid) TO authenticated;
