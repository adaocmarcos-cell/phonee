
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_number INTEGER;

CREATE OR REPLACE FUNCTION public.assign_sale_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sale_number IS NULL THEN
    SELECT COALESCE(MAX(sale_number), 0) + 1 INTO NEW.sale_number
    FROM public.sales WHERE store_id = NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_sale_number ON public.sales;
CREATE TRIGGER trg_assign_sale_number
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.assign_sale_number();

-- Backfill existing sales
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at) AS rn
  FROM public.sales WHERE sale_number IS NULL
)
UPDATE public.sales s SET sale_number = o.rn FROM ordered o WHERE s.id = o.id;

CREATE UNIQUE INDEX IF NOT EXISTS sales_store_number_uidx ON public.sales(store_id, sale_number);
