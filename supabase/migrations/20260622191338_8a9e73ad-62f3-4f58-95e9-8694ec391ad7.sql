
-- Fix 1: Drop unsafe user UPDATE on subscriptions. Refunds go through edge function (service role).
DROP POLICY IF EXISTS subscriptions_own_refund_request ON public.subscriptions;

-- Fix 2: Prevent store owners from granting admin_master via user_roles.
DROP POLICY IF EXISTS user_roles_owner_manage ON public.user_roles;
CREATE POLICY user_roles_owner_manage ON public.user_roles
  FOR ALL
  TO authenticated
  USING (is_owner(auth.uid(), store_id) AND role <> 'admin_master'::app_role)
  WITH CHECK (is_owner(auth.uid(), store_id) AND role <> 'admin_master'::app_role);

-- Fix 3: Add explicit DELETE policy on alerts (store members only).
CREATE POLICY alerts_delete_member ON public.alerts
  FOR DELETE
  TO authenticated
  USING (user_has_store_access(auth.uid(), store_id));
