CREATE OR REPLACE FUNCTION public.stock_origin_guardrail()
RETURNS TABLE (
  function_name  text,
  stock_updates  int,
  origin_tags    int,
  ok             boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH f AS (
    SELECT p.proname::text AS fname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
       AND p.proname NOT IN ('stock_origin_guardrail','assert_stock_origin_guardrail')
  ), c AS (
    SELECT f.fname,
           (SELECT count(*) FROM regexp_matches(f.def, 'UPDATE\s+public\.products\M[^;]*?\Mstock_current\s*=', 'g')) AS upd,
           (SELECT count(*) FROM regexp_matches(f.def, 'app\.stock_origin''[^;]*;\s*UPDATE\s+public\.products\M[^;]*?\Mstock_current\s*=', 'g')) AS tagged
      FROM f
  )
  SELECT fname, upd::int, tagged::int, tagged >= upd
    FROM c
   WHERE upd > 0
   ORDER BY (tagged >= upd), fname;
$fn$;

REVOKE ALL ON FUNCTION public.stock_origin_guardrail() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_origin_guardrail() TO authenticated;

-- Desdobramento de aparelhos passa a declarar a origem do movimento
DO $do$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='split_device_units';

  IF v_def IS NULL THEN RETURN; END IF;

  v_new := regexp_replace(
    v_def,
    '(PERFORM set_config\(''app\.stock_origin''[^;]*;\s*)?UPDATE public\.products(\s+)SET stock_current',
    'PERFORM set_config(''app.stock_origin'', ''ajuste:products:''||_product_id, true); UPDATE public.products\2SET stock_current',
    'g'
  );

  IF v_new <> v_def THEN EXECUTE v_new; END IF;
END
$do$;