
CREATE TABLE IF NOT EXISTS public.parts_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts_inventory(id),
  seller_id uuid REFERENCES auth.users(id),
  qty integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL,
  installments integer,
  customer_name text,
  customer_doc text,
  customer_whatsapp text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_sales TO authenticated;
GRANT ALL ON public.parts_sales TO service_role;

ALTER TABLE public.parts_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_parts_sales" ON public.parts_sales
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members_insert_parts_sales" ON public.parts_sales
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members_update_parts_sales" ON public.parts_sales
  FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members_delete_parts_sales" ON public.parts_sales
  FOR DELETE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE INDEX IF NOT EXISTS idx_parts_sales_store ON public.parts_sales(store_id);
CREATE INDEX IF NOT EXISTS idx_parts_sales_created ON public.parts_sales(created_at DESC);
