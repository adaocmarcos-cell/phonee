
CREATE OR REPLACE FUNCTION public.set_leads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  whatsapp text NOT NULL,
  cidade text,
  nome_loja text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  origem_pagina text,
  status text NOT NULL DEFAULT 'novo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can submit leads"
ON public.leads FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admin masters can view leads"
ON public.leads FOR SELECT
TO authenticated
USING (public.is_admin_master(auth.uid()));

CREATE POLICY "Admin masters can update leads"
ON public.leads FOR UPDATE
TO authenticated
USING (public.is_admin_master(auth.uid()))
WITH CHECK (public.is_admin_master(auth.uid()));

CREATE POLICY "Admin masters can delete leads"
ON public.leads FOR DELETE
TO authenticated
USING (public.is_admin_master(auth.uid()));

CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_leads_updated_at();

CREATE INDEX idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX idx_leads_status ON public.leads (status);
