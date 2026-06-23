
ALTER TABLE public.user_roles ALTER COLUMN store_id DROP NOT NULL;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_store_required_for_non_master
  CHECK (role = 'admin_master' OR store_id IS NOT NULL) NOT VALID;

ALTER TABLE public.user_roles VALIDATE CONSTRAINT user_roles_store_required_for_non_master;
