ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS price_table_note text;