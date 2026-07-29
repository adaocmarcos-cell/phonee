
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS data_health_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS data_health_deadline_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS data_health_deadline_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_health_done_at timestamptz;

ALTER TABLE public.user_profile_extras
  ADD COLUMN IF NOT EXISTS data_health_modal_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.store_data_health(_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_sem_imei int := 0;
  v_multi int := 0;
  v_pend int := 0;
  v_started timestamptz;
  v_days int;
  v_done timestamptz;
  v_left int;
BEGIN
  IF _store_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT (public.is_admin_master(auth.uid()) OR EXISTS (SELECT 1 FROM public.my_stores() s WHERE s = _store_id)) THEN
    RAISE EXCEPTION 'Sem permissão para esta loja';
  END IF;

  SELECT s.data_health_started_at, s.data_health_deadline_days, s.data_health_done_at
    INTO v_started, v_days, v_done
  FROM public.stores s WHERE s.id = _store_id;

  SELECT
    count(*) FILTER (WHERE p.item_kind = 'aparelho'),
    count(*) FILTER (WHERE p.item_kind = 'aparelho' AND coalesce(nullif(btrim(p.imei), ''), NULL) IS NULL),
    count(*) FILTER (WHERE p.item_kind = 'aparelho' AND coalesce(p.stock_current, 0) > 1),
    count(*) FILTER (WHERE p.item_kind = 'aparelho' AND (coalesce(nullif(btrim(p.imei), ''), NULL) IS NULL OR coalesce(p.stock_current, 0) > 1))
  INTO v_total, v_sem_imei, v_multi, v_pend
  FROM public.products p
  WHERE p.store_id = _store_id
    AND coalesce(p.stock_current, 0) > 0;

  v_left := GREATEST(0, v_days - (EXTRACT(EPOCH FROM (now() - coalesce(v_started, now()))) / 86400)::int);

  RETURN jsonb_build_object(
    'store_id', _store_id,
    'aparelhos_total', v_total,
    'aparelhos_sem_imei', v_sem_imei,
    'seminovos_multi_unidade', v_multi,
    'pendentes_total', v_pend,
    'regularizados', GREATEST(0, v_total - v_pend),
    'pct_completo', CASE WHEN v_total = 0 THEN 100 ELSE round(((v_total - v_pend)::numeric / v_total) * 100, 0) END,
    'prazo_em_dias', v_days,
    'dias_restantes', v_left,
    'vencido', (v_left <= 0 AND v_pend > 0),
    'iniciado_em', v_started,
    'concluido_em', v_done
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_data_health(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_data_health_alert(_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h jsonb;
  v_pend int;
  v_id uuid;
  v_sev alert_severity;
  v_left int;
BEGIN
  h := public.store_data_health(_store_id);
  IF h IS NULL THEN RETURN NULL; END IF;
  v_pend := (h->>'pendentes_total')::int;
  v_left := (h->>'dias_restantes')::int;

  SELECT id INTO v_id FROM public.alerts
   WHERE store_id = _store_id AND type = 'data_health_imei'
   ORDER BY created_at DESC LIMIT 1;

  IF v_pend = 0 THEN
    UPDATE public.stores SET data_health_done_at = coalesce(data_health_done_at, now()) WHERE id = _store_id;
    IF v_id IS NOT NULL THEN
      UPDATE public.alerts
         SET status = 'resolvido', resolved_at = coalesce(resolved_at, now()), is_read = true
       WHERE id = v_id AND resolved_at IS NULL;
    END IF;
    RETURN h;
  END IF;

  v_sev := CASE WHEN v_left <= 5 THEN 'danger'::alert_severity
                WHEN v_left <= 15 THEN 'warning'::alert_severity
                ELSE 'info'::alert_severity END;

  IF v_id IS NULL THEN
    INSERT INTO public.alerts (store_id, type, severity, title, message, link, status, metadata)
    VALUES (_store_id, 'data_health_imei', v_sev,
            'Aparelhos sem IMEI cadastrado',
            v_pend || ' aparelho(s) precisam de IMEI. Prazo: ' || v_left || ' dia(s).',
            '/painel/estoque/aparelhos/regularizar', 'aberto', h);
  ELSE
    UPDATE public.alerts
       SET severity = v_sev,
           message = v_pend || ' aparelho(s) precisam de IMEI. Prazo: ' || v_left || ' dia(s).',
           metadata = h,
           link = '/painel/estoque/aparelhos/regularizar',
           status = CASE WHEN status = 'resolvido' THEN 'aberto' ELSE status END,
           resolved_at = NULL
     WHERE id = v_id;
  END IF;

  RETURN h;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_data_health_alert(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_data_health_modal_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_profile_extras
     SET data_health_modal_seen_at = coalesce(data_health_modal_seen_at, now())
   WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.mark_data_health_modal_seen() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_data_health_modal_seen()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(bool_or(data_health_modal_seen_at IS NOT NULL), false)
    FROM public.user_profile_extras WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_data_health_modal_seen() TO authenticated;

CREATE OR REPLACE FUNCTION public.phonee_data_health_overview()
RETURNS TABLE (
  store_id uuid,
  store_name text,
  aparelhos_total int,
  pendentes_total int,
  pct_completo numeric,
  dias_restantes int,
  prazo_em_dias int,
  prazo_personalizado boolean,
  modal_visto boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;
  RETURN QUERY
  WITH agg AS (
    SELECT p.store_id AS sid,
           count(*) FILTER (WHERE p.item_kind = 'aparelho')::int AS total,
           count(*) FILTER (WHERE p.item_kind = 'aparelho' AND (nullif(btrim(p.imei), '') IS NULL OR coalesce(p.stock_current,0) > 1))::int AS pend
      FROM public.products p
     WHERE coalesce(p.stock_current, 0) > 0
     GROUP BY p.store_id
  )
  SELECT s.id,
         s.name,
         coalesce(a.total, 0),
         coalesce(a.pend, 0),
         CASE WHEN coalesce(a.total,0) = 0 THEN 100::numeric
              ELSE round(((a.total - a.pend)::numeric / a.total) * 100, 0) END,
         GREATEST(0, s.data_health_deadline_days - (EXTRACT(EPOCH FROM (now() - s.data_health_started_at)) / 86400)::int),
         s.data_health_deadline_days,
         s.data_health_deadline_custom,
         EXISTS (SELECT 1 FROM public.user_profile_extras u
                  WHERE u.store_id = s.id AND u.data_health_modal_seen_at IS NOT NULL)
    FROM public.stores s
    LEFT JOIN agg a ON a.sid = s.id
   ORDER BY coalesce(a.pend, 0) DESC, coalesce(a.total, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.phonee_data_health_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.phonee_set_data_health_deadline(_store_id uuid, _days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito';
  END IF;
  IF _days IS NULL OR _days < 1 OR _days > 365 THEN
    RAISE EXCEPTION 'Prazo inválido';
  END IF;

  IF _store_id IS NULL THEN
    UPDATE public.stores
       SET data_health_deadline_days = _days
     WHERE data_health_deadline_custom = false;
  ELSE
    UPDATE public.stores
       SET data_health_deadline_days = _days,
           data_health_deadline_custom = true
     WHERE id = _store_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.phonee_set_data_health_deadline(uuid, integer) TO authenticated;
