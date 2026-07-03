-- Numeração automática, sequencial e à prova de concorrência para vendas por loja.
CREATE OR REPLACE FUNCTION public.tg_sales_autonumber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sale_number IS NULL THEN
    -- Trava por loja para garantir sequência única mesmo com múltiplos usuários simultâneos.
    PERFORM pg_advisory_xact_lock(hashtextextended('sales_number:' || NEW.store_id::text, 0));
    SELECT COALESCE(MAX(sale_number), 0) + 1
      INTO NEW.sale_number
      FROM public.sales
     WHERE store_id = NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_sales_autonumber ON public.sales;
CREATE TRIGGER tg_sales_autonumber
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.tg_sales_autonumber();

-- Índice para consulta rápida por loja/número.
CREATE INDEX IF NOT EXISTS idx_sales_store_number ON public.sales (store_id, sale_number);