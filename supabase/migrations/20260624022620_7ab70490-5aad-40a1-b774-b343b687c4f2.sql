
ALTER TABLE public.referral_credits
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now();

-- Backfill: créditos antigos de indicação ficam imediatamente disponíveis (mantém retrocompat).
UPDATE public.referral_credits SET available_at = created_at WHERE available_at IS NULL;

-- Trigger: ao converter, criar crédito com liberação em +7 dias (garantia de devolução).
CREATE OR REPLACE FUNCTION public.tg_referral_on_subscription_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref public.referrals%ROWTYPE;
  v_active_states text[] := ARRAY['active','ativa','vitalicio'];
BEGIN
  IF NEW.status::text = ANY (v_active_states)
     AND (OLD.status IS NULL OR OLD.status::text <> NEW.status::text) THEN
    SELECT * INTO v_ref FROM public.referrals
      WHERE referred_subscription_id = NEW.id AND status = 'pendente'
      LIMIT 1;
    IF NOT FOUND THEN
      SELECT * INTO v_ref FROM public.referrals
        WHERE referred_email = lower(NEW.customer_email)
          AND status = 'pendente'
        ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF FOUND THEN
      UPDATE public.referrals
        SET status = 'convertida',
            converted_at = now(),
            referred_subscription_id = COALESCE(referred_subscription_id, NEW.id),
            updated_at = now()
        WHERE id = v_ref.id;

      INSERT INTO public.referral_credits (
        user_id, type, amount_cents, referral_id, subscription_id, notes, available_at
      ) VALUES (
        v_ref.referrer_user_id, 'credito_indicacao', v_ref.bonus_cents, v_ref.id, NEW.id,
        'Bônus por indicação convertida (liberado em 7 dias)',
        now() + interval '7 days'
      );
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Saldo disponível: apenas créditos cujo available_at já passou.
CREATE OR REPLACE FUNCTION public.referral_balance(_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(amount_cents), 0)::int
    FROM public.referral_credits
   WHERE user_id = _user_id
     AND (amount_cents < 0 OR available_at <= now());
$function$;

-- Saldo pendente (a liberar).
CREATE OR REPLACE FUNCTION public.referral_pending_balance(_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(amount_cents), 0)::int
    FROM public.referral_credits
   WHERE user_id = _user_id
     AND amount_cents > 0
     AND available_at > now();
$function$;

-- Dashboard expandido.
CREATE OR REPLACE FUNCTION public.referral_dashboard(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total int; v_pend int; v_conv int; v_bal int; v_pending_bal int;
  v_code text; v_next_release timestamptz;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT code INTO v_code FROM public.referral_codes WHERE user_id = _user_id;
  SELECT count(*) INTO v_total FROM public.referrals WHERE referrer_user_id = _user_id;
  SELECT count(*) INTO v_pend  FROM public.referrals WHERE referrer_user_id = _user_id AND status = 'pendente';
  SELECT count(*) INTO v_conv  FROM public.referrals WHERE referrer_user_id = _user_id AND status = 'convertida';
  v_bal := public.referral_balance(_user_id);
  v_pending_bal := public.referral_pending_balance(_user_id);
  SELECT MIN(available_at) INTO v_next_release
    FROM public.referral_credits
   WHERE user_id = _user_id AND amount_cents > 0 AND available_at > now();
  RETURN jsonb_build_object(
    'code', v_code,
    'total', v_total,
    'pendentes', v_pend,
    'convertidas', v_conv,
    'saldo_cents', v_bal,
    'saldo_pendente_cents', v_pending_bal,
    'proxima_liberacao', v_next_release
  );
END $function$;

-- Garante que o uso de saldo respeita o saldo disponível.
CREATE OR REPLACE FUNCTION public.use_referral_credit(_amount_cents integer, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_bal int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  v_bal := public.referral_balance(v_user);
  IF v_bal < _amount_cents THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Saldo disponível insuficiente. Aguarde a liberação após 7 dias da compra do indicado.');
  END IF;
  INSERT INTO public.referral_credits (user_id, type, amount_cents, notes, available_at)
    VALUES (v_user, 'uso_desconto', -1 * _amount_cents, _notes, now());
  RETURN jsonb_build_object('ok', true, 'new_balance', v_bal - _amount_cents);
END $function$;

-- Receita gerada por cupons (admin): séries por dia e ranking por cupom.
CREATE OR REPLACE FUNCTION public.mobileplus_coupons_revenue(_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := now() - (_days || ' days')::interval;
  v_total numeric; v_discount numeric; v_count bigint;
  v_by_day jsonb; v_by_coupon jsonb;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(SUM((original_cents - discount_cents))::numeric,0) / 100,
    COALESCE(SUM(discount_cents)::numeric,0) / 100,
    COUNT(*)
    INTO v_total, v_discount, v_count
    FROM public.coupon_redemptions
   WHERE created_at >= v_from;

  SELECT jsonb_agg(jsonb_build_object(
    'day', d, 'receita', receita, 'desconto', desconto, 'qtd', qtd
  ) ORDER BY d) INTO v_by_day
  FROM (
    SELECT date_trunc('day', created_at)::date AS d,
           SUM((original_cents - discount_cents))::numeric / 100 AS receita,
           SUM(discount_cents)::numeric / 100 AS desconto,
           COUNT(*) AS qtd
      FROM public.coupon_redemptions
     WHERE created_at >= v_from
     GROUP BY 1
  ) t;

  SELECT jsonb_agg(jsonb_build_object(
    'code', code, 'receita', receita, 'desconto', desconto, 'qtd', qtd
  ) ORDER BY receita DESC) INTO v_by_coupon
  FROM (
    SELECT coupon_code AS code,
           SUM((original_cents - discount_cents))::numeric / 100 AS receita,
           SUM(discount_cents)::numeric / 100 AS desconto,
           COUNT(*) AS qtd
      FROM public.coupon_redemptions
     WHERE created_at >= v_from
     GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'dias', _days,
    'receita_total', v_total,
    'desconto_total', v_discount,
    'usos', v_count,
    'by_day', COALESCE(v_by_day, '[]'::jsonb),
    'by_coupon', COALESCE(v_by_coupon, '[]'::jsonb)
  );
END $function$;
