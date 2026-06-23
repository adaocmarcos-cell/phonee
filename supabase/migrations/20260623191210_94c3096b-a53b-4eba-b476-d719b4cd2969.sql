
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'a_pagar',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
