ALTER TABLE public.stores ALTER COLUMN allow_negative_stock SET DEFAULT true;
UPDATE public.stores SET allow_negative_stock = true WHERE allow_negative_stock IS NOT TRUE;