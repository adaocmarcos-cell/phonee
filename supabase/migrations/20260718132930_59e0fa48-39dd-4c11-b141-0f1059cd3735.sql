
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_code_key,
  ADD CONSTRAINT plans_code_key UNIQUE (code);

ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_price_cents_nonneg,
  ADD CONSTRAINT plans_price_cents_nonneg CHECK (price_cents >= 0),
  DROP CONSTRAINT IF EXISTS plans_max_installments_range,
  ADD CONSTRAINT plans_max_installments_range CHECK (max_installments BETWEEN 1 AND 12),
  DROP CONSTRAINT IF EXISTS plans_billing_period_allowed,
  ADD CONSTRAINT plans_billing_period_allowed
    CHECK (billing_period IS NULL OR billing_period IN ('lifetime','annual','monthly','trial'));

CREATE TABLE IF NOT EXISTS public.plan_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  changed_by uuid,
  change_type text NOT NULL CHECK (change_type IN ('price','active','other')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plan_audit_log TO authenticated;
GRANT ALL ON public.plan_audit_log TO service_role;

ALTER TABLE public.plan_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin master reads plan audit" ON public.plan_audit_log;
CREATE POLICY "Admin master reads plan audit"
ON public.plan_audit_log FOR SELECT TO authenticated
USING (public.is_admin_master(auth.uid()));

CREATE INDEX IF NOT EXISTS plan_audit_log_plan_id_idx ON public.plan_audit_log(plan_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_plans_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price_cents IS DISTINCT FROM OLD.price_cents THEN
    INSERT INTO public.plan_audit_log(plan_id, plan_code, changed_by, change_type, old_value, new_value)
    VALUES (NEW.id, NEW.code, auth.uid(), 'price',
            to_jsonb(OLD.price_cents), to_jsonb(NEW.price_cents));
  END IF;
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    INSERT INTO public.plan_audit_log(plan_id, plan_code, changed_by, change_type, old_value, new_value)
    VALUES (NEW.id, NEW.code, auth.uid(), 'active',
            to_jsonb(OLD.active), to_jsonb(NEW.active));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_audit_trg ON public.plans;
CREATE TRIGGER plans_audit_trg
AFTER UPDATE ON public.plans
FOR EACH ROW EXECUTE FUNCTION public.tg_plans_audit();

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.plans;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.plans REPLICA IDENTITY FULL;
