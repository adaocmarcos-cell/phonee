
-- Restringir policies do role 'public' para 'authenticated' + reforçar sale_payments DELETE com verificação de acesso à loja

-- expenses UPDATE
DROP POLICY IF EXISTS "Members update own or managers all" ON public.expenses;
CREATE POLICY "Members update own or managers all"
ON public.expenses
FOR UPDATE
TO authenticated
USING (is_owner(auth.uid(), store_id) OR has_role(auth.uid(), store_id, 'gerente'::app_role) OR (created_by = auth.uid()))
WITH CHECK (is_owner(auth.uid(), store_id) OR has_role(auth.uid(), store_id, 'gerente'::app_role) OR (created_by = auth.uid()));

-- push_subscriptions
DROP POLICY IF EXISTS push_subs_own ON public.push_subscriptions;
CREATE POLICY push_subs_own
ON public.push_subscriptions
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- notification_preferences
DROP POLICY IF EXISTS notif_prefs_own ON public.notification_preferences;
CREATE POLICY notif_prefs_own
ON public.notification_preferences
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- support_ticket_status_history SELECT
DROP POLICY IF EXISTS "owner or admin read status history" ON public.support_ticket_status_history;
CREATE POLICY "owner or admin read status history"
ON public.support_ticket_status_history
FOR SELECT
TO authenticated
USING (
  is_admin_master(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_ticket_status_history.ticket_id
      AND t.user_id = auth.uid()
  )
);

-- sale_payments DELETE: exigir também acesso à loja (defense-in-depth)
DROP POLICY IF EXISTS sale_payments_delete_perm ON public.sale_payments;
CREATE POLICY sale_payments_delete_perm
ON public.sale_payments
FOR DELETE
TO authenticated
USING (
  user_has_store_access(auth.uid(), store_id)
  AND has_permission(auth.uid(), store_id, 'vendas'::text, 'excluir'::text)
);
