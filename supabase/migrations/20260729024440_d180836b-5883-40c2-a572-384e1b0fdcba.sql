-- ============================================================
-- TAREFA 1 — Recuperação de custo em sale_items
-- ============================================================
DO $$
DECLARE
  v_count int := 0;
BEGIN
  WITH alvo AS (
    SELECT si.id AS item_id, si.sale_id, s.store_id, si.product_id,
           p.cost_price AS novo_custo, si.unit_cost AS custo_antigo, si.name AS item_name
      FROM public.sale_items si
      JOIN public.sales s   ON s.id = si.sale_id
      JOIN public.products p ON p.id = si.product_id
     WHERE COALESCE(si.unit_cost, 0) = 0
       AND COALESCE(si.is_service, false) = false
       AND COALESCE(p.cost_price, 0) > 0
  ), upd AS (
    UPDATE public.sale_items si
       SET unit_cost = a.novo_custo
      FROM alvo a
     WHERE si.id = a.item_id
       AND COALESCE(si.unit_cost, 0) = 0
    RETURNING si.id
  ), aud AS (
    INSERT INTO public.audit_log (store_id, action, entity, entity_id, module, screen, old_value, new_value, details, status)
    SELECT a.store_id,
           'regularizacao_custo_item_venda',
           'sale_items',
           a.item_id,
           'vendas',
           'regularizacao_automatica',
           jsonb_build_object('unit_cost', COALESCE(a.custo_antigo, 0)),
           jsonb_build_object('unit_cost', a.novo_custo),
           jsonb_build_object(
             'origem', 'regularizacao_automatica_products_cost_price',
             'sale_id', a.sale_id,
             'product_id', a.product_id,
             'item_name', a.item_name
           ),
           'ok'
      FROM alvo a
      JOIN upd u ON u.id = a.item_id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM aud;

  RAISE NOTICE 'sale_items com custo recuperado: %', v_count;
END $$;

-- ============================================================
-- TAREFA 2 — Transparência do CMV no dashboard
-- Apenas ADICIONA campos; nenhum cálculo existente foi alterado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  _store_id uuid, _from timestamp with time zone, _to timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_base jsonb;
  v_rev_with numeric := 0; v_rev_all numeric := 0;
  v_items_no_cost int := 0; v_items_total int := 0; v_items_with_cost int := 0;
BEGIN
  v_base := public.get_dashboard_metrics_base(_store_id, _from, _to);

  SELECT COALESCE(SUM(si.total) FILTER (WHERE COALESCE(si.unit_cost,0) > 0), 0),
         COALESCE(SUM(si.total), 0),
         COUNT(*) FILTER (WHERE COALESCE(si.unit_cost,0) <= 0),
         COUNT(*) FILTER (WHERE COALESCE(si.unit_cost,0) > 0),
         COUNT(*)
    INTO v_rev_with, v_rev_all, v_items_no_cost, v_items_with_cost, v_items_total
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
   WHERE s.store_id = _store_id
     AND s.created_at >= _from AND s.created_at <= _to
     AND COALESCE(si.is_service, false) = false;

  RETURN v_base || jsonb_build_object(
    'cobertura_custo', CASE WHEN v_rev_all > 0 THEN ROUND(100.0 * v_rev_with / v_rev_all, 1) ELSE 100 END,
    'cobertura_custo_pct', CASE WHEN v_items_total > 0 THEN ROUND(100.0 * v_items_with_cost / v_items_total, 1) ELSE 100 END,
    'itens_sem_custo', v_items_no_cost,
    'itens_vendidos', v_items_total
  );
END; $function$;

-- ============================================================
-- TAREFA 5 — Alerta agregado de preço abaixo do custo
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_price_below_cost()
RETURNS TABLE(store_id uuid, produtos int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT s.id AS store_id,
           COUNT(p.id) FILTER (
             WHERE COALESCE(p.sale_price,0) > 0
               AND COALESCE(p.cost_price,0) > 0
               AND p.sale_price < p.cost_price
           )::int AS qtd,
           (ARRAY_AGG(p.id ORDER BY (p.cost_price - p.sale_price) DESC) FILTER (
             WHERE COALESCE(p.sale_price,0) > 0
               AND COALESCE(p.cost_price,0) > 0
               AND p.sale_price < p.cost_price
           ))[1] AS pior_produto,
           COALESCE(SUM(p.cost_price - p.sale_price) FILTER (
             WHERE COALESCE(p.sale_price,0) > 0
               AND COALESCE(p.cost_price,0) > 0
               AND p.sale_price < p.cost_price
           ), 0) AS prejuizo_total
      FROM public.stores s
      LEFT JOIN public.products p ON p.store_id = s.id AND COALESCE(p.status,'ativo') <> 'inativo'
     GROUP BY s.id
  LOOP
    IF r.qtd > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.alerts a
         WHERE a.store_id = r.store_id
           AND a.type = 'preco_abaixo_custo'
           AND a.status = 'open'
      ) THEN
        INSERT INTO public.alerts (store_id, type, severity, title, message, link, product_id, metadata)
        VALUES (
          r.store_id,
          'preco_abaixo_custo',
          'danger'::alert_severity,
          'Produtos com preço abaixo do custo',
          format('%s produto(s) estão com preço de venda menor que o custo (prejuízo somado de R$ %s por unidade). Revise os preços.',
                 r.qtd, to_char(r.prejuizo_total, 'FM999G999G990D00')),
          '/painel/estoque/saude?tab=prejuizo',
          r.pior_produto,
          jsonb_build_object('produtos_afetados', r.qtd, 'prejuizo_total', r.prejuizo_total)
        );
      ELSE
        UPDATE public.alerts a
           SET message = format('%s produto(s) estão com preço de venda menor que o custo (prejuízo somado de R$ %s por unidade). Revise os preços.',
                                r.qtd, to_char(r.prejuizo_total, 'FM999G999G990D00')),
               product_id = r.pior_produto,
               metadata = jsonb_build_object('produtos_afetados', r.qtd, 'prejuizo_total', r.prejuizo_total)
         WHERE a.store_id = r.store_id
           AND a.type = 'preco_abaixo_custo'
           AND a.status = 'open';
      END IF;
    ELSE
      UPDATE public.alerts a
         SET status = 'resolved',
             resolved_at = now(),
             resolution_kind = 'auto',
             resolution_note = 'Nenhum produto com preço abaixo do custo.'
       WHERE a.store_id = r.store_id
         AND a.type = 'preco_abaixo_custo'
         AND a.status = 'open';
    END IF;

    store_id := r.store_id; produtos := r.qtd;
    IF r.qtd > 0 THEN RETURN NEXT; END IF;
  END LOOP;
END; $function$;

REVOKE ALL ON FUNCTION public.check_price_below_cost() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_price_below_cost() TO service_role;

SELECT cron.unschedule('price_below_cost_daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'price_below_cost_daily');

SELECT cron.schedule('price_below_cost_daily', '20 6 * * *', $$SELECT public.check_price_below_cost();$$);
