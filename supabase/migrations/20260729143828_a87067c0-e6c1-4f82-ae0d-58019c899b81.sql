DO $do$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('create_sale',                 '''venda:sales:''||v_sale_id'),
      ('update_sale_with_stock',      '''venda:sales:''||_sale_id'),
      ('create_sale_return',          '''devolucao:sale_returns:''||v_return_id'),
      ('add_os_part',                 '''uso_os:service_orders:''||_os_id'),
      ('remove_os_part',              '''devolucao:service_order_parts:''||_line_id'),
      ('cancel_service_order',        '''devolucao:service_orders:''||_os_id'),
      ('create_purchase_with_stock',  '''compra:purchase_orders:''||v_order_id'),
      ('update_purchase_with_stock',  '''compra:purchase_orders:''||_order_id'),
      ('finish_trade_in_repair',      '''uso_os:trade_ins:''||_trade_in_id'),
      ('add_tradein_repair_cost',     '''uso_os:trade_ins:''||_trade_in_id')
    ) AS t(fname, expr)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fname;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'funcao % nao encontrada', r.fname;
    END IF;

    IF position('app.stock_origin' in v_def) > 0 THEN
      CONTINUE;
    END IF;

    v_new := replace(
      v_def,
      'UPDATE public.products SET stock_current',
      'PERFORM set_config(''app.stock_origin'', ' || r.expr || ', true); UPDATE public.products SET stock_current'
    );
    v_new := replace(
      v_new,
      E'UPDATE public.products\n       SET stock_current',
      'PERFORM set_config(''app.stock_origin'', ' || r.expr || E', true); UPDATE public.products\n       SET stock_current'
    );
    v_new := replace(
      v_new,
      E'UPDATE public.products\n          SET stock_current',
      'PERFORM set_config(''app.stock_origin'', ' || r.expr || E', true); UPDATE public.products\n          SET stock_current'
    );

    IF v_new = v_def THEN
      RAISE EXCEPTION 'nenhum UPDATE de estoque localizado em %', r.fname;
    END IF;

    EXECUTE v_new;
  END LOOP;
END
$do$;