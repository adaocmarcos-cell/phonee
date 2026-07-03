CREATE TABLE public.trial_signup_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trial_signup_attempts_ip_created_at
  ON public.trial_signup_attempts (ip, created_at DESC);

GRANT ALL ON public.trial_signup_attempts TO service_role;

ALTER TABLE public.trial_signup_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all to authenticated"
  ON public.trial_signup_attempts
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny all to anon"
  ON public.trial_signup_attempts
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);