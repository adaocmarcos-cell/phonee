-- Garante que o plano "Mensalidade Teste" só pode ser ativado uma vez por cadastro.
-- Cria índice único parcial considerando email, CPF/CNPJ e usuário.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_per_email
  ON public.subscriptions (lower(customer_email))
  WHERE billing_cycle = 'trial';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_per_doc
  ON public.subscriptions (customer_doc)
  WHERE billing_cycle = 'trial' AND customer_doc IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_per_user
  ON public.subscriptions (user_id)
  WHERE billing_cycle = 'trial' AND user_id IS NOT NULL;