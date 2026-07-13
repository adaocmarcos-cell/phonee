
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.user_store_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  can_view_sales boolean NOT NULL DEFAULT true,
  can_edit_sales boolean NOT NULL DEFAULT true,
  can_view_purchases boolean NOT NULL DEFAULT true,
  can_edit_purchases boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_store_permissions TO authenticated;
GRANT ALL ON public.user_store_permissions TO service_role;
ALTER TABLE public.user_store_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usp_read" ON public.user_store_permissions;
CREATE POLICY "usp_read" ON public.user_store_permissions
FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR public.is_owner(auth.uid(), store_id)
  OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
  OR public.is_admin_master(auth.uid()));

DROP POLICY IF EXISTS "usp_manage" ON public.user_store_permissions;
CREATE POLICY "usp_manage" ON public.user_store_permissions
FOR ALL TO authenticated
USING (public.is_owner(auth.uid(), store_id)
  OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
  OR public.is_admin_master(auth.uid()))
WITH CHECK (public.is_owner(auth.uid(), store_id)
  OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
  OR public.is_admin_master(auth.uid()));

DROP TRIGGER IF EXISTS trg_usp_updated ON public.user_store_permissions;
CREATE TRIGGER trg_usp_updated BEFORE UPDATE ON public.user_store_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.user_store_can(_user_id uuid, _store_id uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE _feature
              WHEN 'view_sales'     THEN can_view_sales
              WHEN 'edit_sales'     THEN can_edit_sales
              WHEN 'view_purchases' THEN can_view_purchases
              WHEN 'edit_purchases' THEN can_edit_purchases
              ELSE NULL END
     FROM public.user_store_permissions
     WHERE user_id = _user_id AND store_id = _store_id),
    true);
$$;

DROP POLICY IF EXISTS "sales_select_member" ON public.sales;
CREATE POLICY "sales_select_member" ON public.sales
FOR SELECT TO authenticated
USING (public.user_has_store_access(auth.uid(), store_id)
  AND public.user_store_can(auth.uid(), store_id, 'view_sales'));

DROP POLICY IF EXISTS "sales_update_manager" ON public.sales;
DROP POLICY IF EXISTS "sales_update_member" ON public.sales;
CREATE POLICY "sales_update_member" ON public.sales
FOR UPDATE TO authenticated
USING (public.user_has_store_access(auth.uid(), store_id)
  AND public.user_store_can(auth.uid(), store_id, 'edit_sales'))
WITH CHECK (public.user_has_store_access(auth.uid(), store_id)
  AND public.user_store_can(auth.uid(), store_id, 'edit_sales'));

DROP POLICY IF EXISTS "sale_items_select_member" ON public.sale_items;
CREATE POLICY "sale_items_select_member" ON public.sale_items
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s
  WHERE s.id = sale_items.sale_id
    AND public.user_has_store_access(auth.uid(), s.store_id)
    AND public.user_store_can(auth.uid(), s.store_id, 'view_sales')));

DROP POLICY IF EXISTS "sale_items_update_manager" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_update_member" ON public.sale_items;
CREATE POLICY "sale_items_update_member" ON public.sale_items
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s
  WHERE s.id = sale_items.sale_id
    AND public.user_has_store_access(auth.uid(), s.store_id)
    AND public.user_store_can(auth.uid(), s.store_id, 'edit_sales')))
WITH CHECK (EXISTS (SELECT 1 FROM public.sales s
  WHERE s.id = sale_items.sale_id
    AND public.user_has_store_access(auth.uid(), s.store_id)
    AND public.user_store_can(auth.uid(), s.store_id, 'edit_sales')));

DROP POLICY IF EXISTS "members read po" ON public.purchase_orders;
CREATE POLICY "members read po" ON public.purchase_orders
FOR SELECT TO authenticated
USING (public.user_has_store_access(auth.uid(), store_id)
  AND public.user_store_can(auth.uid(), store_id, 'view_purchases'));

DROP POLICY IF EXISTS "managers manage po" ON public.purchase_orders;
DROP POLICY IF EXISTS "members manage po" ON public.purchase_orders;
CREATE POLICY "members manage po" ON public.purchase_orders
FOR ALL TO authenticated
USING (public.user_has_store_access(auth.uid(), store_id)
  AND public.user_store_can(auth.uid(), store_id, 'edit_purchases'))
