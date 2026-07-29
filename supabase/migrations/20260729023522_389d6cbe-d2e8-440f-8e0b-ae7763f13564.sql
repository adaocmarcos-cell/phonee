-- 1) cobertura de custo no dashboard
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(_store_id uuid, _from timestamptz, _to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
DECLARE
  v_base jsonb;
  v_rev_with numeric := 0; v_rev_all numeric := 0;
  v_items_no_cost int := 0; v_items_total int := 0;
BEGIN
  v_base := public.get_dashboard_metrics_base(_store_id, _from, _to);

  SELECT COALESCE(SUM(si.total) FILTER (WHERE si.unit_cost > 0), 0),
         COALESCE(SUM(si.total), 0),
         COUNT(*) FILTER (WHERE si.unit_cost <= 0),
         COUNT(*)
    INTO v_rev_with, v_rev_all, v_items_no_cost, v_items_total
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
   WHERE s.store_id = _store_id
     AND s.created_at >= _from AND s.created_at <= _to
     AND COALESCE(si.is_service, false) = false;

  RETURN v_base || jsonb_build_object(
    'cobertura_custo', CASE WHEN v_rev_all > 0 THEN ROUND(100.0 * v_rev_with / v_rev_all, 1) ELSE 100 END,
    'itens_sem_custo', v_items_no_cost,
    'itens_vendidos', v_items_total
  );
END; $function$;

-- 2) relatório de vendas sem custo
CREATE OR REPLACE FUNCTION public.sales_without_cost(_store_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE (
  sale_id uuid, sale_number text, created_at timestamptz, customer_name text,
  sale_total numeric, item_id uuid, item_name text, quantity int,
  unit_price numeric, item_total numeric, product_id uuid, product_cost numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.id, s.sale_number::text, s.created_at, s.customer_name,
         COALESCE(s.net_value, s.total), si.id, COALESCE(si.name, p.name, '—'),
         si.quantity, si.unit_price, si.total, si.product_id, COALESCE(p.cost_price, 0)
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    LEFT JOIN public.products p ON p.id = si.product_id
   WHERE s.store_id = _store_id
     AND s.created_at >= _from AND s.created_at <= _to
     AND COALESCE(si.is_service, false) = false
     AND si.unit_cost <= 0
     AND public.user_has_store_access(auth.uid(), s.store_id)
   ORDER BY s.created_at DESC;
$$;

-- 3) correção em lote do custo
CREATE OR REPLACE FUNCTION public.set_sale_items_cost(_items jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record; v_store uuid; v_old numeric; v_count int := 0;
BEGIN
  FOR r IN SELECT (x->>'item_id')::uuid AS item_id, (x->>'unit_cost')::numeric AS unit_cost
             FROM jsonb_array_elements(_items) x
  LOOP
    IF r.unit_cost IS NULL OR r.unit_cost < 0 THEN
      RAISE EXCEPTION 'Custo inválido';
    END IF;

    SELECT s.store_id, si.unit_cost INTO v_store, v_old
      FROM public.sale_items si JOIN public.sales s ON s.id = si.sale_id
     WHERE si.id = r.item_id;

    IF v_store IS NULL THEN CONTINUE; END IF;

    IF NOT (public.has_role(auth.uid(), v_store, 'dono'::public.app_role)
         OR public.has_role(auth.uid(), v_store, 'gerente'::public.app_role)
         OR public.is_admin_master(auth.uid())) THEN
      RAISE EXCEPTION 'Sem permissão para ajustar custos';
    END IF;

    UPDATE public.sale_items SET unit_cost = r.unit_cost WHERE id = r.item_id;

    INSERT INTO public.audit_log (user_id, store_id, action, entity, entity_id, module, screen, old_value, new_value)
    VALUES (auth.uid(), v_store, 'ajuste_custo_item_venda', 'sale_items', r.item_id, 'vendas', 'vendas_sem_custo',
            jsonb_build_object('unit_cost', v_old), jsonb_build_object('unit_cost', r.unit_cost));

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

GRANT EXECUTE ON FUNCTION public.sales_without_cost(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_sale_items_cost(jsonb) TO authenticated;