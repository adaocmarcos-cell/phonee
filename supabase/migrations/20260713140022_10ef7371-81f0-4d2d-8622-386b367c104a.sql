DROP POLICY "Members update own or managers all" ON public.expenses;
CREATE POLICY "Members update own or managers all" ON public.expenses
FOR UPDATE
USING (is_owner(auth.uid(), store_id) OR has_role(auth.uid(), store_id, 'gerente'::app_role) OR (created_by = auth.uid()))
WITH CHECK (is_owner(auth.uid(), store_id) OR has_role(auth.uid(), store_id, 'gerente'::app_role) OR (created_by = auth.uid()));