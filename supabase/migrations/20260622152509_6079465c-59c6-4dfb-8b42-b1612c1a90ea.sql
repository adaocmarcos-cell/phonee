
-- Status enum
DO $$ BEGIN
  CREATE TYPE public.os_status AS ENUM (
    'recebido','em_analise','aguardando_orcamento','aguardando_aprovacao',
    'aguardando_peca','em_reparo','em_testes','pronto_retirada','entregue','cancelado'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.os_budget_status AS ENUM ('pendente','aprovado','reprovado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  os_number INTEGER,
  status public.os_status NOT NULL DEFAULT 'recebido',

  -- Cliente
  customer_name TEXT NOT NULL,
  customer_cpf TEXT,
  customer_whatsapp TEXT,
  customer_email TEXT,
  customer_city TEXT,
  customer_address TEXT,

  -- Equipamento
  device_category TEXT,
  device_brand TEXT,
  device_model TEXT,
  device_color TEXT,
  device_storage TEXT,
  device_imei1 TEXT,
  device_imei2 TEXT,
  device_serial TEXT,
  device_password TEXT,
  device_system TEXT,

  -- Motivo
  reasons TEXT[] DEFAULT '{}',
  issue_description TEXT,

  -- Checklist de recebimento
  receive_checklist JSONB DEFAULT '{}'::jsonb,
  battery_health NUMERIC,

  -- Acessórios
  accessories TEXT[] DEFAULT '{}',

  -- Fotos (array de URLs públicas/signed)
  photos JSONB DEFAULT '[]'::jsonb,

  -- Orçamento
  parts_value NUMERIC NOT NULL DEFAULT 0,
  labor_value NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  estimated_days INTEGER,
  budget_status public.os_budget_status NOT NULL DEFAULT 'pendente',

  -- Execução
  technician TEXT,
  start_date DATE,
  end_date DATE,
  work_checklist JSONB DEFAULT '{}'::jsonb,

  -- Entrega
  delivery_checklist JSONB DEFAULT '{}'::jsonb,
  final_notes TEXT,

  -- Assinaturas (data URLs)
  customer_signature TEXT,
  tech_signature TEXT,
  signed_at TIMESTAMPTZ,

  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_orders TO authenticated;
GRANT ALL ON public.service_orders TO service_role;

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "os_select_store" ON public.service_orders
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "os_insert_store" ON public.service_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "os_update_store" ON public.service_orders
  FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "os_delete_owner" ON public.service_orders
  FOR DELETE TO authenticated
  USING (public.is_owner(auth.uid(), store_id));

-- Auto OS number
CREATE OR REPLACE FUNCTION public.assign_os_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.os_number IS NULL THEN
    SELECT COALESCE(MAX(os_number), 0) + 1 INTO NEW.os_number
    FROM public.service_orders WHERE store_id = NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_os_number ON public.service_orders;
CREATE TRIGGER trg_assign_os_number
BEFORE INSERT ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.assign_os_number();

DROP TRIGGER IF EXISTS trg_os_updated_at ON public.service_orders;
CREATE TRIGGER trg_os_updated_at
BEFORE UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS service_orders_store_number_uidx
  ON public.service_orders(store_id, os_number);
CREATE INDEX IF NOT EXISTS service_orders_store_idx
  ON public.service_orders(store_id, created_at DESC);

-- Storage policies for service-order-photos (bucket created via tool)
CREATE POLICY "os_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'service-order-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "os_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'service-order-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "os_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'service-order-photos' AND auth.uid() IS NOT NULL);
