
-- Track financial entry expense id (to avoid duplicates) and provide audit trigger
ALTER TABLE public.trade_ins ADD COLUMN IF NOT EXISTS entry_expense_id uuid;

-- Trigger: log every insert/update of trade_ins into audit_log
CREATE OR REPLACE FUNCTION public.tg_trade_in_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_action text;
  v_user uuid := auth.uid();
  k text;
  watched text[] := ARRAY['status','entry_value','repair_costs','intended_sale_value','condition','model','brand','imei','notes','scrap_for_parts','product_id'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'criacao';
    v_changes := jsonb_build_object(
      'status', NEW.status,
      'entry_value', NEW.entry_value,
      'intended_sale_value', NEW.intended_sale_value,
      'model', NEW.model
    );
  ELSE
    v_action := 'edicao';
    FOREACH k IN ARRAY watched LOOP
      IF to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k THEN
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('de', to_jsonb(OLD)->k, 'para', to_jsonb(NEW)->k));
      END IF;
    END LOOP;
    IF v_changes = '{}'::jsonb THEN RETURN NEW; END IF;
    IF (NEW.status IS DISTINCT FROM OLD.status) THEN v_action := 'mudanca_status'; END IF;
  END IF;

  INSERT INTO public.audit_log (store_id, user_id, module, action, entity, entity_id, details, status)
  VALUES (NEW.store_id, COALESCE(v_user, NEW.created_by), 'compra_troca', v_action, 'trade_in', NEW.id, v_changes, 'ok');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trade_in_audit ON public.trade_ins;
CREATE TRIGGER trg_trade_in_audit
AFTER INSERT OR UPDATE ON public.trade_ins
FOR EACH ROW EXECUTE FUNCTION public.tg_trade_in_audit();
