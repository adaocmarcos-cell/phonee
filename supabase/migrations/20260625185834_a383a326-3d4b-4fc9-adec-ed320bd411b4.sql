-- Add instagram column to partner_trials
ALTER TABLE public.partner_trials
  ADD COLUMN IF NOT EXISTS instagram text;

-- Drop existing function to allow return type change
DROP FUNCTION IF EXISTS public.phonee_partner_trials_list();

-- Update listing RPC to include instagram
CREATE OR REPLACE FUNCTION public.phonee_partner_trials_list()
RETURNS TABLE(
  id uuid, user_id uuid, email text, full_name text, whatsapp text,
  notes text, instagram text, invited_at timestamptz, activated_at timestamptz,
  trial_days int, trial_ends_at timestamptz,
  full_access_granted_at timestamptz, full_access_months int,
  full_access_ends_at timestamptz, status text,
  invite_link text, days_left numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pt.id, pt.user_id, pt.email, pt.full_name, pt.whatsapp, pt.notes, pt.instagram,
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