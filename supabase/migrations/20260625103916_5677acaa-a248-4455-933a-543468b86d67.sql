
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.support_ticket_messages ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Storage policies for support-attachments (private bucket).
-- Path convention: {auth.uid()}/{ticket_id_or_tmp}/{filename}

DROP POLICY IF EXISTS "support_attachments_owner_read" ON storage.objects;
CREATE POLICY "support_attachments_owner_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin_master(auth.uid()))
);

DROP POLICY IF EXISTS "support_attachments_owner_insert" ON storage.objects;
CREATE POLICY "support_attachments_owner_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "support_attachments_owner_delete" ON storage.objects;
CREATE POLICY "support_attachments_owner_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin_master(auth.uid()))
);
