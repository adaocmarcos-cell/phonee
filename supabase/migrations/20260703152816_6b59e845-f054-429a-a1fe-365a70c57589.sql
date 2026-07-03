
ALTER TABLE public.sale_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS is_service boolean NOT NULL DEFAULT false;
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_product_or_service_chk
  CHECK (product_id IS NOT NULL OR is_service = true);
