CREATE OR REPLACE FUNCTION public.get_store_sellers(_store_id uuid)
RETURNS TABLE (user_id uuid, full_name text, email text, role public.app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (ur.user_id)
    ur.user_id,
    COALESCE(NULLIF(p.full_name, ''), p.email, 'Sem nome') AS full_name,
    p.email,
    ur.role
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.store_id = _store_id
    AND ur.role IN ('vendedor','gerente','dono')
    AND public.user_has_store_access(auth.uid(), _store_id)
  ORDER BY ur.user_id, ur.role;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_sellers(uuid) TO authenticated;