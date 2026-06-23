-- Prompt 1: Vendas + Custo de Entrada
-- Estende tabelas existentes em vez de duplicar (cost_price = custo de aquisição, supplier = fornecedor)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS data_entrada date NOT NULL DEFAULT current_date;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_whatsapp text;

-- Permitir 'boleto' na forma de pagamento (já usado na UI atual) sem quebrar o enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='boleto' AND enumtypid='public.payment_method'::regtype) THEN
    ALTER TYPE public.payment_method ADD VALUE 'boleto';
  END IF;
END $$;