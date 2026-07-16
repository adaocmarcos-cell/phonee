
-- Tabela de bonificações
CREATE TABLE public.access_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  partner_trial_id uuid REFERENCES public.partner_trials(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  bonus_type text NOT NULL CHECK (bonus_type IN ('extensao_trial','mes_gratis','periodo_personalizado')),
  days_granted integer NOT NULL CHECK (days_granted > 0),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  previous_ends_at timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text
);

CREATE INDEX access_bonuses_email_idx ON public.access_bonuses (lower(target_email));
CREATE INDEX access_bonuses_user_idx ON public.access_bonuses (user_id);
CREATE INDEX access_bonuses_store_idx ON public.access_bonuses (store_id);
CREATE INDEX access_bonuses_created_idx ON public.access_bonuses (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.access_bonuses TO authenticated;
GRANT ALL ON public.access_bonuses TO service_role;

ALTER TABLE public.access_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY access_bonuses_master_all
  ON public.access_bonuses
  FOR ALL
  TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

-- RPC: conceder bonificação
CREATE OR REPLACE FUNCTION public.grant_access_bonus(
  p_email text,
  p_bonus_type text,
  p_days integer,
  p_reason text
) RETURNS public.access_bonuses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_days integer := p_days;
  v_user_id uuid;
  v_store_id uuid;
  v_trial public.partner_trials%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_previous timestamptz;
  v_new_end timestamptz;
  v_target_kind text; -- 'subscription' | 'trial'
  v_row public.access_bonuses%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'Somente Admin Master pode conceder bonificações';
  END IF;
  IF p_bonus_type NOT IN ('extensao_trial','mes_gratis','periodo_personalizado') THEN
    RAISE EXCEPTION 'Tipo de bônus inválido';
  END IF;
  IF v_days IS NULL OR v_days <= 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade de dias maior que zero';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Motivo é obrigatório';
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'E-mail é obrigatório';
  END IF;

  -- Localiza usuário por e-mail
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  -- Assinatura ativa mais recente (prioritário quando é 'mes_gratis' ou 'periodo_personalizado')
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE (user_id = v_user_id OR lower(customer_email) = v_email)
    AND status = 'active'
    AND billing_cycle IN ('annual','lifetime')
  ORDER BY expires_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  -- Trial
  SELECT * INTO v_trial
  FROM public.partner_trials
  WHERE (user_id = v_user_id OR lower(email) = v_email)
  ORDER BY created_at DESC
  LIMIT 1;

  IF p_bonus_type = 'extensao_trial' THEN
    IF v_trial.id IS NULL THEN
      RAISE EXCEPTION 'Não há teste (partner_trial) associado a este e-mail';
    END IF;
    v_target_kind := 'trial';
  ELSE
    IF v_sub.id IS NOT NULL THEN
      v_target_kind := 'subscription';
    ELSIF v_trial.id IS NOT NULL THEN
      v_target_kind := 'trial';
    ELSE
      RAISE EXCEPTION 'Nenhuma assinatura ativa ou teste encontrado para %', v_email;
    END IF;
  END IF;

  IF v_target_kind = 'subscription' THEN
    v_previous := v_sub.expires_at;
    v_new_end := GREATEST(COALESCE(v_sub.expires_at, now()), now()) + make_interval(days => v_days);
    v_old := jsonb_build_object('expires_at', v_previous, 'status', v_sub.status);
    UPDATE public.subscriptions
      SET expires_at = v_new_end,
          updated_at = now()
      WHERE id = v_sub.id
      RETURNING * INTO v_sub;
    v_new := jsonb_build_object('expires_at', v_sub.expires_at, 'status', v_sub.status);
    v_store_id := v_sub.store_id;
  ELSE
    v_previous := v_trial.trial_ends_at;
    v_new_end := GREATEST(COALESCE(v_trial.trial_ends_at, now()), now()) + make_interval(days => v_days);
    v_old := jsonb_build_object('trial_ends_at', v_previous, 'status', v_trial.status);
    UPDATE public.partner_trials
      SET trial_ends_at = v_new_end,
          status = CASE WHEN status = 'teste_expirado' THEN 'em_teste' ELSE status END,
          updated_at = now()
      WHERE id = v_trial.id
      RETURNING * INTO v_trial;
    v_new := jsonb_build_object('trial_ends_at', v_trial.trial_ends_at, 'status', v_trial.status);
  END IF;

  -- Descobre store do usuário se ainda não temos
  IF v_store_id IS NULL AND v_user_id IS NOT NULL THEN
    SELECT id INTO v_store_id FROM public.stores WHERE owner_id = v_user_id ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.access_bonuses (
    granted_by, target_email, user_id, store_id,
    partner_trial_id, subscription_id, bonus_type, days_granted,
    period_start, period_end, previous_ends_at, reason
  ) VALUES (
    auth.uid(), v_email, v_user_id, v_store_id,
    CASE WHEN v_target_kind = 'trial' THEN v_trial.id ELSE NULL END,
    CASE WHEN v_target_kind = 'subscription' THEN v_sub.id ELSE NULL END,
    p_bonus_type, v_days,
    COALESCE(v_previous, now()), v_new_end, v_previous, btrim(p_reason)
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, store_id, action, entity, entity_id, old_value, new_value, module, screen, status)
  VALUES (auth.uid(), v_store_id, 'bonus_concedido', 'access_bonus', v_row.id, v_old, v_new, 'admin_master', 'bonificacoes', 'success');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_access_bonus(text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_access_bonus(text, text, integer, text) TO authenticated;

-- RPC: revogar bonificação
CREATE OR REPLACE FUNCTION public.revoke_access_bonus(
  p_bonus_id uuid,
  p_reason text
) RETURNS public.access_bonuses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.access_bonuses%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'Somente Admin Master pode revogar bonificações';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Motivo da revogação é obrigatório';
  END IF;

  SELECT * INTO v_row FROM public.access_bonuses WHERE id = p_bonus_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Bonificação não encontrada'; END IF;
  IF v_row.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Bonificação já revogada'; END IF;

  IF v_row.subscription_id IS NOT NULL THEN
    UPDATE public.subscriptions
      SET expires_at = v_row.previous_ends_at, updated_at = now()
      WHERE id = v_row.subscription_id AND expires_at = v_row.period_end
      RETURNING jsonb_build_object('expires_at', v_row.period_end) INTO v_old;
    v_new := jsonb_build_object('expires_at', v_row.previous_ends_at);
  ELSIF v_row.partner_trial_id IS NOT NULL THEN
    UPDATE public.partner_trials
      SET trial_ends_at = v_row.previous_ends_at,
          status = CASE
            WHEN v_row.previous_ends_at IS NOT NULL AND v_row.previous_ends_at < now() THEN 'teste_expirado'
            ELSE status
          END,
          updated_at = now()
      WHERE id = v_row.partner_trial_id AND trial_ends_at = v_row.period_end
      RETURNING jsonb_build_object('trial_ends_at', v_row.period_end) INTO v_old;
    v_new := jsonb_build_object('trial_ends_at', v_row.previous_ends_at);
  END IF;

  UPDATE public.access_bonuses
    SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
    WHERE id = p_bonus_id
    RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, store_id, action, entity, entity_id, old_value, new_value, module, screen, status)
  VALUES (auth.uid(), v_row.store_id, 'bonus_revogado', 'access_bonus', v_row.id, v_old, v_new, 'admin_master', 'bonificacoes', 'success');

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_access_bonus(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_access_bonus(uuid, text) TO authenticated;
