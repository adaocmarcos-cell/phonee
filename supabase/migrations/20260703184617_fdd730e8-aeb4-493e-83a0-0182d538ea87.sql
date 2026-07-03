ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales(customer_id);