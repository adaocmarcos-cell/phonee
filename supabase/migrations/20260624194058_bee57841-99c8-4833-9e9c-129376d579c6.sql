-- Remove the permissive "with check (true)" INSERT policy on
-- support_ticket_status_history. Inserts already happen via the
-- SECURITY DEFINER trigger tg_support_ticket_status_change (function owner
-- bypasses RLS), so no client-facing INSERT policy is needed.
DROP POLICY IF EXISTS "system inserts status history"
  ON public.support_ticket_status_history;

-- Make sure the trigger's owner can still bypass RLS for inserts.
GRANT INSERT ON public.support_ticket_status_history TO service_role;