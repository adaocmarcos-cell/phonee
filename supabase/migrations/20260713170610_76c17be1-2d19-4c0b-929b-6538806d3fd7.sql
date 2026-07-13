
-- sale_items: policy de UPDATE inexistente
DROP POLICY IF EXISTS "sale_items_update_manager" ON public.sale_items;
CREATE POLICY "sale_items_update_manager" ON public.sale_items
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id
       AND (public.is_owner(auth.uid(), s.store_id) OR public.has_role(auth.uid(), s.store_id, 'gerente'::public.app_role))))
WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id
       AND (public.is_owner(auth.uid(), s.store_id) OR public.has_role(auth.uid(), s.store_id, 'gerente'::public.app_role))));

-- sales: ampliar UPDATE de dono para dono ou gerente
DROP POLICY IF EXISTS "sales_update_owner" ON public.sales;
DROP POLICY IF EXISTS "sales_update_manager" ON public.sales;
CREATE POLICY "sales_update_manager" ON public.sales
FOR UPDATE TO authenticated
USING (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::public.app_role))
WITH CHECK (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::public.app_role));
