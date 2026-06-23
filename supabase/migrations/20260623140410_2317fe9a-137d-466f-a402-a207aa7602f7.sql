
CREATE TABLE public.store_brands (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category text NOT NULL,
  brand text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, category, brand)
);

CREATE INDEX store_brands_store_idx ON public.store_brands(store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_brands TO authenticated;
GRANT ALL ON public.store_brands TO service_role;

ALTER TABLE public.store_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view store brands"
  ON public.store_brands FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "Members can insert store brands"
  ON public.store_brands FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "Members can update store brands"
  ON public.store_brands FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "Members can delete store brands"
  ON public.store_brands FOR DELETE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
