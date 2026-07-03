CREATE OR REPLACE FUNCTION public.tg_stock_inconsistency_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.stock_current < 0 AND (OLD.stock_current IS NULL OR OLD.stock_current >= 0) THEN
    INSERT INTO public.alerts (store_id, type, severity, title, message, link)
    VALUES (
      NEW.store_id,
      'inconsistencia_estoque',
      'danger'::public.alert_severity,
      'Estoque negativo',
      'Item "' || COALESCE(NEW.name, 'sem nome') || '" ficou com estoque negativo (' || NEW.stock_current::text || '). Regularize quando possível.',
      '/painel/estoque/relatorio'
    );
  END IF;
  RETURN NEW;
END
$$;