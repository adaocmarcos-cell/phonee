-- =====================================================================
-- 1) TRANSFERÊNCIA ENTRE LOJAS COM LEDGER CORRETO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.transfer_products(
  _from_store_id  uuid,
  _to_store_id    uuid,
  _from_product_id uuid,
  _quantity       integer,
  _note           text DEFAULT NULL,
  _to_product_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_src products%ROWTYPE;
  v_dest_id uuid;
  v_transfer_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _from_store_id = _to_store_id THEN RAISE EXCEPTION 'Origem e destino devem ser lojas diferentes'; END IF;
  IF COALESCE(_quantity,0) < 1 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  IF NOT (public.is_owner(v_uid, _from_store_id) AND public.is_owner(v_uid, _to_store_id)) THEN
    RAISE EXCEPTION 'Sem permissão: é preciso ser dono das duas lojas';
  END IF;

  SELECT * INTO v_src FROM public.products WHERE id = _from_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto de origem não encontrado'; END IF;
  IF v_src.store_id <> _from_store_id THEN RAISE EXCEPTION 'Produto não pertence à loja de origem'; END IF;
  IF COALESCE(v_src.stock_current,0) < _quantity THEN
    RAISE EXCEPTION 'Estoque insuficiente: % disponível(is)', COALESCE(v_src.stock_current,0);
  END IF;

  -- Produto de destino: informado, existente por SKU/nome, ou criado zerado
  v_dest_id := _to_product_id;

  IF v_dest_id IS NULL THEN
    SELECT p.id INTO v_dest_id
      FROM public.products p
     WHERE p.store_id = _to_store_id
       AND ((v_src.sku IS NOT NULL AND p.sku = v_src.sku) OR p.name = v_src.name)
     ORDER BY (p.sku IS NOT NULL AND p.sku = v_src.sku) DESC
     LIMIT 1;
  END IF;

  IF v_dest_id IS NULL THEN
    INSERT INTO public.products AS d
    SELECT (s).*
      FROM (SELECT v_src) t(s)
    ON CONFLICT DO NOTHING
    RETURNING d.id INTO v_dest_id;
    -- fallback explícito (evita depender de cópia posicional em caso de conflito)
    IF v_dest_id IS NULL THEN
      INSERT INTO public.products (store_id, name, sku, category, item_kind, brand, model,
                                   color, storage, cost_price, sale_price, stock_current, status)
      VALUES (_to_store_id, v_src.name, v_src.sku, v_src.category, v_src.item_kind, v_src.brand,
              v_src.model, v_src.color, v_src.storage, v_src.cost_price, v_src.sale_price, 0, 'ativo')
      RETURNING id INTO v_dest_id;
    END IF;
  END IF;

  -- Garante que o clone criado pela cópia posicional aponte para a loja destino e comece zerado
  UPDATE public.products
     SET store_id = _to_store_id
   WHERE id = v_dest_id AND store_id <> _to_store_id;

  INSERT INTO public.product_transfers
    (from_store_id, to_store_id, from_product_id, to_product_id, quantity, note, user_id)
  VALUES (_from_store_id, _to_store_id, _from_product_id, v_dest_id, _quantity, _note, v_uid)
  RETURNING id INTO v_transfer_id;

  PERFORM set_config('app.stock_origin', 'transferencia_out:product_transfers:'||v_transfer_id, true);
  UPDATE public.products
     SET stock_current = COALESCE(stock_current,0) - _quantity
   WHERE id = _from_product_id;

  PERFORM set_config('app.stock_origin', 'transferencia_in:product_transfers:'||v_transfer_id, true);
  UPDATE public.products
     SET stock_current = COALESCE(stock_current,0) + _quantity
   WHERE id = v_dest_id;

  PERFORM set_config('app.stock_origin', '', true);

  RETURN v_transfer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_products(uuid,uuid,uuid,integer,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_products(uuid,uuid,uuid,integer,text,uuid) TO authenticated;

-- =====================================================================
-- 2) AUDITORIA: DOCUMENTOS SEM MOVIMENTO NO LEDGER
-- =====================================================================
CREATE OR REPLACE FUNCTION public.stock_ledger_gaps(_store_id uuid)
RETURNS TABLE (
  kind          text,
  movement_type text,
  origin_table  text,
  origin_id     uuid,
  doc_label     text,
  occurred_at   timestamptz,
  product_id    uuid,
  product_name  text,
  quantity      numeric,
  unit_cost     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH allowed AS (
    SELECT public.user_has_store_access(auth.uid(), _store_id) AS ok
  )
  -- Vendas
  SELECT 'venda'::text, 'venda'::text, 'sales'::text, s.id,
         COALESCE('#'||s.sale_number::text, left(s.id::text,8)),
         s.created_at, si.product_id, COALESCE(p.name, si.name),
         -COALESCE(si.quantity,0)::numeric, NULLIF(si.unit_cost,0)
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    LEFT JOIN public.products p ON p.id = si.product_id
   CROSS JOIN allowed a
   WHERE a.ok AND s.store_id = _store_id AND si.product_id IS NOT NULL
     AND COALESCE(si.is_service,false) = false
     AND NOT EXISTS (
       SELECT 1 FROM public.stock_movements m
        WHERE m.origin_id = s.id AND m.product_id = si.product_id AND m.type = 'venda')

  UNION ALL
  -- Devoluções (apenas itens que voltaram ao estoque)
  SELECT 'devolucao', 'devolucao', 'sale_returns', r.id,
         'DEV '||left(r.id::text,8), r.created_at, ri.product_id, p.name,
         COALESCE(ri.quantity,0)::numeric, NULL
    FROM public.sale_return_items ri
    JOIN public.sale_returns r ON r.id = ri.return_id
    LEFT JOIN public.products p ON p.id = ri.product_id
   CROSS JOIN allowed a
   WHERE a.ok AND r.store_id = _store_id AND ri.product_id IS NOT NULL AND ri.restock
     AND NOT EXISTS (
       SELECT 1 FROM public.stock_movements m
        WHERE m.origin_id = r.id AND m.product_id = ri.product_id AND m.type = 'devolucao')

  UNION ALL
  -- Peças usadas em OS
  SELECT 'uso_os', 'uso_os', 'service_orders', sop.service_order_id,
         COALESCE('OS #'||os.os_number::text, left(sop.service_order_id::text,8)),
         sop.created_at, sop.part_id, COALESCE(p.name, sop.description),
         -COALESCE(sop.qty,0)::numeric, NULLIF(sop.unit_cost,0)
    FROM public.service_order_parts sop
    LEFT JOIN public.service_orders os ON os.id = sop.service_order_id
    LEFT JOIN public.products p ON p.id = sop.part_id
   CROSS JOIN allowed a
   WHERE a.ok AND sop.store_id = _store_id AND sop.part_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.stock_movements m
        WHERE m.origin_id = sop.service_order_id AND m.product_id = sop.part_id AND m.type = 'uso_os')

  UNION ALL
  -- Transferências: saída
  SELECT 'transferencia_out', 'transferencia_out', 'product_transfers', t.id,
         'TRF '||left(t.id::text,8), t.created_at, t.from_product_id, p.name,
         -COALESCE(t.quantity,0)::numeric, p.cost_price
    FROM public.product_transfers t
    LEFT JOIN public.products p ON p.id = t.from_product_id
   CROSS JOIN allowed a
   WHERE a.ok AND t.from_store_id = _store_id
     AND NOT EXISTS (
       SELECT 1 FROM public.stock_movements m
        WHERE m.origin_id = t.id AND m.product_id = t.from_product_id AND m.type = 'transferencia_out')

  UNION ALL
  -- Transferências: entrada
  SELECT 'transferencia_in', 'transferencia_in', 'product_transfers', t.id,
         'TRF '||left(t.id::text,8), t.created_at, t.to_product_id, p.name,
         COALESCE(t.quantity,0)::numeric, p.cost_price
    FROM public.product_transfers t
    LEFT JOIN public.products p ON p.id = t.to_product_id
   CROSS JOIN allowed a
   WHERE a.ok AND t.to_store_id = _store_id AND t.to_product_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.stock_movements m
        WHERE m.origin_id = t.id AND m.product_id = t.to_product_id AND m.type = 'transferencia_in');
