-- 1) Colunas de estorno
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_status_chk') THEN
    ALTER TABLE public.sales ADD CONSTRAINT sales_status_chk CHECK (status IN ('ativa','estornada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_store_status_idx ON public.sales(store_id, status);

ALTER TABLE public.sale_payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

-- 2) Ajusta funções de métricas para ignorar vendas estornadas
DO $do$
DECLARE v_src text; v_new text;
BEGIN
  -- get_dashboard_metrics_base
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_dashboard_metrics_base';
  v_new := replace(v_src, 'WHERE s.store_id = _store_id',
                          'WHERE s.store_id = _store_id AND COALESCE(s.status,''ativa'') <> ''estornada''');
  v_new := replace(v_new, 'JOIN public.sales s ON s.id = r.sale_id',
                          'JOIN public.sales s ON s.id = r.sale_id AND COALESCE(s.status,''ativa'') <> ''estornada''');
  IF v_new = v_src THEN RAISE EXCEPTION 'falha ao ajustar get_dashboard_metrics_base'; END IF;
  EXECUTE v_new;

  -- dre_gerencial
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='dre_gerencial';
  v_new := replace(v_src,
    'FROM public.sales
   WHERE store_id = _store_id AND created_at::date BETWEEN _from AND _to;',
    'FROM public.sales
   WHERE store_id = _store_id AND COALESCE(status,''ativa'') <> ''estornada'' AND created_at::date BETWEEN _from AND _to;');
  v_new := replace(v_new,
    'JOIN public.sales s ON s.id = si.sale_id
   WHERE s.store_id = _store_id',
    'JOIN public.sales s ON s.id = si.sale_id
   WHERE s.store_id = _store_id AND COALESCE(s.status,''ativa'') <> ''estornada''');
  v_new := replace(v_new,
    'FROM public.sale_payments
   WHERE store_id = _store_id AND created_at::date BETWEEN _from AND _to;',
    'FROM public.sale_payments sp
   WHERE sp.store_id = _store_id AND sp.created_at::date BETWEEN _from AND _to
     AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sp.sale_id AND COALESCE(s.status,''ativa'') <> ''estornada'');');
  IF v_new = v_src THEN RAISE EXCEPTION 'falha ao ajustar dre_gerencial'; END IF;
  EXECUTE v_new;

  -- goals_progress
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='goals_progress';
  v_new := replace(v_src, 'WHERE sa.store_id = _store_id',
                          'WHERE sa.store_id = _store_id AND COALESCE(sa.status,''ativa'') <> ''estornada''');
  IF v_new = v_src THEN RAISE EXCEPTION 'falha ao ajustar goals_progress'; END IF;
  EXECUTE v_new;

  -- cash_flow_projection
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='cash_flow_projection';
  v_new := replace(v_src, 'WHERE store_id = _store_id AND received_at IS NULL',
    'WHERE store_id = _store_id AND received_at IS NULL
       AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_payments.sale_id AND COALESCE(s.status,''ativa'') <> ''estornada'')');
  IF v_new = v_src THEN RAISE EXCEPTION 'falha ao ajustar cash_flow_projection'; END IF;
  EXECUTE v_new;
END
$do$;

-- 3) RPC de estorno
CREATE OR REPLACE FUNCTION public.reverse_sale(p_sale_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_uid uuid := auth.uid();
  v_item record;
  v_ti record;
  v_moves int := 0;
  v_pay_count int := 0;
  v_recv_cancel int := 0;
  v_recv_pay_count int := 0;
  v_comm int := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_mov_id uuid;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;

  IF NOT public.user_has_store_access(v_uid, v_sale.store_id) THEN
    RAISE EXCEPTION 'Sem permissão para estornar vendas desta loja';
  END IF;

  IF COALESCE(v_sale.status, 'ativa') = 'estornada' THEN
    RAISE EXCEPTION 'Esta venda já está estornada';
  END IF;

  IF COALESCE(v_sale.returned_total, 0) > 0
     AND COALESCE(v_sale.returned_total, 0) < COALESCE(v_sale.total, 0) THEN
    RAISE EXCEPTION 'Venda com devolução parcial em aberto — conclua ou reverta a devolução antes de estornar';
  END IF;

  v_payload := jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(si)) FROM public.sale_items si WHERE si.sale_id = p_sale_id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(sp)) FROM public.sale_payments sp WHERE sp.sale_id = p_sale_id), '[]'::jsonb),
    'receivables', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.sale_receivables r WHERE r.sale_id = p_sale_id), '[]'::jsonb),
    'receivable_payments', COALESCE((SELECT jsonb_agg(to_jsonb(rp)) FROM public.receivable_payments rp WHERE rp.sale_id = p_sale_id), '[]'::jsonb)
  );

  -- 3.1 devolve estoque (atômico) e registra no livro-razão
  PERFORM set_config('app.stock_origin', 'devolucao:sales:' || p_sale_id::text, true);
  FOR v_item IN
    SELECT si.product_id, SUM(si.quantity)::numeric AS qty, MAX(si.unit_cost) AS cost
      FROM public.sale_items si
     WHERE si.sale_id = p_sale_id
       AND si.product_id IS NOT NULL
       AND COALESCE(si.is_service, false) = false
     GROUP BY si.product_id
  LOOP
    UPDATE public.products
       SET stock_current = COALESCE(stock_current, 0) + v_item.qty
     WHERE id = v_item.product_id;

    SELECT sm.id INTO v_mov_id
      FROM public.stock_movements sm
     WHERE sm.product_id = v_item.product_id
       AND sm.origin_table = 'sales' AND sm.origin_id = p_sale_id
     ORDER BY sm.created_at DESC LIMIT 1;

    IF v_mov_id IS NOT NULL THEN
      UPDATE public.stock_movements
         SET unit_cost = COALESCE(v_item.cost, unit_cost),
             notes = 'Estorno da venda #' || COALESCE(v_sale.sale_number::text, left(p_sale_id::text, 8))
       WHERE id = v_mov_id;
      v_moves := v_moves + 1;
    END IF;
  END LOOP;
  PERFORM set_config('app.stock_origin', '', true);

  -- 3.2 pagamentos
  UPDATE public.sale_payments
     SET reversed_at = now(),
         notes = COALESCE(notes || ' · ', '') || 'Estornado'
   WHERE sale_id = p_sale_id AND reversed_at IS NULL;
  GET DIAGNOSTICS v_pay_count = ROW_COUNT;

  -- 3.3 crediário
  UPDATE public.sale_receivables
     SET status = 'cancelado',
         notes = COALESCE(notes || ' · ', '') || 'Cancelado por estorno da venda',
         updated_at = now()
   WHERE sale_id = p_sale_id AND status IN ('aberto','parcial');
  GET DIAGNOSTICS v_recv_cancel = ROW_COUNT;

  UPDATE public.receivable_payments
     SET reversed_at = now(),
         notes = COALESCE(notes || ' · ', '') || 'Estornado com a venda'
   WHERE sale_id = p_sale_id AND reversed_at IS NULL;
  GET DIAGNOSTICS v_recv_pay_count = ROW_COUNT;

  -- 3.4 comissões
  UPDATE public.commission_entries
     SET status = 'estornado', updated_at = now(),
         notes = COALESCE(notes || ' · ', '') || 'Venda estornada'
   WHERE sale_id = p_sale_id AND status <> 'pago';
  GET DIAGNOSTICS v_comm = ROW_COUNT;

  -- 3.5 trade-in recebido como pagamento
  FOR v_ti IN
    SELECT t.id, t.brand, t.model, t.imei, t.status, t.product_id
      FROM public.trade_ins t
     WHERE t.received_in_sale_id = p_sale_id
  LOOP
    IF v_ti.product_id IS NOT NULL OR v_ti.status = 'em_estoque' THEN
      v_warnings := v_warnings || jsonb_build_object(
        'tipo', 'trade_in_em_estoque',
        'trade_in_id', v_ti.id,
        'descricao', COALESCE(v_ti.brand,'') || ' ' || COALESCE(v_ti.model,'') || COALESCE(' · IMEI ' || v_ti.imei, ''),
        'mensagem', 'O aparelho recebido em troca já virou produto em estoque. Decida manualmente o que fazer com ele.'
      );
    ELSE
      UPDATE public.trade_ins
         SET status = 'aprovado', received_in_sale_id = NULL, updated_at = now()
       WHERE id = v_ti.id;
    END IF;
  END LOOP;

  -- 3.6 marca a venda como estornada (nunca apaga)
  UPDATE public.sales
     SET status = 'estornada',
         reversed_at = now(),
         reversed_by = v_uid,
         reversal_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
   WHERE id = p_sale_id;

  -- 3.7 auditoria
  INSERT INTO public.audit_log(user_id, store_id, action, entity, entity_id, module, screen, old_value, new_value, details, status)
  VALUES (v_uid, v_sale.store_id, 'estorno', 'sales', p_sale_id, 'vendas', 'vendas',
          v_payload,
          jsonb_build_object('status','estornada','reversed_at', now(), 'reversal_reason', p_reason),
          jsonb_build_object('itens_estoque_devolvidos', v_moves, 'pagamentos_estornados', v_pay_count,
                             'parcelas_canceladas', v_recv_cancel, 'recebimentos_estornados', v_recv_pay_count,
                             'comissoes_estornadas', v_comm, 'avisos', v_warnings),
          'ok');

  RETURN jsonb_build_object(
    'ok', true,
    'sale_id', p_sale_id,
    'sale_number', v_sale.sale_number,
    'total_estornado', v_sale.total,
    'movimentos_estoque', v_moves,
    'pagamentos_estornados', v_pay_count,
    'parcelas_canceladas', v_recv_cancel,
    'recebimentos_estornados', v_recv_pay_count,
    'comissoes_estornadas', v_comm,
    'avisos', v_warnings
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_sale(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reverse_sale(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_sale(uuid, text) TO service_role;