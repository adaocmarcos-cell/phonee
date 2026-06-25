
-- 1) Optional expiration on extras
ALTER TABLE public.user_profile_extras
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 2) partner_trials
CREATE TABLE IF NOT EXISTS public.partner_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text,
  whatsapp text,
  notes text,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,            -- start of 7-day evaluation
  trial_days int NOT NULL DEFAULT 7,
  trial_ends_at timestamptz,           -- activated_at + trial_days
  full_access_granted_at timestamptz,  -- manual release after trial
  full_access_months int NOT NULL DEFAULT 12,
  full_access_ends_at timestamptz,
  status text NOT NULL DEFAULT 'em_teste'
    CHECK (status IN ('em_teste','teste_expirado','liberado','expirado','revogado')),
  invite_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_trials_user ON public.partner_trials(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_trials_status ON public.partner_trials(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_trials TO authenticated;
GRANT ALL ON public.partner_trials TO service_role;

ALTER TABLE public.partner_trials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_trials_master_all"
ON public.partner_trials FOR ALL
TO authenticated
USING (public.is_admin_master(auth.uid()))
WITH CHECK (public.is_admin_master(auth.uid()));

CREATE TRIGGER set_partner_trials_updated_at
BEFORE UPDATE ON public.partner_trials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Listing RPC with computed remaining days
CREATE OR REPLACE FUNCTION public.phonee_partner_trials_list()
RETURNS TABLE(
  id uuid, user_id uuid, email text, full_name text, whatsapp text,
  notes text, invited_at timestamptz, activated_at timestamptz,
  trial_days int, trial_ends_at timestamptz,
  full_access_granted_at timestamptz, full_access_months int,
  full_access_ends_at timestamptz, status text,
  invite_link text, days_left numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pt.id, pt.user_id, pt.email, pt.full_name, pt.whatsapp, pt.notes,
         pt.invited_at, pt.activated_at, pt.trial_days, pt.trial_ends_at,
         pt.full_access_granted_at, pt.full_access_months, pt.full_access_ends_at,
         pt.status, pt.invite_link,
         CASE
           WHEN pt.status = 'liberado' AND pt.full_access_ends_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (pt.full_access_ends_at - now()))/86400.0
           WHEN pt.status = 'em_teste' AND pt.trial_ends_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (pt.trial_ends_at - now()))/86400.0
           ELSE NULL
         END AS days_left
    FROM public.partner_trials pt
   WHERE public.is_admin_master(auth.uid())
   ORDER BY pt.invited_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.phonee_partner_trials_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phonee_partner_trials_list() TO authenticated, service_role;
