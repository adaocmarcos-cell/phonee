
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_cycle_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_cycle_check CHECK (billing_cycle = ANY (ARRAY['trial'::text,'annual'::text,'lifetime'::text]));

INSERT INTO public.plans (code, name, description, price_cents, max_installments, duration_months, active)
VALUES ('trial', 'Phonee Mensalidade Teste', 'Acesso completo por 1 mês. Oportunidade única antes do compromisso maior.', 1990, 1, 1, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  max_installments = EXCLUDED.max_installments,
  duration_months = EXCLUDED.duration_months,
  active = true;
