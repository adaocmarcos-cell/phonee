
-- 1) push_subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subs_own" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX push_subs_user_store_idx ON public.push_subscriptions(user_id, store_id);

-- 2) notification_preferences
CREATE TABLE public.notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  notify_new_sale boolean NOT NULL DEFAULT true,
  notify_low_stock boolean NOT NULL DEFAULT true,
  notify_bill_due boolean NOT NULL DEFAULT true,
  notify_new_service boolean NOT NULL DEFAULT true,
  notify_monthly_report boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_prefs_own" ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER notif_prefs_uat BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) dispatcher helper (via pg_net) - anon key is public
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.dispatch_push_event(_event text, _store_id uuid, _payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://tuvsrkrnoaicgcvnfkpu.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dnNya3Jub2FpY2djdm5ma3B1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTQ2NzUsImV4cCI6MjA5MzE3MDY3NX0.zRvVluT95Ju17tr_6q1NBbZd_UxwnYuqg6LN78973QM"}'::jsonb,
    body := jsonb_build_object('event', _event, 'store_id', _store_id, 'payload', _payload)
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 4) Trigger: nova venda
CREATE OR REPLACE FUNCTION public.tg_push_on_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.dispatch_push_event(
    'new_sale',
    NEW.store_id,
    jsonb_build_object(
      'sale_id', NEW.id,
      'sale_number', NEW.sale_number,
      'total', NEW.total
    )
  );
  RETURN NEW;
END $$;
CREATE TRIGGER push_on_sale
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_push_on_sale();

-- 5) Trigger: estoque baixo (apenas ao cruzar o limite)
CREATE OR REPLACE FUNCTION public.tg_push_on_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stock_min IS NOT NULL
     AND NEW.stock_min > 0
     AND NEW.stock_current <= NEW.stock_min
     AND (OLD.stock_current IS NULL OR OLD.stock_current > NEW.stock_min) THEN
    PERFORM public.dispatch_push_event(
      'low_stock',
      NEW.store_id,
      jsonb_build_object(
        'product_id', NEW.id,
        'name', NEW.name,
        'stock', NEW.stock_current,
        'min', NEW.stock_min
      )
    );
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER push_on_low_stock
  AFTER UPDATE OF stock_current ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_push_on_low_stock();

-- 6) Trigger: nova OS de assistência
CREATE OR REPLACE FUNCTION public.tg_push_on_service_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.dispatch_push_event(
    'new_service',
    NEW.store_id,
    jsonb_build_object(
      'os_id', NEW.id,
      'os_number', NEW.os_number,
      'customer_name', NEW.customer_name
    )
  );
  RETURN NEW;
END $$;
CREATE TRIGGER push_on_service_order
  AFTER INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_push_on_service_order();
