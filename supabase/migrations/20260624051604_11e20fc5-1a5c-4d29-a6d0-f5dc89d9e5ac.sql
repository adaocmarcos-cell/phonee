
-- Extend support ticket status workflow
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'em_andamento';
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'aguardando_cliente';
ALTER TYPE public.support_ticket_status ADD VALUE IF NOT EXISTS 'fechado';

-- Status history table
CREATE TABLE IF NOT EXISTS public.support_ticket_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  from_status public.support_ticket_status,
  to_status public.support_ticket_status NOT NULL,
  changed_by uuid,
  changed_by_is_admin boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_ticket_status_history TO authenticated;
GRANT ALL ON public.support_ticket_status_history TO service_role;

ALTER TABLE public.support_ticket_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner or admin read status history"
  ON public.support_ticket_status_history FOR SELECT
  USING (
    public.is_admin_master(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "system inserts status history"
  ON public.support_ticket_status_history FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_support_ticket_status_history_ticket
  ON public.support_ticket_status_history(ticket_id, created_at DESC);

-- Trigger to record status changes automatically
CREATE OR REPLACE FUNCTION public.tg_support_ticket_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.support_ticket_status_history (ticket_id, from_status, to_status, changed_by, changed_by_is_admin)
    VALUES (NEW.id, NULL, NEW.status, COALESCE(auth.uid(), NEW.user_id), public.is_admin_master(auth.uid()));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.support_ticket_status_history (ticket_id, from_status, to_status, changed_by, changed_by_is_admin)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), public.is_admin_master(auth.uid()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_support_ticket_status_change ON public.support_tickets;
CREATE TRIGGER tg_support_ticket_status_change
AFTER INSERT OR UPDATE OF status ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_support_ticket_status_change();
