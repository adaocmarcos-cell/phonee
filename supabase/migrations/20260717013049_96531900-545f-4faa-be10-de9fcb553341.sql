CREATE OR REPLACE FUNCTION public.cancel_trade_in_repair(_trade_in_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ti record;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_ti FROM public.trade_ins WHERE id = _trade_in_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'trade_in not found'; END IF;

  IF NOT public.user_has_store_access(v_uid, v_ti.store_id) THEN
    RAISE EXCEPTION 'sem permissão nesta loja';
  END IF;

  IF v_ti.status <> 'aprovado' THEN
    RAISE EXCEPTION 'só é possível cancelar preparo quando o status é "Aguardando preparo"';
  END IF;

  UPDATE public.trade_ins
    SET status = 'em_avaliacao'
    WHERE id = _trade_in_id;

  INSERT INTO public.audit_log(user_id, store_id, action, entity, entity_id, module, details)
  VALUES (v_uid, v_ti.store_id, 'mudanca_status', 'trade_in', _trade_in_id, 'trade_in',
    jsonb_build_object(
      'status', jsonb_build_object('de', 'aprovado', 'para', 'em_avaliacao'),
      'motivo', COALESCE('Preparo cancelado: ' || NULLIF(_reason,''), 'Preparo cancelado')
    ));

  RETURN _trade_in_id;
END;
$$;