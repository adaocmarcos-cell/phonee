-- 1) Update finish_trade_in_repair to include manual_notes in audit details
CREATE OR REPLACE FUNCTION public.finish_trade_in_repair(_trade_in_id uuid, _parts jsonb DEFAULT '[]'::jsonb, _manual_cost numeric DEFAULT 0, _manual_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ti record;
  v_uid uuid := auth.uid();
  v_store uuid;
  v_part jsonb;
  v_part_id uuid;
  v_qty numeric;
  v_unit_cost numeric;
  v_available int;
  v_name text;
  v_parts_cost numeric := 0;
  v_total_cost numeric;
  v_repair_snapshot jsonb := '[]'::jsonb;
  v_de text;
BEGIN
  SELECT * INTO v_ti FROM public.trade_ins WHERE id = _trade_in_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'trade_in not found'; END IF;
  v_store := v_ti.store_id;
  v_de := v_ti.status;

  IF NOT public.user_has_store_access(v_uid, v_store) THEN
    RAISE EXCEPTION 'sem permissão nesta loja';
  END IF;

  -- Idempotência: se já está em estoque, não reprocessa (evita duplicar repair_costs em retries)
  IF v_ti.status = 'em_estoque' THEN
    RETURN _trade_in_id;
  END IF;

  IF _parts IS NOT NULL AND jsonb_array_length(_parts) > 0 THEN
    FOR v_part IN SELECT * FROM jsonb_array_elements(_parts) LOOP
      v_part_id  := NULLIF(v_part->>'part_id','')::uuid;
      v_qty      := COALESCE((v_part->>'qty')::numeric, 0);
      v_unit_cost:= COALESCE((v_part->>'unit_cost')::numeric, 0);
      v_name     := COALESCE(v_part->>'name','');
      IF v_qty <= 0 THEN CONTINUE; END IF;

      IF v_part_id IS NOT NULL THEN
        SELECT stock_current, name, cost_price INTO v_available, v_name, v_unit_cost
        FROM public.parts_inventory
        WHERE id = v_part_id AND store_id = v_store
        FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Peça % não encontrada nesta loja', v_part_id;
        END IF;
        IF v_available < v_qty THEN
          RAISE EXCEPTION 'Estoque insuficiente da peça "%": disponível % / necessário %', v_name, v_available, v_qty;
        END IF;
        UPDATE public.parts_inventory
          SET stock_current = stock_current - v_qty
          WHERE id = v_part_id;
      END IF;

      v_parts_cost := v_parts_cost + (v_qty * COALESCE(v_unit_cost,0));
      v_repair_snapshot := v_repair_snapshot || jsonb_build_object(
        'part_id', v_part_id,
        'name', v_name,
        'qty', v_qty,
        'unit_cost', v_unit_cost,
        'source', CASE WHEN v_part_id IS NOT NULL THEN 'estoque' ELSE 'externo' END
      );
    END LOOP;
  END IF;

  v_total_cost := v_parts_cost + COALESCE(_manual_cost,0);

  UPDATE public.trade_ins
    SET status = 'em_estoque',
        repair_parts = v_repair_snapshot,
        repair_costs = v_total_cost,
        notes = CASE WHEN _manual_notes IS NOT NULL AND length(_manual_notes) > 0
                     THEN COALESCE(notes,'') || CASE WHEN notes IS NULL OR notes='' THEN '' ELSE E'\n' END || '[preparo] ' || _manual_notes
                     ELSE notes END
    WHERE id = _trade_in_id;

  INSERT INTO public.audit_log(user_id, store_id, action, entity, entity_id, module, details)
  VALUES (v_uid, v_store, 'mudanca_status', 'trade_in', _trade_in_id, 'trade_in',
          jsonb_build_object(
            'status', jsonb_build_object('de', v_de, 'para', 'em_estoque'),
            'motivo', 'Preparo concluído',
            'parts_cost', v_parts_cost,
            'manual_cost', COALESCE(_manual_cost,0),
            'total_cost', v_total_cost,
            'notas_preparo', _manual_notes,
            'parts', v_repair_snapshot
          ));

  RETURN _trade_in_id;
END;
$function$;

-- 2) Trigger: automatic alerts on trade_in status transitions
CREATE OR REPLACE FUNCTION public.tg_trade_in_status_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link text;
  v_label text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_link := '/painel/troca/' || NEW.id::text || '/detalhes';
    v_label := COALESCE(NEW.brand,'') || ' ' || COALESCE(NEW.model,'');

    IF NEW.status = 'aprovado' THEN
      INSERT INTO public.alerts(store_id, type, severity, title, message, link)
      VALUES (
        NEW.store_id,
        'trade_in_awaiting_repair',
        'warning',
        'Aparelho aguardando preparo: ' || trim(v_label),
        'Entrada de ' || COALESCE(NEW.customer_name,'cliente') || ' aguarda reparo/preparação para entrar no estoque.',
        v_link
      );
    ELSIF NEW.status = 'em_estoque' AND OLD.status = 'aprovado' THEN
      INSERT INTO public.alerts(store_id, type, severity, title, message, link)
      VALUES (
        NEW.store_id,
        'trade_in_ready',
        'info',
        'Preparo concluído: ' || trim(v_label),
        'Aparelho pronto e disponível no estoque.',
        v_link
      );
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'aprovado' THEN
    v_link := '/painel/troca/' || NEW.id::text || '/detalhes';
    v_label := COALESCE(NEW.brand,'') || ' ' || COALESCE(NEW.model,'');
    INSERT INTO public.alerts(store_id, type, severity, title, message, link)
    VALUES (
      NEW.store_id,
      'trade_in_awaiting_repair',
      'warning',
      'Aparelho aguardando preparo: ' || trim(v_label),
      'Entrada de ' || COALESCE(NEW.customer_name,'cliente') || ' aguarda reparo/preparação para entrar no estoque.',
      v_link
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trade_in_status_alert ON public.trade_ins;
CREATE TRIGGER trade_in_status_alert
AFTER INSERT OR UPDATE OF status ON public.trade_ins
FOR EACH ROW EXECUTE FUNCTION public.tg_trade_in_status_alert();