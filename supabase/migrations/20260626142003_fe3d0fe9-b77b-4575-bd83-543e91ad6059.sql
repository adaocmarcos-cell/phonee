
ALTER TABLE public.partner_trials
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'partner';

CREATE INDEX IF NOT EXISTS idx_partner_trials_kind ON public.partner_trials(kind);

DROP FUNCTION IF EXISTS public.phonee_partner_trials_list();

CREATE OR REPLACE FUNCTION public.phonee_partner_trials_list()
 RETURNS TABLE(id uuid, user_id uuid, email text, full_name text, whatsapp text, notes text, instagram text, store_name text, city text, state text, kind text, invited_at timestamp with time zone, activated_at timestamp with time zone, trial_days integer, trial_ends_at timestamp with time zone, full_access_granted_at timestamp with time zone, full_access_months integer, full_access_ends_at timestamp with time zone, status text, invite_link text, days_left numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pt.id, pt.user_id, pt.email, pt.full_name, pt.whatsapp, pt.notes, pt.instagram,
         pt.store_name, pt.city, pt.state, pt.kind,
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
$function$;
