
ALTER TABLE public.trade_ins
  ADD COLUMN IF NOT EXISTS repair_costs numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrap_for_parts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS repair_parts jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Update product creation trigger to include repair costs in product cost
CREATE OR REPLACE FUNCTION public.tg_tradein_to_product()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_pid uuid;
  v_name text;
  v_cond public.product_condition;
  v_sku text;
  v_total_cost numeric;
BEGIN
  IF NEW.status NOT IN ('aprovado','em_estoque') THEN
    RETURN NEW;
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.scrap_for_parts, false) THEN
    -- Sucata: não vira produto de vitrine
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
  v_total_cost := COALESCE(NEW.entry_value,0) + COALESCE(NEW.repair_costs,0);

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
    v_total_cost,
    COALESCE(NEW.intended_sale_value, v_total_cost, 0),
    1, 0, 1,
    true,
    'ativo'
  )
  RETURNING id INTO new_pid;

  NEW.product_id := new_pid;
  RETURN NEW;
END;
$function$;
