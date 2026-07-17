
-- 1) Stalled-days config per store
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS os_stalled_days integer NOT NULL DEFAULT 3;

-- 2) History table
CREATE TABLE IF NOT EXISTS public.os_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  from_status os_status,
  to_status os_status,
  from_custom_status_id uuid,
  to_custom_status_id uuid,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS os_status_history_os_idx ON public.os_status_history(os_id, changed_at);
CREATE INDEX IF NOT EXISTS os_status_history_store_idx ON public.os_status_history(store_id, changed_at);

GRANT SELECT ON public.os_status_history TO authenticated;
GRANT ALL ON public.os_status_history TO service_role;

ALTER TABLE public.os_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "os_history_read_by_store" ON public.os_status_history;
CREATE POLICY "os_history_read_by_store" ON public.os_status_history
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

DROP POLICY IF EXISTS "os_history_service_write" ON public.os_status_history;
CREATE POLICY "os_history_service_write" ON public.os_status_history
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

-- 3) Trigger: log status changes
CREATE OR REPLACE FUNCTION public.tg_service_orders_log_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.os_status_history(os_id, store_id, from_status, to_status, changed_by, changed_at)
    VALUES (NEW.id, NEW.store_id, NULL, NEW.status, NEW.created_by, NEW.created_at);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.os_status_history(os_id, store_id, from_status, to_status, changed_by, changed_at)
    VALUES (NEW.id, NEW.store_id, OLD.status, NEW.status, auth.uid(), now());
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_service_orders_log_status ON public.service_orders;
CREATE TRIGGER trg_service_orders_log_status
AFTER INSERT OR UPDATE OF status ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_service_orders_log_status();

-- 4) Backfill: one initial record per existing OS
INSERT INTO public.os_status_history (os_id, store_id, from_status, to_status, changed_by, changed_at)
SELECT so.id, so.store_id, NULL, so.status, so.created_by, so.created_at
FROM public.service_orders so
WHERE NOT EXISTS (SELECT 1 FROM public.os_status_history h WHERE h.os_id = so.id);
