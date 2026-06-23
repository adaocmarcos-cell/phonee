
DO $$ BEGIN
  CREATE TYPE public.part_category AS ENUM ('telas','baterias','tampas','cameras','flex','componentes','outros');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.parts_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  category public.part_category NOT NULL,
  category_other text,
  sku text,
  brand text,
  compatible_models text,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sale_price numeric(12,2) NOT NULL DEFAULT 0,
  stock_current integer NOT NULL DEFAULT 0,
  stock_min integer NOT NULL DEFAULT 0,
  supplier text,
  location text,
  notes text,
  is_tool boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_inventory TO authenticated;
GRANT ALL ON public.parts_inventory TO service_role;

ALTER TABLE public.parts_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_parts" ON public.parts_inventory
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members_insert_parts" ON public.parts_inventory
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members_update_parts" ON public.parts_inventory
  FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members_delete_parts" ON public.parts_inventory
  FOR DELETE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE TRIGGER tg_parts_inventory_updated BEFORE UPDATE ON public.parts_inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.service_order_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts_inventory(id),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  qty integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_parts TO authenticated;
GRANT ALL ON public.service_order_parts TO service_role;

ALTER TABLE public.service_order_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_sop" ON public.service_order_parts
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members_insert_sop" ON public.service_order_parts
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members_update_sop" ON public.service_order_parts
  FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members_delete_sop" ON public.service_order_parts
  FOR DELETE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE INDEX IF NOT EXISTS idx_parts_inventory_store ON public.parts_inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_sop_order ON public.service_order_parts(service_order_id);