WITH CHECK (public.user_has_store_access(auth.uid(), store_id)
  AND public.user_store_can(auth.uid(), store_id, 'edit_purchases'));

DROP POLICY IF EXISTS "members read po items" ON public.purchase_order_items;
CREATE POLICY "members read po items" ON public.purchase_order_items
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_orders o
  WHERE o.id = purchase_order_items.order_id
    AND public.user_has_store_access(auth.uid(), o.store_id)
    AND public.user_store_can(auth.uid(), o.store_id, 'view_purchases')));

DROP POLICY IF EXISTS "managers manage po items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "members manage po items" ON public.purchase_order_items;
CREATE POLICY "members manage po items" ON public.purchase_order_items
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchase_orders o
  WHERE o.id = purchase_order_items.order_id
    AND public.user_has_store_access(auth.uid(), o.store_id)
    AND public.user_store_can(auth.uid(), o.store_id, 'edit_purchases')))
WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders o
  WHERE o.id = purchase_order_items.order_id
    AND public.user_has_store_access(auth.uid(), o.store_id)
    AND public.user_store_can(auth.uid(), o.store_id, 'edit_purchases')));

CREATE OR REPLACE FUNCTION public.phonee_set_store_permission(
  _user_id uuid, _store_id uuid, _feature text, _allowed boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_col text; v_old boolean;
BEGIN
  IF NOT (public.is_owner(auth.uid(), _store_id)
    OR public.has_role(auth.uid(), _store_id, 'gerente'::app_role)
    OR public.is_admin_master(auth.uid())) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  v_col := CASE _feature
    WHEN 'view_sales'     THEN 'can_view_sales'
    WHEN 'edit_sales'     THEN 'can_edit_sales'
    WHEN 'view_purchases' THEN 'can_view_purchases'
    WHEN 'edit_purchases' THEN 'can_edit_purchases'
    ELSE NULL END;
  IF v_col IS NULL THEN RAISE EXCEPTION 'invalid feature: %', _feature; END IF;
  INSERT INTO public.user_store_permissions(user_id, store_id)
  VALUES (_user_id, _store_id)
  ON CONFLICT (user_id, store_id) DO NOTHING;
  EXECUTE format('SELECT %I FROM public.user_store_permissions WHERE user_id=$1 AND store_id=$2', v_col)
    INTO v_old USING _user_id, _store_id;
  EXECUTE format('UPDATE public.user_store_permissions SET %I = $1, updated_at = now() WHERE user_id = $2 AND store_id = $3', v_col)
    USING _allowed, _user_id, _store_id;
  INSERT INTO public.audit_log(store_id, user_id, action, entity, entity_id, module, old_value, new_value, details)
  VALUES (_store_id, auth.uid(), 'permission_change', 'user_store_permissions', _user_id, 'vinculos',
    jsonb_build_object(v_col, v_old),
    jsonb_build_object(v_col, _allowed),
    jsonb_build_object('target_user', _user_id, 'feature', _feature, 'allowed', _allowed));
END; $$;

GRANT EXECUTE ON FUNCTION public.phonee_set_store_permission(uuid, uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.phonee_list_store_permissions(_store_id uuid)
RETURNS TABLE (user_id uuid, email text, full_name text,
  can_view_sales boolean, can_edit_sales boolean,
  can_view_purchases boolean, can_edit_purchases boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT us.user_id, p.email, p.full_name,
    COALESCE(usp.can_view_sales, true),
    COALESCE(usp.can_edit_sales, true),
    COALESCE(usp.can_view_purchases, true),
    COALESCE(usp.can_edit_purchases, true)
  FROM public.user_stores us
  LEFT JOIN public.profiles p ON p.id = us.user_id
  LEFT JOIN public.user_store_permissions usp
    ON usp.user_id = us.user_id AND usp.store_id = us.store_id
  WHERE us.store_id = _store_id
    AND (public.is_owner(auth.uid(), _store_id)
      OR public.has_role(auth.uid(), _store_id, 'gerente'::app_role)
      OR public.is_admin_master(auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION public.phonee_list_store_permissions(uuid) TO authenticated;
