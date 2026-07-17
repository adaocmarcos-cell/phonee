
-- 1. Coupons: allow authenticated users to read only active coupons (metadata)
DROP POLICY IF EXISTS "authenticated reads active coupons (metadata only)" ON public.coupons;
CREATE POLICY "authenticated reads active coupons (metadata only)"
  ON public.coupons FOR SELECT TO authenticated
  USING (active = true);

-- 2. customer_orders update: only creator, store owner or admin_master can update
DROP POLICY IF EXISTS "customer_orders update" ON public.customer_orders;
CREATE POLICY "customer_orders update"
  ON public.customer_orders FOR UPDATE TO authenticated
  USING (
    user_has_store_access(auth.uid(), store_id)
    AND (
      created_by = auth.uid()
      OR is_owner(auth.uid(), store_id)
      OR is_admin_master(auth.uid())
      OR has_role(auth.uid(), store_id, 'administrador'::app_role)
      OR has_role(auth.uid(), store_id, 'gerente'::app_role)
    )
  )
  WITH CHECK (
    user_has_store_access(auth.uid(), store_id)
    AND (
      created_by = auth.uid()
      OR is_owner(auth.uid(), store_id)
      OR is_admin_master(auth.uid())
      OR has_role(auth.uid(), store_id, 'administrador'::app_role)
      OR has_role(auth.uid(), store_id, 'gerente'::app_role)
    )
  );

-- 3. profiles: drop unused sensitive pix payout columns (no data, no code usage)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pix_key;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pix_type;
