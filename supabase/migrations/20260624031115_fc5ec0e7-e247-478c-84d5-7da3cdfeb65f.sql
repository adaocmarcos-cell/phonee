
ALTER TABLE public.demo_leads
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'demo',
  ADD COLUMN IF NOT EXISTS referral_code text;

ALTER TABLE public.demo_leads
  DROP CONSTRAINT IF EXISTS demo_leads_kind_check;
ALTER TABLE public.demo_leads
  ADD CONSTRAINT demo_leads_kind_check CHECK (kind IN ('demo','indicacao'));

CREATE INDEX IF NOT EXISTS demo_leads_kind_idx ON public.demo_leads(kind);

GRANT INSERT ON public.demo_leads TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can insert referral leads" ON public.demo_leads;
CREATE POLICY "Authenticated users can insert referral leads"
  ON public.demo_leads FOR INSERT
  TO authenticated
  WITH CHECK (kind = 'indicacao');
