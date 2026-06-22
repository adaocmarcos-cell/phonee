
-- 1. Fix EXPOSED_SENSITIVE_DATA: stores publicly readable
DROP POLICY IF EXISTS stores_public_read ON public.stores;

-- 2. Add PDF branding columns to stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pdf_primary_color TEXT,
  ADD COLUMN IF NOT EXISTS pdf_accent_color TEXT,
  ADD COLUMN IF NOT EXISTS pdf_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_footer_text TEXT;

-- 3. Tighten service-order-photos bucket policies
DROP POLICY IF EXISTS os_photos_select ON storage.objects;
DROP POLICY IF EXISTS os_photos_insert ON storage.objects;
DROP POLICY IF EXISTS os_photos_delete ON storage.objects;

CREATE POLICY os_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'service-order-photos'
    AND public.user_has_store_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY os_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'service-order-photos'
    AND public.user_has_store_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY os_photos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'service-order-photos'
    AND public.user_has_store_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY os_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'service-order-photos'
    AND public.user_has_store_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- 4. Add missing UPDATE policy for trade-in-photos bucket
CREATE POLICY "members update trade-in photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'trade-in-photos'
    AND public.user_has_store_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- 5. Add missing DELETE policy for sale_items
CREATE POLICY sale_items_delete_owner ON public.sale_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND (s.store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid())
             OR public.has_role(auth.uid(), s.store_id, 'gerente'))
    )
  );

-- 6. Revoke EXECUTE on SECURITY DEFINER functions from anon (auth-only utilities)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin_master(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_owner(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_has_store_access(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_store_sellers(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_os_number() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_sale_number() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;
