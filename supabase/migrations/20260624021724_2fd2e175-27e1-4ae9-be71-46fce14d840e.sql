
-- =====================================================================
-- 1. ENUMS
-- =====================================================================
DO $$ BEGIN
  CREATE TYPE public.referral_status AS ENUM ('pendente','convertida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.referral_credit_type AS ENUM ('credito_indicacao','uso_desconto','ajuste_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.coupon_discount_type AS ENUM ('valor','percentual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 2. TABELAS
-- =====================================================================

-- 2.1 referral_codes
CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own ref code"
  ON public.referral_codes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_master(auth.uid()));

-- 2.2 referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  referred_email text,
  referred_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  referred_subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  status public.referral_status NOT NULL DEFAULT 'pendente',
  bonus_cents integer NOT NULL DEFAULT 1000,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_user_id, status);
CREATE INDEX IF NOT EXISTS referrals_email_idx ON public.referrals (referred_email);
CREATE INDEX IF NOT EXISTS referrals_subscription_idx ON public.referrals (referred_subscription_id);

GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrer reads own referrals"
  ON public.referrals FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR public.is_admin_master(auth.uid()));

CREATE POLICY "admin master manages all referrals"
  ON public.referrals FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

-- 2.3 referral_credits (extrato; saldo = SUM(amount_cents))
CREATE TABLE IF NOT EXISTS public.referral_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.referral_credit_type NOT NULL,
  amount_cents integer NOT NULL,
  referral_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_credits_user_idx ON public.referral_credits (user_id, created_at DESC);

GRANT SELECT ON public.referral_credits TO authenticated;
GRANT ALL ON public.referral_credits TO service_role;
ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own credits"
  ON public.referral_credits FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_master(auth.uid()));

CREATE POLICY "admin master manages credits"
  ON public.referral_credits FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

-- 2.4 coupons
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type public.coupon_discount_type NOT NULL,
  discount_value numeric(12,2) NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  usage_limit integer,
  times_used integer NOT NULL DEFAULT 0,
  partner_label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin master manages coupons"
  ON public.coupons FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

CREATE POLICY "authenticated reads active coupons (metadata only)"
  ON public.coupons FOR SELECT TO authenticated
  USING (public.is_admin_master(auth.uid()));

-- 2.5 coupon_redemptions
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  coupon_code text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  customer_email text,
  discount_cents integer NOT NULL,
  original_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx ON public.coupon_redemptions (coupon_id);

GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin master reads redemptions"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (public.is_admin_master(auth.uid()));

-- =====================================================================
-- 3. FUNÇÕES
-- =====================================================================

