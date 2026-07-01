
-- Fix 1: Restrict profiles visibility so coworkers can no longer read each other's
-- pix_key/pix_type/phone/email. Only store OWNERS can see profiles of their members;
-- everyone else only sees their own profile.
DROP POLICY IF EXISTS profiles_select_store_members ON public.profiles;

CREATE POLICY profiles_select_store_owner
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = public.profiles.id
      AND public.is_owner(auth.uid(), ur.store_id)
  )
);

-- Fix 2: Prevent privilege escalation on INSERT into user_profile_extras.
-- Extend the guard trigger to also run BEFORE INSERT: non-owner self-inserts
-- are forced to safe defaults for privileged fields.
CREATE OR REPLACE FUNCTION public.tg_user_profile_extras_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_self boolean := (NEW.user_id = auth.uid());
  is_store_owner boolean := (NEW.store_id IS NOT NULL AND public.is_owner(auth.uid(), NEW.store_id));
BEGIN
  IF is_store_owner THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF is_self THEN
      -- Force privileged fields to safe defaults; only the store owner may set them.
      NEW.permissions     := '{}'::jsonb;
      NEW.status          := 'ativo';
      NEW.allowed_hours   := NULL;
      NEW.job_title       := NULL;
      NEW.locked_until    := NULL;
      NEW.failed_attempts := 0;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Sem permissão para criar esse registro.' USING ERRCODE = '42501';
  END IF;

  -- UPDATE path
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
$function$;

DROP TRIGGER IF EXISTS user_profile_extras_guard ON public.user_profile_extras;
CREATE TRIGGER user_profile_extras_guard
BEFORE INSERT OR UPDATE ON public.user_profile_extras
FOR EACH ROW EXECUTE FUNCTION public.tg_user_profile_extras_guard();
