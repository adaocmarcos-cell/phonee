
CREATE TYPE public.stock_adjustment_status AS ENUM ('pendente','aprovado','rejeitado');

ALTER TABLE public.stock_adjustments
  ADD COLUMN approval_status public.stock_adjustment_status NOT NULL DEFAULT 'pendente',
  ADD COLUMN reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_note text;

-- Trigger: write each adjustment to audit_log
CREATE OR REPLACE FUNCTION public.tg_stock_adjustment_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (
    store_id, user_id, module, action, entity, entity_id, details, status
  ) VALUES (
    NEW.store_id, NEW.user_id, 'estoque',
    CASE WHEN NEW.qty_change >= 0 THEN 'ajuste_entrada' ELSE 'ajuste_saida' END,
    NEW.item_kind::text, COALESCE(NEW.product_id, NEW.part_id),
    jsonb_build_object(
      'item_name', NEW.item_name,
      'qty_change', NEW.qty_change,
      'prev_stock', NEW.prev_stock,
      'new_stock', NEW.new_stock,
      'reason', NEW.reason,
      'justification', NEW.justification
    ),
    'pendente'
  );
  RETURN NEW;
END $$;

CREATE TRIGGER trg_stock_adjustment_audit
AFTER INSERT ON public.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION public.tg_stock_adjustment_audit();

-- Trigger: detect negative stock on products and create an alert
CREATE OR REPLACE FUNCTION public.tg_stock_inconsistency_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stock_current < 0 AND (OLD.stock_current IS NULL OR OLD.stock_current >= 0) THEN
    INSERT INTO public.alerts (store_id, type, severity, title, message, link)
    VALUES (
      NEW.store_id,
      'inconsistencia_estoque',
      'critica',
      'Inconsistência no estoque',
      'Item "' || COALESCE(NEW.name, 'sem nome') || '" ficou com estoque negativo (' || NEW.stock_current::text || '). Ajuste imediatamente.',
      '/app/estoque/relatorio'
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_products_stock_inconsistency
AFTER UPDATE OF stock_current ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_stock_inconsistency_alert();

CREATE TRIGGER trg_parts_stock_inconsistency
AFTER UPDATE OF stock_current ON public.parts_inventory
FOR EACH ROW EXECUTE FUNCTION public.tg_stock_inconsistency_alert();

-- Allow managers (and dono) to view full audit_log; keep insert by store members
DROP POLICY IF EXISTS audit_select_owner ON public.audit_log;
CREATE POLICY audit_select_managers
  ON public.audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), store_id, 'dono'::public.app_role)
    OR public.has_role(auth.uid(), store_id, 'gerente'::public.app_role)
    OR public.is_admin_master(auth.uid())
  );