-- 3.1 generate_referral_code: cria/retorna código único do usuário
CREATE OR REPLACE FUNCTION public.generate_referral_code(_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_tries int := 0;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT code INTO v_code FROM public.referral_codes WHERE user_id = _user_id;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  LOOP
    v_code := 'PHONEE-' || upper(substring(md5(_user_id::text || clock_timestamp()::text || v_tries::text), 1, 6));
    BEGIN
      INSERT INTO public.referral_codes (user_id, code) VALUES (_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_tries := v_tries + 1;
      IF v_tries > 10 THEN RAISE EXCEPTION 'could not generate unique code'; END IF;
    END;
  END LOOP;
END $$;

-- 3.2 register_referral: vincula um lead/email a um indicador
CREATE OR REPLACE FUNCTION public.register_referral(
  _code text,
  _referred_email text DEFAULT NULL,
  _referred_subscription_id uuid DEFAULT NULL,
  _referred_store_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text := upper(trim(_code));
  v_referrer uuid;
  v_id uuid;
  v_bonus int := 1000;
BEGIN
  IF v_code IS NULL OR v_code = '' THEN RETURN NULL; END IF;
  -- Normaliza: aceita "PHONEE-ABC123" ou só "ABC123"
  IF position('-' in v_code) = 0 THEN v_code := 'PHONEE-' || v_code; END IF;

  SELECT user_id INTO v_referrer FROM public.referral_codes WHERE code = v_code;
  IF v_referrer IS NULL THEN RETURN NULL; END IF;

  -- Evita duplicar para o mesmo email/subscription pendente
  IF _referred_subscription_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.referrals
      WHERE referred_subscription_id = _referred_subscription_id LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.referrals (
    referrer_user_id, referral_code, referred_email,
    referred_subscription_id, referred_store_id, bonus_cents, status
  ) VALUES (
    v_referrer, v_code, lower(NULLIF(trim(_referred_email), '')),
    _referred_subscription_id, _referred_store_id, v_bonus, 'pendente'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- 3.3 apply_coupon: valida e calcula desconto
CREATE OR REPLACE FUNCTION public.apply_coupon(_code text, _amount_cents int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_c public.coupons%ROWTYPE;
  v_discount int := 0;
BEGIN
  IF _code IS NULL OR trim(_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Informe um cupom.');
  END IF;

  SELECT * INTO v_c FROM public.coupons WHERE code = upper(trim(_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom inválido.');
  END IF;
  IF NOT v_c.active THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom inativo.');
  END IF;
  IF v_c.valid_from IS NOT NULL AND now() < v_c.valid_from THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom ainda não está vigente.');
  END IF;
  IF v_c.valid_until IS NOT NULL AND now() > v_c.valid_until THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom expirado.');
  END IF;
  IF v_c.usage_limit IS NOT NULL AND v_c.times_used >= v_c.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Cupom esgotado.');
  END IF;

  IF v_c.discount_type = 'valor' THEN
    v_discount := LEAST((v_c.discount_value * 100)::int, _amount_cents);
  ELSE
    v_discount := LEAST(((_amount_cents * v_c.discount_value) / 100)::int, _amount_cents);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_c.id,
    'code', v_c.code,
    'discount_type', v_c.discount_type,
    'discount_cents', v_discount,
    'final_cents', GREATEST(_amount_cents - v_discount, 0),
    'partner', v_c.partner_label
  );
END $$;

-- 3.4 redeem_coupon: registra uso de um cupom (chamada pelo edge function)
CREATE OR REPLACE FUNCTION public.redeem_coupon(
  _code text,
  _subscription_id uuid,
  _store_id uuid,
  _customer_email text,
  _original_cents int,
  _discount_cents int
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_c public.coupons%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_c FROM public.coupons WHERE code = upper(trim(_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'coupon not found'; END IF;

  INSERT INTO public.coupon_redemptions (
    coupon_id, coupon_code, store_id, subscription_id, customer_email,
    discount_cents, original_cents
  ) VALUES (
    v_c.id, v_c.code, _store_id, _subscription_id, lower(_customer_email),
    _discount_cents, _original_cents
  ) RETURNING id INTO v_id;

  UPDATE public.coupons SET times_used = times_used + 1, updated_at = now()
    WHERE id = v_c.id;
  RETURN v_id;
END $$;

-- 3.5 referral_balance
CREATE OR REPLACE FUNCTION public.referral_balance(_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(amount_cents), 0)::int
    FROM public.referral_credits
   WHERE user_id = _user_id;
$$;

-- 3.6 use_referral_credit
CREATE OR REPLACE FUNCTION public.use_referral_credit(_amount_cents int, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bal int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  v_bal := public.referral_balance(v_user);
  IF v_bal < _amount_cents THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Saldo insuficiente.');
  END IF;
  INSERT INTO public.referral_credits (user_id, type, amount_cents, notes)
    VALUES (v_user, 'uso_desconto', -1 * _amount_cents, _notes);
  RETURN jsonb_build_object('ok', true, 'new_balance', v_bal - _amount_cents);
END $$;

-- 3.7 referral_dashboard (painel do usuário)
CREATE OR REPLACE FUNCTION public.referral_dashboard(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total int; v_pend int; v_conv int; v_bal int; v_code text;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT code INTO v_code FROM public.referral_codes WHERE user_id = _user_id;
  SELECT count(*) INTO v_total FROM public.referrals WHERE referrer_user_id = _user_id;
  SELECT count(*) INTO v_pend  FROM public.referrals WHERE referrer_user_id = _user_id AND status = 'pendente';
  SELECT count(*) INTO v_conv  FROM public.referrals WHERE referrer_user_id = _user_id AND status = 'convertida';
  v_bal := public.referral_balance(_user_id);
  RETURN jsonb_build_object(
    'code', v_code,
    'total', v_total,
    'pendentes', v_pend,
    'convertidas', v_conv,
    'saldo_cents', v_bal
  );
END $$;

-- 3.8 referral_ranking (público autenticado, anonimizado)
CREATE OR REPLACE FUNCTION public.referral_ranking()
RETURNS TABLE(rank int, display_name text, convertidas bigint, total bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH agg AS (
    SELECT r.referrer_user_id,
           count(*) FILTER (WHERE r.status = 'convertida') AS conv,
           count(*) AS tot
    FROM public.referrals r
    GROUP BY r.referrer_user_id
    HAVING count(*) > 0
  )
  SELECT
    row_number() OVER (ORDER BY conv DESC, tot DESC)::int,
    COALESCE(
      split_part(NULLIF(p.full_name,''), ' ', 1) || ' ' ||
      upper(substring(coalesce(split_part(p.full_name,' ',2), p.email), 1, 1)) || '.',
      'Indicador #' || substring(a.referrer_user_id::text, 1, 4)
    ),
    a.conv, a.tot
  FROM agg a
  LEFT JOIN public.profiles p ON p.id = a.referrer_user_id
  ORDER BY conv DESC, tot DESC
  LIMIT 10;
$$;

-- 3.9 mobileplus_referrals_overview (admin master)
CREATE OR REPLACE FUNCTION public.mobileplus_referrals_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total int; v_pend int; v_conv int; v_canc int;
  v_revenue numeric; v_coupon_discount numeric; v_bonus numeric;
  v_rate numeric;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_total FROM public.referrals;
  SELECT count(*) INTO v_pend  FROM public.referrals WHERE status = 'pendente';
  SELECT count(*) INTO v_conv  FROM public.referrals WHERE status = 'convertida';
  SELECT count(*) INTO v_canc  FROM public.referrals WHERE status = 'cancelada';

  SELECT COALESCE(SUM(s.amount_cents),0)::numeric / 100
    INTO v_revenue
    FROM public.referrals r
    JOIN public.subscriptions s ON s.id = r.referred_subscription_id
   WHERE r.status = 'convertida';

  SELECT COALESCE(SUM(discount_cents),0)::numeric / 100
    INTO v_coupon_discount FROM public.coupon_redemptions;

  SELECT COALESCE(SUM(amount_cents),0)::numeric / 100
    INTO v_bonus FROM public.referral_credits WHERE type = 'credito_indicacao';

  v_rate := CASE WHEN v_total = 0 THEN 0
                 ELSE round((v_conv::numeric / v_total) * 100, 1) END;

  RETURN jsonb_build_object(
    'total', v_total,
    'pendentes', v_pend,
    'convertidas', v_conv,
    'canceladas', v_canc,
    'taxa_conversao', v_rate,
    'receita_indicacoes', v_revenue,
    'desconto_cupons', v_coupon_discount,
    'bonus_pagos', v_bonus
  );
END $$;

-- =====================================================================
-- 4. TRIGGER: conversão automática de referral quando assinatura paga
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_referral_on_subscription_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ref public.referrals%ROWTYPE;
  v_active_states text[] := ARRAY['active','ativa','vitalicio'];
BEGIN
  IF NEW.status::text = ANY (v_active_states)
     AND (OLD.status IS NULL OR OLD.status::text <> NEW.status::text) THEN

    -- tenta achar por subscription, depois por email
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

      INSERT INTO public.referral_credits (user_id, type, amount_cents, referral_id, subscription_id, notes)
        VALUES (v_ref.referrer_user_id, 'credito_indicacao', v_ref.bonus_cents, v_ref.id, NEW.id,
                'Bônus por indicação convertida');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_referral_on_subscription_active ON public.subscriptions;
CREATE TRIGGER trg_referral_on_subscription_active
  AFTER UPDATE OF status ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_referral_on_subscription_active();

-- =====================================================================
-- 5. updated_at trigger nas tabelas novas
-- =====================================================================
CREATE TRIGGER trg_referrals_set_updated BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_coupons_set_updated BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
