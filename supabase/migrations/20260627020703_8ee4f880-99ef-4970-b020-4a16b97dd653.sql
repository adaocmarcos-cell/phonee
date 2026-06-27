
-- 1) Tighten subscriptions_insert_own
DROP POLICY IF EXISTS subscriptions_insert_own ON public.subscriptions;
CREATE POLICY subscriptions_insert_own ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND started_at IS NULL
    AND expires_at IS NULL
    AND asaas_charge_id IS NULL
    AND refund_status IS NULL
    AND billing_cycle IN ('trial','annual','lifetime')
  );

-- 2) Audit trigger for sensitive subscription changes
CREATE OR REPLACE FUNCTION public.tg_audit_subscription_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_reason text := NULLIF(current_setting('app.change_reason', true), '');
  v_request_id uuid := NULLIF(current_setting('app.change_request_id', true), '')::uuid;
  v_actor uuid := auth.uid();
  v_sensitive boolean := false;
BEGIN
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    v_changes := v_changes || jsonb_build_object('plan_id', jsonb_build_object('de', OLD.plan_id, 'para', NEW.plan_id));
    v_sensitive := true;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('de', OLD.status, 'para', NEW.status));
    v_sensitive := true;
  END IF;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    v_changes := v_changes || jsonb_build_object('expires_at', jsonb_build_object('de', OLD.expires_at, 'para', NEW.expires_at));
    v_sensitive := true;
  END IF;
  IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents THEN
    v_changes := v_changes || jsonb_build_object('amount_cents', jsonb_build_object('de', OLD.amount_cents, 'para', NEW.amount_cents));
    v_sensitive := true;
  END IF;
  IF NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle THEN
    v_changes := v_changes || jsonb_build_object('billing_cycle', jsonb_build_object('de', OLD.billing_cycle, 'para', NEW.billing_cycle));
    v_sensitive := true;
  END IF;

  IF v_sensitive THEN
    INSERT INTO public.audit_log (store_id, user_id, module, action, entity, entity_id, details, status, old_value, new_value)
    VALUES (
      NEW.store_id, v_actor, 'admin_master', 'subscription_change',
      'subscription', NEW.id,
      jsonb_build_object('changes', v_changes, 'reason', v_reason, 'request_id', v_request_id),
      'ok',
      to_jsonb(OLD), to_jsonb(NEW)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_subscription_changes ON public.subscriptions;
CREATE TRIGGER trg_audit_subscription_changes
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_subscription_changes();

-- 3) Change request table
CREATE TABLE IF NOT EXISTS public.subscription_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  changes jsonb NOT NULL,
  reason text NOT NULL,
  review_notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','applied','failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.subscription_change_requests TO authenticated;
GRANT ALL ON public.subscription_change_requests TO service_role;

ALTER TABLE public.subscription_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY scr_admin_master_all ON public.subscription_change_requests
  FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

CREATE TRIGGER trg_scr_set_updated
  BEFORE UPDATE ON public.subscription_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) RPCs
CREATE OR REPLACE FUNCTION public.request_subscription_change(
  _subscription_id uuid,
  _changes jsonb,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_allowed text[] := ARRAY['plan_id','status','expires_at','amount_cents','billing_cycle'];
  k text;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason required (min 5 chars)';
  END IF;
  IF _changes IS NULL OR jsonb_typeof(_changes) <> 'object' OR _changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'changes required';
  END IF;
  FOR k IN SELECT jsonb_object_keys(_changes) LOOP
    IF NOT (k = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'field % not allowed', k;
    END IF;
  END LOOP;

  INSERT INTO public.subscription_change_requests
    (subscription_id, requested_by, changes, reason)
  VALUES (_subscription_id, auth.uid(), _changes, trim(_reason))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (user_id, module, action, entity, entity_id, details, status)
  VALUES (auth.uid(), 'admin_master', 'subscription_change_request',
          'subscription', _subscription_id,
          jsonb_build_object('request_id', v_id, 'changes', _changes, 'reason', _reason), 'ok');

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.approve_subscription_change(
  _request_id uuid,
  _review_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.subscription_change_requests%ROWTYPE;
  v_set text := '';
  k text;
  v_val jsonb;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.subscription_change_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'request already decided'; END IF;
  IF r.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'two-person rule: approver must differ from requester';
  END IF;

  PERFORM set_config('app.change_reason', r.reason, true);
  PERFORM set_config('app.change_request_id', r.id::text, true);

  FOR k, v_val IN SELECT * FROM jsonb_each(r.changes) LOOP
    IF v_set <> '' THEN v_set := v_set || ', '; END IF;
    IF k = 'plan_id' THEN
      v_set := v_set || format('plan_id = %L::uuid', v_val #>> '{}');
    ELSIF k = 'status' THEN
      v_set := v_set || format('status = %L', v_val #>> '{}');
    ELSIF k = 'expires_at' THEN
      IF v_val = 'null'::jsonb OR v_val IS NULL THEN
        v_set := v_set || 'expires_at = NULL';
      ELSE
        v_set := v_set || format('expires_at = %L::timestamptz', v_val #>> '{}');
      END IF;
    ELSIF k = 'amount_cents' THEN
      v_set := v_set || format('amount_cents = %L::int', v_val #>> '{}');
    ELSIF k = 'billing_cycle' THEN
      v_set := v_set || format('billing_cycle = %L', v_val #>> '{}');
    ELSE
      RAISE EXCEPTION 'field % not allowed', k;
    END IF;
  END LOOP;

  EXECUTE format('UPDATE public.subscriptions SET %s, updated_at = now() WHERE id = %L', v_set, r.subscription_id);

  UPDATE public.subscription_change_requests
     SET status = 'applied',
         reviewed_by = auth.uid(),
         decided_at = now(),
         applied_at = now(),
         review_notes = COALESCE(_review_notes, review_notes)
   WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'request_id', r.id);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.subscription_change_requests
     SET status = 'failed', reviewed_by = auth.uid(), decided_at = now(),
         review_notes = COALESCE(_review_notes,'') || ' | ERRO: ' || SQLERRM
   WHERE id = _request_id;
  RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.reject_subscription_change(
  _request_id uuid,
  _review_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _review_notes IS NULL OR length(trim(_review_notes)) < 3 THEN
    RAISE EXCEPTION 'review notes required';
  END IF;
  UPDATE public.subscription_change_requests
     SET status = 'rejected', reviewed_by = auth.uid(),
         decided_at = now(), review_notes = trim(_review_notes)
   WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found or already decided'; END IF;

  INSERT INTO public.audit_log (user_id, module, action, entity, entity_id, details, status)
  VALUES (auth.uid(), 'admin_master', 'subscription_change_rejected',
          'subscription_change_request', _request_id,
          jsonb_build_object('notes', _review_notes), 'ok');
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.request_subscription_change(uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_subscription_change(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_subscription_change(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_subscription_change(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_subscription_change(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_subscription_change(uuid, text) TO authenticated;
