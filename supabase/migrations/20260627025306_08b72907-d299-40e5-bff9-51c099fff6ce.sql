
CREATE TABLE public.pdf_sync_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  filename TEXT NOT NULL,
  total_pdf_items INTEGER NOT NULL DEFAULT 0,
  total_db_items INTEGER NOT NULL DEFAULT 0,
  ok_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  divergences_count INTEGER NOT NULL DEFAULT 0,
  total_units_pdf NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_units_db NUMERIC(14,2) NOT NULL DEFAULT 0,
  divergences JSONB NOT NULL DEFAULT '[]'::jsonb,
  csv_data TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_sync_audits_store ON public.pdf_sync_audits(store_id, created_at DESC);

GRANT SELECT, INSERT ON public.pdf_sync_audits TO authenticated;
GRANT ALL ON public.pdf_sync_audits TO service_role;

ALTER TABLE public.pdf_sync_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdf_sync_audits_select_member" ON public.pdf_sync_audits
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "pdf_sync_audits_insert_member" ON public.pdf_sync_audits
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id) AND (user_id IS NULL OR user_id = auth.uid()));
