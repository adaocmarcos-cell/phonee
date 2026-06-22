
CREATE POLICY "Members read receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND public.user_has_store_access(auth.uid(), (storage.foldername(name))[1]::uuid));
CREATE POLICY "Members upload receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND public.user_has_store_access(auth.uid(), (storage.foldername(name))[1]::uuid));
CREATE POLICY "Members update receipts" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts' AND public.user_has_store_access(auth.uid(), (storage.foldername(name))[1]::uuid));
CREATE POLICY "Members delete receipts" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND public.user_has_store_access(auth.uid(), (storage.foldername(name))[1]::uuid));
