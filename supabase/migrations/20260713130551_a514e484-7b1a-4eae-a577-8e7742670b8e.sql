
-- 1) Additive columns
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_breakdown jsonb;

ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS trade_in_id uuid REFERENCES public.trade_ins(id) ON DELETE SET NULL;

ALTER TABLE public.trade_ins
  ADD COLUMN IF NOT EXISTS received_in_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_payments_trade_in ON public.sale_payments(trade_in_id) WHERE trade_in_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_ins_received_in_sale ON public.trade_ins(received_in_sale_id) WHERE received_in_sale_id IS NOT NULL;

-- 2) Historical cleanup: delete any expenses created from trade-in entries and unlink them.
DO $$
DECLARE
  v_total numeric := 0;
  v_count int := 0;
BEGIN
  SELECT COALESCE(SUM(amount),0), COUNT(*)
    INTO v_total, v_count
    FROM public.expenses
   WHERE id IN (SELECT entry_expense_id FROM public.trade_ins WHERE entry_expense_id IS NOT NULL);
  DELETE FROM public.expenses
   WHERE id IN (SELECT entry_expense_id FROM public.trade_ins WHERE entry_expense_id IS NOT NULL);
  UPDATE public.trade_ins SET entry_expense_id = NULL WHERE entry_expense_id IS NOT NULL;
  RAISE NOTICE 'Trade-in expense cleanup: removed % rows totalling R$ %', v_count, v_total;
END $$;

-- 3) Keep products.cost_price in sync when trade-in entry/repair values change
--    after the product has already been created in stock.
CREATE OR REPLACE FUNCTION public.tg_tradein_sync_product_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL
     AND (
       OLD.entry_value  IS DISTINCT FROM NEW.entry_value
       OR OLD.repair_costs IS DISTINCT FROM NEW.repair_costs
     ) THEN
    UPDATE public.products
       SET cost_price = COALESCE(NEW.entry_value, 0) + COALESCE(NEW.repair_costs, 0),
           updated_at = now()
     WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tradein_sync_product_cost ON public.trade_ins;
CREATE TRIGGER tradein_sync_product_cost
AFTER UPDATE ON public.trade_ins
FOR EACH ROW EXECUTE FUNCTION public.tg_tradein_sync_product_cost();
