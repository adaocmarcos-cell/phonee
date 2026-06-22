
CREATE TABLE IF NOT EXISTS public.user_profile_extras (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  job_title text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo','suspenso')),
  allowed_hours jsonb,
  last_login_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_profile_extras TO authenticated;
GRANT ALL ON public.user_profile_extras TO service_role;
ALTER TABLE public.user_profile_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extras_select_self_or_owner" ON public.user_profile_extras
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (store_id IS NOT NULL AND public.is_owner(auth.uid(), store_id)));

CREATE POLICY "extras_update_self_or_owner" ON public.user_profile_extras
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (store_id IS NOT NULL AND public.is_owner(auth.uid(), store_id)))
  WITH CHECK (user_id = auth.uid() OR (store_id IS NOT NULL AND public.is_owner(auth.uid(), store_id)));

CREATE POLICY "extras_insert_owner_or_self" ON public.user_profile_extras
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (store_id IS NOT NULL AND public.is_owner(auth.uid(), store_id)));

CREATE TRIGGER set_user_profile_extras_updated_at
  BEFORE UPDATE ON public.user_profile_extras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, role, module, action)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_perm_select_members" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "role_perm_manage_owner" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.is_owner(auth.uid(), store_id))
  WITH CHECK (public.is_owner(auth.uid(), store_id));

CREATE TRIGGER set_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS screen text,
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'success';

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated, anon;

DROP POLICY IF EXISTS "profiles_select_store_members" ON public.profiles;
CREATE POLICY "profiles_select_store_members" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.user_stores us
      JOIN public.user_stores us2 ON us2.store_id = us.store_id
      WHERE us.user_id = auth.uid()
        AND us2.user_id = public.profiles.id
        AND public.is_owner(auth.uid(), us.store_id)
    )
  );

CREATE OR REPLACE FUNCTION public.is_admin_master(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin_master'
  )
$$;
