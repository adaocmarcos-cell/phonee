
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  doc_type text,
  document text,
  email text,
  phone text,
  whatsapp text,
  birthdate date,
  address_zip text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_uf text,
  notes text,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store members read customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id) OR public.is_owner(auth.uid(), store_id));

CREATE POLICY "store members insert customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id) OR public.is_owner(auth.uid(), store_id));

CREATE POLICY "store members update customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id) OR public.is_owner(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id) OR public.is_owner(auth.uid(), store_id));

CREATE POLICY "store members delete customers" ON public.customers
  FOR DELETE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id) OR public.is_owner(auth.uid(), store_id));

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_customers_store ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_doc ON public.customers(store_id, document);