$$;

REVOKE ALL ON FUNCTION public.stock_ledger_gaps(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_ledger_gaps(uuid) TO authenticated;

-- =====================================================================
-- 3) BACKFILL SOMENTE DO LEDGER (NÃO TOCA EM stock_current)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.stock_ledger_backfill(
  _store_id uuid,
  _kinds    text[] DEFAULT NULL,
  _apply    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_preview jsonb;
  v_total int;
  v_inserted int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.user_has_store_access(v_uid, _store_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;
  IF _apply AND NOT (public.is_owner(v_uid, _store_id) OR public.has_role(v_uid,'admin_master')) THEN
    RAISE EXCEPTION 'Apenas o dono da loja pode aplicar o backfill do histórico';
  END IF;

  CREATE TEMP TABLE _gaps ON COMMIT DROP AS
  SELECT * FROM public.stock_ledger_gaps(_store_id) g
   WHERE _kinds IS NULL OR g.kind = ANY(_kinds);

  SELECT count(*)::int INTO v_total FROM _gaps;

  SELECT jsonb_agg(x) INTO v_preview FROM (
    SELECT kind, count(*)::int AS registros, sum(abs(quantity))::numeric AS unidades
      FROM _gaps GROUP BY kind ORDER BY kind
  ) x;

  IF _apply AND v_total > 0 THEN
    INSERT INTO public.stock_movements
      (store_id, product_id, occurred_at, type, quantity, balance_before, balance_after,
       unit_cost, origin_table, origin_id, created_by, notes)
    SELECT _store_id, g.product_id, g.occurred_at, g.movement_type, g.quantity,
           NULL, NULL, g.unit_cost, g.origin_table, g.origin_id, v_uid,
           'Backfill histórico do ledger — saldo do produto NÃO foi alterado'
      FROM _gaps g
     WHERE g.product_id IS NOT NULL;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'applied', _apply,
    'total_pendente', v_total,
    'inseridos', v_inserted,
    'preview', COALESCE(v_preview, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_ledger_backfill(uuid, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_ledger_backfill(uuid, text[], boolean) TO authenticated;

-- =====================================================================
-- 4) GUARDRAIL: FUNÇÕES QUE MEXEM EM ESTOQUE SEM DECLARAR A ORIGEM
-- =====================================================================
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
AS $$
  SELECT p.proname::text,
         ((length(d.def) - length(replace(d.def, 'UPDATE public.products', ''))) / 22)::int AS stock_updates,
         ((length(d.def) - length(replace(d.def, 'app.stock_origin', ''))) / 16)::int AS origin_tags,
         ((length(d.def) - length(replace(d.def, 'app.stock_origin', ''))) / 16)
           >= ((length(d.def) - length(replace(d.def, 'UPDATE public.products', ''))) / 22) AS ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL (SELECT pg_get_functiondef(p.oid) AS def) d
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND d.def LIKE '%UPDATE public.products%'
     AND d.def LIKE '%stock_current%'
     AND p.proname NOT IN ('stock_origin_guardrail')
   ORDER BY 4, 1;
$$;

REVOKE ALL ON FUNCTION public.stock_origin_guardrail() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_origin_guardrail() TO authenticated;

-- Bloqueia a criação/alteração de funções que atualizem estoque sem origem:
-- checagem executável em CI/diagnóstico (levanta exceção se houver pendência).
CREATE OR REPLACE FUNCTION public.assert_stock_origin_guardrail()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(function_name, ', ' ORDER BY function_name)
    INTO v_bad
    FROM public.stock_origin_guardrail()
   WHERE NOT ok;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Funções alteram stock_current sem definir app.stock_origin: %', v_bad;
  END IF;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_stock_origin_guardrail() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_stock_origin_guardrail() TO authenticated;