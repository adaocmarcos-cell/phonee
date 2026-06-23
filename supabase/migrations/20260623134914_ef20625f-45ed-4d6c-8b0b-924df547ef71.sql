
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_neighborhood text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_uf text,
  ADD COLUMN IF NOT EXISTS show_tax_id_on_docs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_legal_name_on_docs boolean NOT NULL DEFAULT true;

-- Storage policies for store-logos bucket
DROP POLICY IF EXISTS "store_logos_public_read" ON storage.objects;
CREATE POLICY "store_logos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'store-logos');

DROP POLICY IF EXISTS "store_logos_member_insert" ON storage.objects;
CREATE POLICY "store_logos_member_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-logos'
    AND public.user_has_store_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "store_logos_member_update" ON storage.objects;
CREATE POLICY "store_logos_member_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND public.user_has_store_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "store_logos_member_delete" ON storage.objects;
CREATE POLICY "store_logos_member_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND public.user_has_store_access(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
