CREATE TABLE public.demo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  instagram text NOT NULL,
  whatsapp text NOT NULL,
  user_agent text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_leads TO authenticated;
GRANT ALL ON public.demo_leads TO service_role;

ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;

-- Only admin_master can read or manage leads
CREATE POLICY "Admin master can view demo leads"
ON public.demo_leads FOR SELECT
TO authenticated
USING (public.is_admin_master(auth.uid()));

CREATE POLICY "Admin master can delete demo leads"
ON public.demo_leads FOR DELETE
TO authenticated
USING (public.is_admin_master(auth.uid()));

-- Inserts go through the demo-enter edge function (service_role) so no INSERT policy is needed.

CREATE INDEX demo_leads_created_at_idx ON public.demo_leads (created_at DESC);