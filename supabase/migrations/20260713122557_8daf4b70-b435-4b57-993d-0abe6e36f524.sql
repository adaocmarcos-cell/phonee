
-- Harden audit_log INSERT: bind user_id to auth.uid()
DROP POLICY IF EXISTS audit_insert_member ON public.audit_log;
CREATE POLICY audit_insert_member ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_store_access(auth.uid(), store_id)
    AND user_id = auth.uid()
  );

-- Replace overly permissive public lead submission policy
DROP POLICY IF EXISTS "Public can submit leads" ON public.leads;
CREATE POLICY "Public can submit leads" ON public.leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    nome IS NOT NULL AND length(btrim(nome)) BETWEEN 1 AND 200
    AND whatsapp IS NOT NULL AND length(btrim(whatsapp)) BETWEEN 8 AND 30
    AND status = 'novo'
  );
