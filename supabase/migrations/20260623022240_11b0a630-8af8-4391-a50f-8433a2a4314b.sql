
-- 1) Per-user permissions overrides
ALTER TABLE public.user_profile_extras
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Trade-in -> Product sync
CREATE OR REPLACE FUNCTION public.tg_tradein_to_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_pid uuid;
  v_name text;
  v_cond public.product_condition;
  v_sku text;
BEGIN
  IF NEW.status NOT IN ('aprovado','em_estoque') THEN
    RETURN NEW;
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_name := trim(both ' ' from coalesce(NEW.brand,'') || ' ' || NEW.model
    || CASE WHEN NEW.storage_gb IS NOT NULL AND NEW.storage_gb <> '' THEN ' ' || NEW.storage_gb || 'GB' ELSE '' END
    || CASE WHEN NEW.color IS NOT NULL AND NEW.color <> '' THEN ' ' || NEW.color ELSE '' END);

  v_cond := CASE NEW.condition
    WHEN 'otimo' THEN 'seminovo'::public.product_condition
    WHEN 'bom' THEN 'seminovo'::public.product_condition
    WHEN 'regular' THEN 'recondicionado'::public.product_condition
    WHEN 'com_defeito' THEN 'recondicionado'::public.product_condition
    ELSE 'seminovo'::public.product_condition
  END;

  v_sku := 'TI-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.products (
    store_id, name, sku, brand, category, condition,
    cost_price, sale_price, stock_current, stock_min, stock_max,
    visible_in_catalog, status
  ) VALUES (
    NEW.store_id,
    NULLIF(v_name, ''),
    v_sku,
    NEW.brand,
    'aparelho_seminovo',
    v_cond,
    COALESCE(NEW.entry_value, 0),
    COALESCE(NEW.intended_sale_value, NEW.entry_value, 0),
    1, 0, 1,
    true,
    'ativo'
  )
  RETURNING id INTO new_pid;

  NEW.product_id := new_pid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tradein_to_product ON public.trade_ins;
CREATE TRIGGER trg_tradein_to_product
BEFORE INSERT OR UPDATE OF status ON public.trade_ins
FOR EACH ROW
EXECUTE FUNCTION public.tg_tradein_to_product();
