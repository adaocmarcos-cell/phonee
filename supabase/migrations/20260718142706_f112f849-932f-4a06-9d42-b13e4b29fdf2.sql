
CREATE OR REPLACE FUNCTION public.check_tradein_cost_divergence()
RETURNS TABLE(store_id uuid, imei text, expected numeric, actual numeric, diff numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_link text;
  v_expected numeric;
  v_actual numeric;
  v_diff numeric;
  v_tol numeric := 0.50;
BEGIN
  FOR r IN
    SELECT t.id AS trade_id,
           t.store_id,
           COALESCE(t.imei, p.imei) AS imei_val,
           COALESCE(t.entry_value,0) AS entry_value,
           COALESCE(t.repair_costs,0) AS repair_costs,
           COALESCE(p.cost_price,0) AS product_cost,
           p.name AS product_name
    FROM public.trade_ins t
    JOIN public.products p ON p.id = t.product_id
    WHERE t.product_id IS NOT NULL
      AND t.received_in_sale_id IS NULL
      AND COALESCE(t.imei, p.imei) IS NOT NULL
  LOOP
    v_expected := r.entry_value + r.repair_costs;
    v_actual   := r.product_cost;
    v_diff     := round(abs(v_expected - v_actual)::numeric, 2);
    IF v_diff > v_tol THEN
      v_link := '/painel/estoque/rastreio-imei?imei=' || r.imei_val;
      IF NOT EXISTS (
        SELECT 1 FROM public.alerts a
        WHERE a.store_id = r.store_id
          AND a.type = 'tradein_cost_divergence'
          AND a.link = v_link
          AND a.is_read = false
      ) THEN
        INSERT INTO public.alerts(store_id, type, severity, title, message, link)
        VALUES (
          r.store_id,
          'tradein_cost_divergence',
          'warning',
          'Divergência de custo no seminovo',
          format('%s (IMEI %s): entrada + reparos = R$ %s, mas o custo em estoque é R$ %s (diferença R$ %s).',
                 COALESCE(r.product_name,'Aparelho'), r.imei_val,
                 to_char(v_expected,'FM999G999G990D00'),
                 to_char(v_actual,'FM999G999G990D00'),
                 to_char(v_diff,'FM999G999G990D00')),
          v_link
        );
      END IF;
      store_id := r.store_id; imei := r.imei_val;
      expected := v_expected; actual := v_actual; diff := v_diff;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END; $$;

REVOKE ALL ON FUNCTION public.check_tradein_cost_divergence() FROM public;
GRANT EXECUTE ON FUNCTION public.check_tradein_cost_divergence() TO authenticated, service_role;

-- Schedule daily at 09:00 UTC (06:00 BRT)
DO $$
BEGIN
  PERFORM cron.unschedule('phonee_tradein_cost_divergence');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'phonee_tradein_cost_divergence',
  '0 9 * * *',
  $$SELECT public.check_tradein_cost_divergence();$$
);
