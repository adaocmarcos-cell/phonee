
CREATE POLICY "members read trade-in photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'trade-in-photos'
    AND public.user_has_store_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "members upload trade-in photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trade-in-photos'
    AND public.user_has_store_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "members delete trade-in photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'trade-in-photos'
    AND public.user_has_store_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
