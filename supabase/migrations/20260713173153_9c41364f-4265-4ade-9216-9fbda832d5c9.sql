-- has_permission: dono sempre pode; demais dependem de role_permissions.
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _store_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_owner(_user_id, _store_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.store_id = ur.store_id AND rp.role = ur.role
    WHERE ur.user_id = _user_id
      AND ur.store_id = _store_id
      AND rp.module = _module
      AND rp.action = _action
      AND rp.allowed = true
  );
$$;

-- VENDAS ---------------------------------------------------------------
DROP POLICY IF EXISTS "sales_delete_owner" ON public.sales;
DROP POLICY IF EXISTS "sales_delete_perm" ON public.sales;
CREATE POLICY "sales_delete_perm" ON public.sales
FOR DELETE TO authenticated
USING (public.has_permission(auth.uid(), store_id, 'vendas', 'excluir'));

DROP POLICY IF EXISTS "sale_items_delete_owner" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_delete_perm" ON public.sale_items;
CREATE POLICY "sale_items_delete_perm" ON public.sale_items
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sales s
  WHERE s.id = sale_items.sale_id
    AND public.has_permission(auth.uid(), s.store_id, 'vendas', 'excluir')
));

DROP POLICY IF EXISTS "store members delete sale_payments" ON public.sale_payments;
DROP POLICY IF EXISTS "sale_payments_delete_perm" ON public.sale_payments;
CREATE POLICY "sale_payments_delete_perm" ON public.sale_payments
FOR DELETE TO authenticated
USING (public.has_permission(auth.uid(), store_id, 'vendas', 'excluir'));

DROP POLICY IF EXISTS "members_delete_parts_sales" ON public.parts_sales;
DROP POLICY IF EXISTS "parts_sales_delete_perm" ON public.parts_sales;
CREATE POLICY "parts_sales_delete_perm" ON public.parts_sales
FOR DELETE TO authenticated
USING (public.has_permission(auth.uid(), store_id, 'vendas', 'excluir'));

-- COMPRAS --------------------------------------------------------------
-- Separa a policy ALL existente em INSERT/UPDATE (dono/gerente) + DELETE via matriz.
DROP POLICY IF EXISTS "members manage po" ON public.purchase_orders;
DROP POLICY IF EXISTS "managers manage po" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_insert_manager" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_update_manager" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_delete_perm" ON public.purchase_orders;

CREATE POLICY "po_insert_manager" ON public.purchase_orders
FOR INSERT TO authenticated
WITH CHECK (
  public.is_owner(auth.uid(), store_id)
  OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
);
CREATE POLICY "po_update_manager" ON public.purchase_orders
FOR UPDATE TO authenticated
USING (
  public.is_owner(auth.uid(), store_id)
  OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
)
WITH CHECK (
  public.is_owner(auth.uid(), store_id)
  OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
);
CREATE POLICY "po_delete_perm" ON public.purchase_orders
FOR DELETE TO authenticated
USING (public.has_permission(auth.uid(), store_id, 'compras', 'excluir'));

DROP POLICY IF EXISTS "members manage po items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "managers manage po items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "po_items_insert_manager" ON public.purchase_order_items;
DROP POLICY IF EXISTS "po_items_update_manager" ON public.purchase_order_items;
DROP POLICY IF EXISTS "po_items_delete_perm" ON public.purchase_order_items;

CREATE POLICY "po_items_insert_manager" ON public.purchase_order_items
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.purchase_orders o
  WHERE o.id = purchase_order_items.order_id
    AND (public.is_owner(auth.uid(), o.store_id)
         OR public.has_role(auth.uid(), o.store_id, 'gerente'::app_role))
));
CREATE POLICY "po_items_update_manager" ON public.purchase_order_items
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.purchase_orders o
  WHERE o.id = purchase_order_items.order_id
    AND (public.is_owner(auth.uid(), o.store_id)
         OR public.has_role(auth.uid(), o.store_id, 'gerente'::app_role))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.purchase_orders o
  WHERE o.id = purchase_order_items.order_id
    AND (public.is_owner(auth.uid(), o.store_id)
         OR public.has_role(auth.uid(), o.store_id, 'gerente'::app_role))
));
CREATE POLICY "po_items_delete_perm" ON public.purchase_order_items
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.purchase_orders o
  WHERE o.id = purchase_order_items.order_id
    AND public.has_permission(auth.uid(), o.store_id, 'compras', 'excluir')
));

-- FINANCEIRO -----------------------------------------------------------
DROP POLICY IF EXISTS "Managers delete expenses" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_perm" ON public.expenses;
CREATE POLICY "expenses_delete_perm" ON public.expenses
FOR DELETE TO authenticated
USING (public.has_permission(auth.uid(), store_id, 'financeiro', 'excluir'));