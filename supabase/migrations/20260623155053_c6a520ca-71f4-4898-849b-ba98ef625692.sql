-- Allow any store member (not only owner) to read profiles of other members
DROP POLICY IF EXISTS profiles_select_store_members ON public.profiles;
CREATE POLICY profiles_select_store_members ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur1
    JOIN public.user_roles ur2 ON ur2.store_id = ur1.store_id
    WHERE ur1.user_id = auth.uid()
      AND ur2.user_id = profiles.id
  )
);