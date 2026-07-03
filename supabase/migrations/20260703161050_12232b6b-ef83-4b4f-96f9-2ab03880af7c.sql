CREATE OR REPLACE FUNCTION public.tg_validate_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sale_id IS NULL THEN
    RAISE EXCEPTION 'sale_item invalid: sale_id is required';
  END IF;
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'sale_item invalid: quantity must be greater than zero';
  END IF;
  IF NEW.is_service THEN
    IF COALESCE(NULLIF(trim(NEW.description), ''), NULLIF(trim(NEW.name), '')) IS NULL THEN
      RAISE EXCEPTION 'sale_item invalid: service description is required';
    END IF;
    IF NEW.name IS NULL OR trim(NEW.name) = '' THEN
      NEW.name := NEW.description;
    END IF;
    IF NEW.sku IS NULL OR trim(NEW.sku) = '' THEN
      NEW.sku := 'SERVICO';
    END IF;
  ELSE
    IF NEW.product_id IS NULL THEN
      RAISE EXCEPTION 'sale_item invalid: product_id is required for non-service items';
    END IF;
    IF NEW.name IS NULL OR trim(NEW.name) = '' THEN
      SELECT p.name INTO NEW.name FROM public.products p WHERE p.id = NEW.product_id;
    END IF;
    IF NEW.sku IS NULL OR trim(NEW.sku) = '' THEN
      SELECT p.sku INTO NEW.sku FROM public.products p WHERE p.id = NEW.product_id;
    END IF;
    IF NEW.name IS NULL OR trim(NEW.name) = '' THEN
      RAISE EXCEPTION 'sale_item invalid: product snapshot name is required';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_sale_item ON public.sale_items;
CREATE TRIGGER trg_validate_sale_item
BEFORE INSERT OR UPDATE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_sale_item();

-- Helper para validar que uma venda tenha ao menos um item
CREATE OR REPLACE FUNCTION public.assert_sale_has_items(_sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.sale_items WHERE sale_id = _sale_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'sale % has no items', _sale_id;
  END IF;
  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assert_sale_has_items(uuid) TO authenticated, service_role;