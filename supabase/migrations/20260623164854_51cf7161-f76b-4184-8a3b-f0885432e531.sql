
-- 1) Valor líquido por venda (após taxas / abatimentos de cartão)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS net_value numeric,
  ADD COLUMN IF NOT EXISTS net_value_reason text;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS net_value numeric,
  ADD COLUMN IF NOT EXISTS net_value_reason text;

ALTER TABLE public.parts_sales
  ADD COLUMN IF NOT EXISTS net_value numeric,
  ADD COLUMN IF NOT EXISTS net_value_reason text;

-- 2) Política de INSERT para assinaturas próprias do usuário (corrige
-- "new row violates row-level security policy for table subscriptions"
-- ao adicionar nova loja / finalizar pagamento de planos).
DROP POLICY IF EXISTS subscriptions_insert_own ON public.subscriptions;
CREATE POLICY subscriptions_insert_own
  ON public.subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Permitir que o próprio usuário atualize sua assinatura pendente
-- (ex.: trocar forma de pagamento antes da confirmação).
DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;
CREATE POLICY subscriptions_update_own
  ON public.subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
