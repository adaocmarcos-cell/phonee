
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pago',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON public.sales (store_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_due_date ON public.sales (store_id, due_date);
