-- Tracking columns for trial expiry notifications
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_warning_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expired_notice_sent_at timestamptz;

-- Eligibility checker: returns whether the given identity can still use the trial plan.
CREATE OR REPLACE FUNCTION public.trial_eligibility(
  _email text DEFAULT NULL,
  _doc text DEFAULT NULL,
  _user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(nullif(trim(coalesce(_email,'')), ''));
  v_doc text := nullif(regexp_replace(coalesce(_doc,''), '\D', '', 'g'), '');
  v_match record;
BEGIN
  IF v_email IS NULL AND v_doc IS NULL AND _user_id IS NULL THEN
    RETURN jsonb_build_object('eligible', true, 'reason', null);
  END IF;

  SELECT id, status, expires_at, customer_email INTO v_match
  FROM public.subscriptions
  WHERE billing_cycle = 'trial'
    AND (
      (v_email IS NOT NULL AND lower(customer_email) = v_email)
      OR (v_doc IS NOT NULL AND customer_doc = v_doc)
      OR (_user_id IS NOT NULL AND user_id = _user_id)
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', true, 'reason', null);
  END IF;

  RETURN jsonb_build_object(
    'eligible', false,
    'reason', 'trial_already_used',
    'message', 'A Mensalidade Teste é uma oferta única por cadastro e já foi utilizada para este e-mail/CPF. Escolha o plano Anual ou Vitalício para continuar.',
    'previous_status', v_match.status,
    'previous_expires_at', v_match.expires_at
  );
END $$;

GRANT EXECUTE ON FUNCTION public.trial_eligibility(text, text, uuid) TO anon, authenticated, service_role;