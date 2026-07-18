
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS billing_period text,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

UPDATE public.plans SET billing_period = 'lifetime', display_order = 0 WHERE code = 'lifetime';
UPDATE public.plans SET billing_period = 'annual',   display_order = 1 WHERE code = 'annual';
UPDATE public.plans SET billing_period = 'monthly',  display_order = 3 WHERE code = 'trial';

INSERT INTO public.plans (code, name, description, price_cents, max_installments, duration_months, active, billing_period, display_order)
VALUES ('monthly', 'Phonee Mensal', 'Acesso completo com cobrança mensal recorrente', 4990, 1, 1, false, 'monthly', 2)
ON CONFLICT (code) DO NOTHING;
