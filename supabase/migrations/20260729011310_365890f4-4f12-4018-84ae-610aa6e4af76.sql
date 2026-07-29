-- ══ A) MODELO DE ITEM ══════════════════════════════════════════════════
-- 1. Tipo de item
DO $$ BEGIN
  CREATE TYPE public.item_kind AS ENUM ('aparelho', 'acessorio', 'peca', 'ferramenta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_kind public.item_kind,
  -- aparelho
  ADD COLUMN IF NOT EXISTS imei2 text,
  ADD COLUMN IF NOT EXISTS battery_health integer,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS storage_gb integer,
  -- acessorio / peca (vindos de parts_inventory)
  ADD COLUMN IF NOT EXISTS compatible_models text,
  ADD COLUMN IF NOT EXISTS category_other text,
  ADD COLUMN IF NOT EXISTS notes text,
  -- ferramenta
  ADD COLUMN IF NOT EXISTS patrimonio text,
  ADD COLUMN IF NOT EXISTS responsavel text,
  ADD COLUMN IF NOT EXISTS data_aquisicao date;

-- 2. Backfill a partir de category (category permanece intacta)
UPDATE public.products
   SET item_kind = CASE
     WHEN category IN ('aparelho_novo', 'aparelho_seminovo') THEN 'aparelho'::public.item_kind
     WHEN category = 'acessorio' THEN 'acessorio'::public.item_kind
     WHEN category = 'peca' THEN 'peca'::public.item_kind
     ELSE 'acessorio'::public.item_kind
   END
 WHERE item_kind IS NULL;

ALTER TABLE public.products
  ALTER COLUMN item_kind SET DEFAULT 'acessorio'::public.item_kind;
ALTER TABLE public.products
  ALTER COLUMN item_kind SET NOT NULL;

-- Backfill de compatible_models a partir do campo singular já existente
UPDATE public.products
   SET compatible_models = compatible_model
 WHERE compatible_models IS NULL AND compatible_model IS NOT NULL AND compatible_model <> '';

CREATE INDEX IF NOT EXISTS products_store_item_kind_idx
  ON public.products (store_id, item_kind);

-- 3. Aparelho = 1 unidade por registro (NOT VALID: registros legados preservados)
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_aparelho_single_unit_chk;
ALTER TABLE public.products
  ADD CONSTRAINT products_aparelho_single_unit_chk
  CHECK (item_kind <> 'aparelho' OR stock_current IN (0, 1)) NOT VALID;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_battery_health_chk;
ALTER TABLE public.products
  ADD CONSTRAINT products_battery_health_chk
  CHECK (battery_health IS NULL OR (battery_health >= 0 AND battery_health <= 100)) NOT VALID;

-- 4. Validação de IMEI: 15 dígitos + Luhn
CREATE OR REPLACE FUNCTION public.is_valid_imei(_imei text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text := regexp_replace(coalesce(_imei, ''), '\D', '', 'g');
  total int := 0;
  d int;
  i int;
BEGIN
  IF length(s) <> 15 THEN
    RETURN false;
  END IF;
  FOR i IN 1..15 LOOP
    d := substr(s, i, 1)::int;
    -- Luhn: dobra as posições pares (a partir da esquerda, 15 dígitos)
    IF i % 2 = 0 THEN
      d := d * 2;
      IF d > 9 THEN d := d - 9; END IF;
    END IF;
    total := total + d;
  END LOOP;
  RETURN total % 10 = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_products_validate_imei()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  existing record;
BEGIN
  IF NEW.imei IS NOT NULL AND btrim(NEW.imei) = '' THEN
    NEW.imei := NULL;
  END IF;
  IF NEW.imei2 IS NOT NULL AND btrim(NEW.imei2) = '' THEN
    NEW.imei2 := NULL;
  END IF;

  IF NEW.imei IS NOT NULL THEN
    NEW.imei := regexp_replace(NEW.imei, '\D', '', 'g');
    IF NOT public.is_valid_imei(NEW.imei) THEN
      RAISE EXCEPTION 'IMEI inválido: % — deve ter 15 dígitos e passar na validação Luhn.', NEW.imei
        USING ERRCODE = '23514';
    END IF;

    SELECT p.id, p.name, p.sku, p.status
      INTO existing
      FROM public.products p
     WHERE p.store_id = NEW.store_id
       AND p.imei = NEW.imei
       AND p.id <> NEW.id
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'IMEI % já cadastrado nesta loja no produto "%" (SKU %, situação %).',
        NEW.imei, existing.name, coalesce(existing.sku, '—'), existing.status
        USING ERRCODE = '23505';
    END IF;
  END IF;

  IF NEW.imei2 IS NOT NULL THEN
    NEW.imei2 := regexp_replace(NEW.imei2, '\D', '', 'g');
    IF NOT public.is_valid_imei(NEW.imei2) THEN
      RAISE EXCEPTION 'IMEI 2 inválido: % — deve ter 15 dígitos e passar na validação Luhn.', NEW.imei2
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_validate_imei_trg ON public.products;
CREATE TRIGGER products_validate_imei_trg
  BEFORE INSERT OR UPDATE OF imei, imei2 ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_products_validate_imei();

-- 5. Índice único parcial de IMEI por loja
CREATE UNIQUE INDEX IF NOT EXISTS products_store_imei_unique
  ON public.products (store_id, imei)
  WHERE imei IS NOT NULL AND imei <> '';

COMMENT ON COLUMN public.products.item_kind IS
  'Tipo do item: aparelho (1 unidade por registro, IMEI obrigatório na UI), acessorio, peca, ferramenta (fora do valor de estoque e da venda).';