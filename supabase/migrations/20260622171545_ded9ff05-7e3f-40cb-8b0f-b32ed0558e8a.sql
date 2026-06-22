
-- ============ PLANS ============
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  max_installments integer NOT NULL DEFAULT 1,
  duration_months integer, -- null = vitalício
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "plans_admin_all" ON public.plans FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));
CREATE TRIGGER plans_set_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.plans (code, name, description, price_cents, max_installments, duration_months) VALUES
  ('annual', 'Mobile+ Anual', 'Acesso completo por 12 meses', 12700, 12, 12),
  ('lifetime', 'Mobile+ Vitalício', 'Acesso vitalício, sem renovação', 29700, 12, NULL);

-- ============ ASAAS SETTINGS ============
CREATE TABLE public.asaas_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  api_key_set boolean NOT NULL DEFAULT false,
  webhook_token_set boolean NOT NULL DEFAULT false,
  wallet_id text,
  account_email text,
  connection_status text DEFAULT 'unknown',
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_settings TO authenticated;
GRANT ALL ON public.asaas_settings TO service_role;
ALTER TABLE public.asaas_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asaas_settings_admin_all" ON public.asaas_settings FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));
CREATE TRIGGER asaas_settings_set_updated BEFORE UPDATE ON public.asaas_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.asaas_settings (environment) VALUES ('sandbox');

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  customer_doc text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('PIX','CREDIT_CARD','BOLETO')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','overdue','refunded','canceled','failed')),
  amount_cents integer NOT NULL,
  installments integer NOT NULL DEFAULT 1,
  asaas_customer_id text,
  asaas_charge_id text,
  invoice_url text,
  pix_qr_code text,
  pix_copy_paste text,
  started_at timestamptz,
  expires_at timestamptz,
  refund_requested_at timestamptz,
  refund_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_email_idx ON public.subscriptions (lower(customer_email));
CREATE INDEX subscriptions_charge_idx ON public.subscriptions (asaas_charge_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_admin_all" ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));
CREATE POLICY "subscriptions_own_read" ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "subscriptions_own_refund_request" ON public.subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER subscriptions_set_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PAYMENT LOGS ============
CREATE TABLE public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text,
  amount_cents integer,
  asaas_payload jsonb,
  action text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_logs_subscription_idx ON public.payment_logs (subscription_id);
GRANT SELECT ON public.payment_logs TO authenticated;
GRANT ALL ON public.payment_logs TO service_role;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_logs_admin_read" ON public.payment_logs FOR SELECT TO authenticated
  USING (public.is_admin_master(auth.uid()));
