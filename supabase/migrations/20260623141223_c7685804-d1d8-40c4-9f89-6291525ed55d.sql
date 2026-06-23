
CREATE TYPE public.stock_adjustment_reason AS ENUM ('perda','brinde','uso_interno','correcao','entrada_manual','outros');
CREATE TYPE public.stock_item_kind AS ENUM ('product','part');

CREATE TABLE public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  item_kind public.stock_item_kind NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  part_id uuid REFERENCES public.parts_inventory(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  qty_change integer NOT NULL,
  prev_stock integer NOT NULL,
  new_stock integer NOT NULL,
  reason public.stock_adjustment_reason NOT NULL DEFAULT 'outros',
  justification text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_adjustments_store_created ON public.stock_adjustments(store_id, created_at DESC);
CREATE INDEX idx_stock_adjustments_product ON public.stock_adjustments(product_id);
CREATE INDEX idx_stock_adjustments_part ON public.stock_adjustments(part_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store members can view adjustments"
  ON public.stock_adjustments FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "store members can insert adjustments"
  ON public.stock_adjustments FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id) AND user_id = auth.uid());

CREATE POLICY "managers can update adjustments"
  ON public.stock_adjustments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), store_id, 'dono'::public.app_role)
    OR public.has_role(auth.uid(), store_id, 'gerente'::public.app_role)
  );

CREATE POLICY "managers can delete adjustments"
  ON public.stock_adjustments FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), store_id, 'dono'::public.app_role)
    OR public.has_role(auth.uid(), store_id, 'gerente'::public.app_role)
  );
