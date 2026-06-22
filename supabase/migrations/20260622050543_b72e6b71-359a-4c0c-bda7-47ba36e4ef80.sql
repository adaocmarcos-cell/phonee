
-- ENUMS
CREATE TYPE public.trade_in_status AS ENUM ('em_avaliacao','aprovado','em_estoque','vendido','recusado');
CREATE TYPE public.device_condition AS ENUM ('otimo','bom','regular','com_defeito');
CREATE TYPE public.purchase_order_status AS ENUM ('rascunho','enviado','recebido','parcial','cancelado');

-- TRADE INS
CREATE TABLE public.trade_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  customer_name text NOT NULL,
  customer_doc text,
  customer_phone text,
  customer_email text,
  imei text,
  imei_status text DEFAULT 'nao_verificado',
  brand text,
  model text NOT NULL,
  storage_gb text,
  color text,
  condition public.device_condition NOT NULL DEFAULT 'bom',
  battery_health integer,
  entry_value numeric(12,2) NOT NULL DEFAULT 0,
  intended_sale_value numeric(12,2) NOT NULL DEFAULT 0,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  photos_in text[] NOT NULL DEFAULT '{}',
  photos_out text[] NOT NULL DEFAULT '{}',
  notes text,
  status public.trade_in_status NOT NULL DEFAULT 'em_avaliacao',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_ins TO authenticated;
GRANT ALL ON public.trade_ins TO service_role;
ALTER TABLE public.trade_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read trade_ins" ON public.trade_ins
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members insert trade_ins" ON public.trade_ins
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "members update trade_ins" ON public.trade_ins
  FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "owners delete trade_ins" ON public.trade_ins
  FOR DELETE TO authenticated
  USING (public.is_owner(auth.uid(), store_id));

CREATE TRIGGER trg_trade_ins_updated BEFORE UPDATE ON public.trade_ins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PURCHASE ORDERS
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  supplier text NOT NULL,
  status public.purchase_order_status NOT NULL DEFAULT 'rascunho',
  total_cost numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read po" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "managers manage po" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'))
  WITH CHECK (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'));

CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PURCHASE ORDER ITEMS
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read po items" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders o
    WHERE o.id = order_id AND public.user_has_store_access(auth.uid(), o.store_id)
  ));
CREATE POLICY "managers manage po items" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders o
    WHERE o.id = order_id AND (public.is_owner(auth.uid(), o.store_id) OR public.has_role(auth.uid(), o.store_id, 'gerente'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_orders o
    WHERE o.id = order_id AND (public.is_owner(auth.uid(), o.store_id) OR public.has_role(auth.uid(), o.store_id, 'gerente'))
  ));
