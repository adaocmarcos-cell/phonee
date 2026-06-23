
-- Block privilege escalation on user_profile_extras:
-- self-update is allowed only for non-sensitive fields.
-- Owners (is_owner) keep full update access on members of their store.

CREATE OR REPLACE FUNCTION public.tg_user_profile_extras_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_self boolean := (NEW.user_id = auth.uid());
  is_store_owner boolean := (NEW.store_id IS NOT NULL AND public.is_owner(auth.uid(), NEW.store_id));
BEGIN
  -- Owner of the store (or service_role bypassing RLS) may change anything.
  IF is_store_owner THEN
    RETURN NEW;
  END IF;

  -- Self-edit: forbid touching privilege/lockout/status fields.
  IF is_self THEN
    IF NEW.permissions     IS DISTINCT FROM OLD.permissions
    OR NEW.status          IS DISTINCT FROM OLD.status
    OR NEW.allowed_hours   IS DISTINCT FROM OLD.allowed_hours
    OR NEW.job_title       IS DISTINCT FROM OLD.job_title
    OR NEW.locked_until    IS DISTINCT FROM OLD.locked_until
    OR NEW.failed_attempts IS DISTINCT FROM OLD.failed_attempts
    OR NEW.store_id        IS DISTINCT FROM OLD.store_id
    OR NEW.user_id         IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Apenas o dono da loja pode alterar permissões, cargo, status ou horários.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Sem permissão para atualizar esse registro.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS user_profile_extras_guard ON public.user_profile_extras;
CREATE TRIGGER user_profile_extras_guard
BEFORE UPDATE ON public.user_profile_extras
FOR EACH ROW EXECUTE FUNCTION public.tg_user_profile_extras_guard();
