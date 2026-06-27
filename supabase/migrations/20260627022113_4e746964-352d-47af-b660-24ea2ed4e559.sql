
-- Harden demo_leads: add created_by and rate-limit referral inserts per user
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Authenticated users can insert referral leads" ON public.demo_leads;

CREATE POLICY "Authenticated users can insert referral leads"
ON public.demo_leads
FOR INSERT
TO authenticated
WITH CHECK (
  kind = 'indicacao'
  AND created_by = auth.uid()
  AND length(coalesce(name,'')) BETWEEN 2 AND 120
  AND length(coalesce(whatsapp,'')) BETWEEN 8 AND 30
  AND length(coalesce(instagram,'')) BETWEEN 1 AND 80
);

CREATE OR REPLACE FUNCTION public.tg_demo_leads_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NEW.created_by IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count
    FROM public.demo_leads
   WHERE created_by = NEW.created_by
     AND created_at > now() - interval '1 hour';
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'rate limit exceeded: max 10 referral leads per hour';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_demo_leads_rate_limit ON public.demo_leads;
CREATE TRIGGER tg_demo_leads_rate_limit
BEFORE INSERT ON public.demo_leads
FOR EACH ROW EXECUTE FUNCTION public.tg_demo_leads_rate_limit();
