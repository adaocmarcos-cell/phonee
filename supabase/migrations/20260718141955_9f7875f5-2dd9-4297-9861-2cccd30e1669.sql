
-- 1) Vínculo forte OS -> Cliente
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_customer_id
  ON public.service_orders(customer_id) WHERE customer_id IS NOT NULL;

-- 2) Timeline IMEI ampliada
CREATE OR REPLACE FUNCTION public.track_device_by_imei(_store_id uuid, _imei text)
RETURNS TABLE(event_at timestamptz, event_type text, ref_id uuid, label text, details jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Compra e Troca (entrada)
  SELECT ti.created_at, 'trade_in'::text, ti.id,
         format('Entrada por troca: %s %s', COALESCE(ti.brand,''), COALESCE(ti.model,'')),
         jsonb_build_object(
           'customer', ti.customer_name,
           'entry_value', ti.entry_value,
           'repair_costs', ti.repair_costs,
           'status', ti.status)
    FROM public.trade_ins ti
   WHERE ti.store_id=_store_id AND ti.imei=_imei
     AND public.user_has_store_access(auth.uid(), _store_id)
  UNION ALL
  -- Produto em estoque
  SELECT p.created_at, 'produto', p.id,
         format('Cadastro no estoque: %s', COALESCE(p.name,'')),
         jsonb_build_object('sku', p.sku, 'stock', p.stock_current, 'status', p.status,
                            'cost', p.cost_price, 'price', p.sale_price)
    FROM public.products p
   WHERE p.store_id=_store_id AND p.imei=_imei
     AND public.user_has_store_access(auth.uid(), _store_id)
  UNION ALL
  -- Movimentos de estoque do produto identificado por IMEI
  SELECT sm.occurred_at, 'movimento', sm.id,
         format('Movimento: %s (%s)', sm.type,
                CASE WHEN sm.quantity >= 0 THEN '+'||sm.quantity ELSE sm.quantity::text END),
         jsonb_build_object('type', sm.type, 'qty', sm.quantity,
                            'before', sm.balance_before, 'after', sm.balance_after,
                            'origin', sm.origin_table, 'notes', sm.notes)
    FROM public.stock_movements sm
    JOIN public.products p ON p.id = sm.product_id
   WHERE sm.store_id=_store_id AND p.imei=_imei
     AND public.user_has_store_access(auth.uid(), _store_id)
  UNION ALL
  -- Vendas em que o item foi entregue com esse IMEI
  SELECT s.created_at, 'venda', s.id,
         format('Venda #%s', s.sale_number),
         jsonb_build_object('customer', s.customer_name, 'total', s.total,
                            'qty', si.quantity, 'unit_price', si.unit_price)
    FROM public.sale_items si
    JOIN public.sales s ON s.id=si.sale_id
   WHERE s.store_id=_store_id AND si.imei_serial=_imei
     AND public.user_has_store_access(auth.uid(), _store_id)
  UNION ALL
  -- Ordens de serviço citando o IMEI como aparelho
  SELECT so.created_at, 'os', so.id,
         format('OS #%s — %s', COALESCE(so.os_number::text,'—'), so.status),
         jsonb_build_object('status', so.status, 'customer', so.customer_name,
                            'total', so.total_value, 'technician', so.technician)
    FROM public.service_orders so
   WHERE so.store_id=_store_id
     AND (so.device_imei1=_imei OR so.device_imei2=_imei OR so.device_serial=_imei)
     AND public.user_has_store_access(auth.uid(), _store_id)
  ORDER BY 1 ASC
$$;
