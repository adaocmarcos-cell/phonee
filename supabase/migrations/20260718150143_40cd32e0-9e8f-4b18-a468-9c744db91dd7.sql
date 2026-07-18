
-- 1) Fix mutable search_path on validate_imei_15
ALTER FUNCTION public.validate_imei_15() SET search_path = public;

-- 2) Restrict policies to authenticated role (defense in depth)
DROP POLICY IF EXISTS profiles_select_store_owner ON public.profiles;
CREATE POLICY profiles_select_store_owner ON public.profiles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = profiles.id
                   AND public.is_owner(auth.uid(), ur.store_id)));

DROP POLICY IF EXISTS sale_returns_store_all ON public.sale_returns;
CREATE POLICY sale_returns_store_all ON public.sale_returns
  FOR ALL TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

DROP POLICY IF EXISTS sale_return_items_store_all ON public.sale_return_items;
CREATE POLICY sale_return_items_store_all ON public.sale_return_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sale_returns r
                 WHERE r.id = sale_return_items.return_id
                   AND public.user_has_store_access(auth.uid(), r.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sale_returns r
                      WHERE r.id = sale_return_items.return_id
                        AND public.user_has_store_access(auth.uid(), r.store_id)));

DROP POLICY IF EXISTS store_credits_store_all ON public.store_credits;
CREATE POLICY store_credits_store_all ON public.store_credits
  FOR ALL TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

-- 3) Prevent self-assignment of roles via user_roles_owner_manage
DROP POLICY IF EXISTS user_roles_owner_manage ON public.user_roles;
CREATE POLICY user_roles_owner_manage ON public.user_roles
  FOR ALL TO authenticated
  USING (
    public.is_owner(auth.uid(), store_id)
    AND role <> 'admin_master'::public.app_role
    AND user_id <> auth.uid()
  )
  WITH CHECK (
    public.is_owner(auth.uid(), store_id)
    AND role <> 'admin_master'::public.app_role
    AND user_id <> auth.uid()
  );
