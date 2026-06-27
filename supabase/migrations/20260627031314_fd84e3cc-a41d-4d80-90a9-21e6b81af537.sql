
-- 1. Table for admin master permissions
CREATE TABLE IF NOT EXISTS public.admin_master_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_super boolean NOT NULL DEFAULT false,
  permissions text[] NOT NULL DEFAULT '{}',
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

GRANT SELECT ON public.admin_master_profile TO authenticated;
GRANT ALL ON public.admin_master_profile TO service_role;
ALTER TABLE public.admin_master_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS amp_select_masters ON public.admin_master_profile;
CREATE POLICY amp_select_masters ON public.admin_master_profile
  FOR SELECT TO authenticated
  USING (public.is_admin_master(auth.uid()));

-- No INSERT/UPDATE/DELETE policy: all mutations go through SECURITY DEFINER RPCs below.

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS trg_amp_updated_at ON public.admin_master_profile;
CREATE TRIGGER trg_amp_updated_at BEFORE UPDATE ON public.admin_master_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Bootstrap: existing admin masters become super with all permissions
INSERT INTO public.admin_master_profile (user_id, is_super, permissions, granted_by, notes)
SELECT ur.user_id, true,
       ARRAY['manage_admins','change_plans','manage_users','manage_partners','manage_coupons','manage_subscriptions','view_financial','view_audit','manage_marketing'],
       ur.user_id,
       'Bootstrap'
FROM public.user_roles ur
WHERE ur.role = 'admin_master'
ON CONFLICT (user_id) DO NOTHING;

-- 3. Helper: check if a user has a specific admin permission
CREATE OR REPLACE FUNCTION public.admin_has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_master_profile amp
    JOIN public.user_roles ur ON ur.user_id = amp.user_id AND ur.role = 'admin_master'
    WHERE amp.user_id = _user_id
      AND (amp.is_super OR _perm = ANY (amp.permissions))
  );
