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
           (SELECT count(*) FROM regexp_matches(f.def, 'UPDATE\s+public\.products\M[^;]*?\mstock_current\s*=', 'g')) AS upd,
           (SELECT count(*) FROM regexp_matches(f.def, 'app\.stock_origin''[^;]*;\s*UPDATE\s+public\.products\M[^;]*?\mstock_current\s*=', 'g')) AS tagged
      FROM f
  )
  SELECT fname, upd::int, tagged::int, tagged >= upd
    FROM c
   WHERE upd > 0
   ORDER BY (tagged >= upd), fname;
$fn$;

REVOKE ALL ON FUNCTION public.stock_origin_guardrail() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_origin_guardrail() TO authenticated;