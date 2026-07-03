
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS imei_serial text,
  ADD COLUMN IF NOT EXISTS warranty_days integer,
  ADD COLUMN IF NOT EXISTS public_notes text;

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