$$;
REVOKE EXECUTE ON FUNCTION public.admin_has_permission(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_has_permission(uuid,text) TO authenticated;

-- 4. List admins master (admin only)
CREATE OR REPLACE FUNCTION public.admin_list_masters()
RETURNS TABLE(
  user_id uuid, email text, full_name text, is_super boolean,
  permissions text[], granted_by uuid, granted_by_email text,
  granted_at timestamptz, updated_at timestamptz, notes text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT amp.user_id, p.email, p.full_name, amp.is_super, amp.permissions,
         amp.granted_by, gp.email, amp.granted_at, amp.updated_at, amp.notes
  FROM public.admin_master_profile amp
  LEFT JOIN public.profiles p  ON p.id = amp.user_id
  LEFT JOIN public.profiles gp ON gp.id = amp.granted_by
  WHERE public.is_admin_master(auth.uid())
  ORDER BY amp.is_super DESC, amp.granted_at ASC;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_masters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_masters() TO authenticated;

-- 5. Grant admin master role
CREATE OR REPLACE FUNCTION public.admin_grant_master(
  _email text, _permissions text[], _reason text DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_target uuid; v_actor uuid := auth.uid();
BEGIN
  IF NOT public.admin_has_permission(v_actor, 'manage_admins') THEN
    RAISE EXCEPTION 'forbidden: requires manage_admins' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason required (min 5 chars)';
  END IF;

  SELECT id INTO v_target FROM public.profiles WHERE lower(email) = lower(trim(_email));
  IF v_target IS NULL THEN RAISE EXCEPTION 'user with email % not found', _email; END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_target, 'admin_master')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_master_profile (user_id, is_super, permissions, granted_by, notes)
  VALUES (v_target, false, COALESCE(_permissions, '{}'), v_actor, _notes)
  ON CONFLICT (user_id) DO UPDATE
    SET permissions = EXCLUDED.permissions,
        granted_by  = EXCLUDED.granted_by,
        notes       = COALESCE(EXCLUDED.notes, public.admin_master_profile.notes),
        updated_at  = now();

  INSERT INTO public.audit_log (user_id, module, action, entity, entity_id, details, status)
  VALUES (v_actor, 'admin_master', 'grant_master', 'admin_master_profile', v_target,
          jsonb_build_object('email', _email, 'permissions', _permissions, 'reason', _reason, 'notes', _notes),
          'ok');

  RETURN jsonb_build_object('ok', true, 'user_id', v_target);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_grant_master(text,text[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_master(text,text[],text,text) TO authenticated;

-- 6. Revoke admin master role
CREATE OR REPLACE FUNCTION public.admin_revoke_master(_user_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_is_super boolean;
BEGIN
  IF NOT public.admin_has_permission(v_actor, 'manage_admins') THEN
    RAISE EXCEPTION 'forbidden: requires manage_admins' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason required (min 5 chars)';
  END IF;
  IF _user_id = v_actor THEN
    RAISE EXCEPTION 'cannot revoke yourself';
  END IF;

  SELECT is_super INTO v_is_super FROM public.admin_master_profile WHERE user_id = _user_id;
  IF v_is_super THEN
    RAISE EXCEPTION 'super admin cannot be revoked';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'admin_master';
  DELETE FROM public.admin_master_profile WHERE user_id = _user_id;

  INSERT INTO public.audit_log (user_id, module, action, entity, entity_id, details, status)
  VALUES (v_actor, 'admin_master', 'revoke_master', 'admin_master_profile', _user_id,
          jsonb_build_object('reason', _reason), 'ok');

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_master(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_master(uuid,text) TO authenticated;

-- 7. Update permissions
CREATE OR REPLACE FUNCTION public.admin_update_master_permissions(
  _user_id uuid, _permissions text[], _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_is_super boolean; v_old text[];
BEGIN
  IF NOT public.admin_has_permission(v_actor, 'manage_admins') THEN
    RAISE EXCEPTION 'forbidden: requires manage_admins' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'reason required (min 5 chars)';
  END IF;

  SELECT is_super, permissions INTO v_is_super, v_old
    FROM public.admin_master_profile WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin profile not found'; END IF;
  IF v_is_super AND _user_id <> v_actor THEN
    RAISE EXCEPTION 'cannot edit permissions of super admin';
  END IF;

  UPDATE public.admin_master_profile
     SET permissions = COALESCE(_permissions, '{}'), updated_at = now()
   WHERE user_id = _user_id;

  INSERT INTO public.audit_log (user_id, module, action, entity, entity_id, details, status, old_value, new_value)
  VALUES (v_actor, 'admin_master', 'update_permissions', 'admin_master_profile', _user_id,
          jsonb_build_object('reason', _reason),
          'ok',
          jsonb_build_object('permissions', v_old),
          jsonb_build_object('permissions', _permissions));

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_update_master_permissions(uuid,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_master_permissions(uuid,text[],text) TO authenticated;

-- 8. Tighten admin_change_user_plan: now requires 'change_plans' permission
CREATE OR REPLACE FUNCTION public.admin_change_user_plan(
  _subscription_id uuid,
  _new_plan_id uuid,
  _new_expires_at timestamptz DEFAULT NULL,
  _new_status text DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.plans%ROWTYPE;
BEGIN
  IF NOT public.admin_has_permission(auth.uid(), 'change_plans') THEN
    RAISE EXCEPTION 'forbidden: requires change_plans permission' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription not found'; END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = _new_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan not found'; END IF;

  PERFORM set_config('app.change_reason', COALESCE(_reason, 'Alteração direta pelo admin master'), true);

  UPDATE public.subscriptions
     SET plan_id      = v_plan.id,
         amount_cents = v_plan.price_cents,
         expires_at   = COALESCE(_new_expires_at, expires_at),
         status       = COALESCE(_new_status, status),
         updated_at   = now()
   WHERE id = v_sub.id;

  RETURN jsonb_build_object('ok', true, 'subscription_id', v_sub.id, 'plan', v_plan.name);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_change_user_plan(uuid,uuid,timestamptz,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_user_plan(uuid,uuid,timestamptz,text,text) TO authenticated;
