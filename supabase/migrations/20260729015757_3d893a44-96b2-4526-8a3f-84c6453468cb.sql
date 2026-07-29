-- ============================================================
-- FASE 1 — FINANCEIRO GERENCIAL
-- ============================================================

-- ---------- 1.1 CONTAS A PAGAR ----------
CREATE TABLE public.payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','weekly','monthly','yearly')),
  installment_of uuid REFERENCES public.payables(id) ON DELETE SET NULL,
  installment_number integer,
  total_installments integer,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','pago','vencido','cancelado')),
  paid_at timestamptz,
  paid_amount numeric(14,2),
  payment_method text,
  notes text,
  receipt_url text,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payables TO authenticated;
GRANT ALL ON public.payables TO service_role;

ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payables_select" ON public.payables FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "payables_insert" ON public.payables FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "payables_update" ON public.payables FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "payables_delete" ON public.payables FOR DELETE TO authenticated
  USING (
    public.is_owner(auth.uid(), store_id)
    OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
    OR public.has_permission(auth.uid(), store_id, 'financeiro', 'excluir')
  );

CREATE INDEX payables_store_due_idx ON public.payables (store_id, due_date);
CREATE INDEX payables_store_status_idx ON public.payables (store_id, status);
CREATE UNIQUE INDEX payables_po_installment_idx
  ON public.payables (purchase_order_id, installment_number)
  WHERE purchase_order_id IS NOT NULL;

CREATE TRIGGER trg_payables_updated_at
  BEFORE UPDATE ON public.payables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Baixa de título -> gera despesa realizada (+ próxima recorrência)
CREATE OR REPLACE FUNCTION public.pay_payable(
  _payable_id uuid,
  _paid_amount numeric DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _paid_at date DEFAULT NULL,
  _receipt_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p public.payables%ROWTYPE;
  v_expense_id uuid;
  v_cat_name text;
  v_amount numeric;
  v_date date;
  v_next date;
  v_next_id uuid;
BEGIN
  SELECT * INTO p FROM public.payables WHERE id = _payable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Título não encontrado'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), p.store_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta loja';
  END IF;
  IF p.status = 'pago' THEN RAISE EXCEPTION 'Título já está pago'; END IF;

  v_amount := COALESCE(_paid_amount, p.amount);
  v_date := COALESCE(_paid_at, CURRENT_DATE);
  SELECT name INTO v_cat_name FROM public.expense_categories WHERE id = p.category_id;

  INSERT INTO public.expenses (
    store_id, category_id, category_name, description, amount, expense_date,
    payment_method, notes, receipt_url, created_by
  ) VALUES (
    p.store_id, p.category_id, COALESCE(v_cat_name, 'Contas a pagar'),
    p.description, v_amount, v_date,
    COALESCE(_payment_method, p.payment_method, 'dinheiro'),
    NULLIF(concat_ws(' · ', p.notes, 'Baixa de conta a pagar'), ''),
    COALESCE(_receipt_url, p.receipt_url),
    COALESCE(auth.uid(), p.created_by)
  ) RETURNING id INTO v_expense_id;

  UPDATE public.payables SET
    status = 'pago',
    paid_at = (v_date::timestamptz),
    paid_amount = v_amount,
    payment_method = COALESCE(_payment_method, payment_method),
    receipt_url = COALESCE(_receipt_url, receipt_url),
    expense_id = v_expense_id
  WHERE id = p.id;

  -- recorrência: cria o próximo compromisso
  IF p.recurrence <> 'none' THEN
    v_next := CASE p.recurrence
      WHEN 'weekly' THEN p.due_date + INTERVAL '7 days'
      WHEN 'monthly' THEN p.due_date + INTERVAL '1 month'
      WHEN 'yearly' THEN p.due_date + INTERVAL '1 year'
    END::date;
    INSERT INTO public.payables (
      store_id, supplier_id, category_id, description, amount, due_date,
      recurrence, payment_method, notes, created_by
    ) VALUES (
      p.store_id, p.supplier_id, p.category_id, p.description, p.amount, v_next,
      p.recurrence, p.payment_method, p.notes, COALESCE(auth.uid(), p.created_by)
    ) RETURNING id INTO v_next_id;
  END IF;

  RETURN jsonb_build_object(
    'payable_id', p.id, 'expense_id', v_expense_id,
    'paid_amount', v_amount, 'next_payable_id', v_next_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_payable(uuid, numeric, text, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pay_payable(uuid, numeric, text, date, text) TO authenticated;

-- Compras a prazo geram títulos automaticamente
CREATE OR REPLACE FUNCTION public.tg_purchase_order_payables()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cat uuid;
  v_installments int;
  i int;
  v_each numeric;
BEGIN
  IF NEW.status = 'cancelado' THEN
    DELETE FROM public.payables
      WHERE purchase_order_id = NEW.id AND status <> 'pago';
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payment_status, '') <> 'a_pagar'
     OR NEW.due_date IS NULL
     OR COALESCE(NEW.total_cost, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.payables WHERE purchase_order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cat FROM public.expense_categories
   WHERE store_id = NEW.store_id AND name = 'Compra de Mercadorias' LIMIT 1;

  v_installments := 1;
  v_each := ROUND(NEW.total_cost::numeric / v_installments, 2);

  FOR i IN 1..v_installments LOOP
    INSERT INTO public.payables (
      store_id, supplier_id, category_id, purchase_order_id, description,
      amount, due_date, installment_number, total_installments,
      payment_method, created_by
    ) VALUES (
      NEW.store_id, NEW.supplier_id, v_cat, NEW.id,
      concat('Compra ', COALESCE(NEW.supplier, 'fornecedor'), ' — pedido de compra'),
      v_each, (NEW.due_date + ((i - 1) || ' month')::interval)::date,
      i, v_installments, NEW.payment_method, NEW.created_by
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_order_payables
  AFTER INSERT OR UPDATE OF payment_status, due_date, total_cost, status
  ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_purchase_order_payables();

-- Job diário: marca vencidos + alertas
CREATE OR REPLACE FUNCTION public.payables_daily_job()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_overdue int := 0;
  v_alerts int := 0;
  r record;
BEGIN
  UPDATE public.payables
     SET status = 'vencido'
   WHERE status = 'aberto' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  FOR r IN
    SELECT store_id,
           COUNT(*) FILTER (WHERE due_date = CURRENT_DATE) AS hoje,
           COALESCE(SUM(amount) FILTER (WHERE due_date = CURRENT_DATE), 0) AS valor_hoje,
           COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) AS vencidas,
           COALESCE(SUM(amount) FILTER (WHERE due_date < CURRENT_DATE), 0) AS valor_vencido
      FROM public.payables
     WHERE status IN ('aberto','vencido')
     GROUP BY store_id
  LOOP
    IF r.hoje > 0 AND NOT EXISTS (
      SELECT 1 FROM public.alerts
       WHERE store_id = r.store_id AND type = 'contas_vencendo_hoje'
         AND created_at::date = CURRENT_DATE
    ) THEN
      INSERT INTO public.alerts (store_id, type, severity, title, message, link, metadata)
      VALUES (r.store_id, 'contas_vencendo_hoje', 'warning',
              'Contas vencem hoje',
              format('%s conta(s) totalizando R$ %s vencem hoje.', r.hoje, to_char(r.valor_hoje, 'FM999G999D00')),
              '/painel/financeiro?tab=pagar',
              jsonb_build_object('qtd', r.hoje, 'valor', r.valor_hoje));
      v_alerts := v_alerts + 1;
    END IF;

    IF r.vencidas > 0 AND NOT EXISTS (
      SELECT 1 FROM public.alerts
       WHERE store_id = r.store_id AND type = 'contas_vencidas'
         AND created_at::date = CURRENT_DATE
    ) THEN
      INSERT INTO public.alerts (store_id, type, severity, title, message, link, metadata)
      VALUES (r.store_id, 'contas_vencidas', 'danger',
              'Contas em atraso',
              format('%s conta(s) em atraso, totalizando R$ %s.', r.vencidas, to_char(r.valor_vencido, 'FM999G999D00')),
              '/painel/financeiro?tab=pagar',
              jsonb_build_object('qtd', r.vencidas, 'valor', r.valor_vencido));
      v_alerts := v_alerts + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('marcadas_vencidas', v_overdue, 'alertas', v_alerts, 'ran_at', now());
END;
$$;

-- ---------- 1.4 TAXAS DE MAQUININHA ----------
CREATE TABLE public.card_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('credito','debito','pix')),
  installments_from integer NOT NULL DEFAULT 1 CHECK (installments_from >= 1),
  installments_to integer NOT NULL DEFAULT 1 CHECK (installments_to >= 1),
  fee_pct numeric(6,3) NOT NULL DEFAULT 0 CHECK (fee_pct >= 0),
  fee_fixed_cents integer NOT NULL DEFAULT 0 CHECK (fee_fixed_cents >= 0),
  receive_days integer NOT NULL DEFAULT 1 CHECK (receive_days >= 0),
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (installments_to >= installments_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_fee_rules TO authenticated;
GRANT ALL ON public.card_fee_rules TO service_role;

ALTER TABLE public.card_fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_fee_rules_select" ON public.card_fee_rules FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "card_fee_rules_write" ON public.card_fee_rules FOR ALL TO authenticated
  USING (
    public.is_owner(auth.uid(), store_id)
    OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
    OR public.has_permission(auth.uid(), store_id, 'financeiro', 'editar')
  )
  WITH CHECK (
    public.is_owner(auth.uid(), store_id)
    OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
    OR public.has_permission(auth.uid(), store_id, 'financeiro', 'editar')
  );

CREATE INDEX card_fee_rules_lookup_idx
  ON public.card_fee_rules (store_id, payment_method, installments_from, installments_to);

CREATE TRIGGER trg_card_fee_rules_updated_at
  BEFORE UPDATE ON public.card_fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS fee_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS fee_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS expected_receipt_date date,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_amount numeric(14,2);

CREATE INDEX IF NOT EXISTS sale_payments_expected_receipt_idx
  ON public.sale_payments (store_id, expected_receipt_date)
  WHERE received_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_sale_payment_card_fee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rule public.card_fee_rules%ROWTYPE;
  v_inst int := GREATEST(COALESCE(NEW.installments, 1), 1);
  v_base date := COALESCE(NEW.created_at::date, CURRENT_DATE);
BEGIN
  IF NEW.method NOT IN ('credito','debito','pix') THEN
    NEW.fee_pct := NULL;
    NEW.fee_amount := 0;
    NEW.net_amount := NEW.amount;
    NEW.expected_receipt_date := v_base;
    RETURN NEW;
  END IF;

  SELECT * INTO rule FROM public.card_fee_rules
   WHERE store_id = NEW.store_id
     AND payment_method = NEW.method
     AND v_inst BETWEEN installments_from AND installments_to
   ORDER BY (installments_to - installments_from) ASC
   LIMIT 1;

  IF NOT FOUND THEN
    NEW.fee_pct := NULL;
    NEW.fee_amount := 0;
    NEW.net_amount := NEW.amount;
    NEW.expected_receipt_date := v_base;
    RETURN NEW;
  END IF;

  NEW.fee_pct := rule.fee_pct;
  NEW.fee_amount := ROUND(NEW.amount * rule.fee_pct / 100.0, 2) + (rule.fee_fixed_cents / 100.0);
  NEW.net_amount := ROUND(NEW.amount - NEW.fee_amount, 2);
  NEW.expected_receipt_date := v_base + rule.receive_days;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sale_payment_card_fee
  BEFORE INSERT OR UPDATE OF amount, method, installments
  ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_sale_payment_card_fee();

-- Backfill: pagamentos existentes sem líquido
UPDATE public.sale_payments
   SET net_amount = amount,
       expected_receipt_date = created_at::date
 WHERE net_amount IS NULL;

-- Conciliação de recebimento de cartão
CREATE OR REPLACE FUNCTION public.confirm_card_receipt(
  _payment_id uuid,
  _received_amount numeric,
  _received_at date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  sp public.sale_payments%ROWTYPE;
BEGIN
  SELECT * INTO sp FROM public.sale_payments WHERE id = _payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), sp.store_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta loja';
  END IF;
  IF _received_amount IS NULL OR _received_amount < 0 THEN
    RAISE EXCEPTION 'Valor recebido inválido';
  END IF;

  UPDATE public.sale_payments
     SET received_amount = _received_amount,
         received_at = COALESCE(_received_at, CURRENT_DATE)::timestamptz
   WHERE id = _payment_id;

  RETURN jsonb_build_object(
    'payment_id', _payment_id,
    'esperado', sp.net_amount,
    'recebido', _received_amount,
    'divergencia', ROUND(_received_amount - COALESCE(sp.net_amount, sp.amount), 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_card_receipt(uuid, numeric, date) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_card_receipt(uuid, numeric, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.card_fees_report(
  _store_id uuid, _from date, _to date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta loja';
  END IF;

  SELECT jsonb_build_object(
    'total_bruto', COALESCE(SUM(amount), 0),
    'total_taxa', COALESCE(SUM(fee_amount), 0),
    'total_liquido', COALESCE(SUM(COALESCE(net_amount, amount)), 0),
    'taxa_media_pct', CASE WHEN COALESCE(SUM(amount),0) > 0
        THEN ROUND(SUM(fee_amount) * 100.0 / SUM(amount), 2) ELSE 0 END,
    'a_receber', COALESCE(SUM(COALESCE(net_amount, amount)) FILTER (WHERE received_at IS NULL), 0),
    'divergencia', COALESCE(SUM(received_amount - COALESCE(net_amount, amount)) FILTER (WHERE received_at IS NOT NULL), 0),
    'por_metodo', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'bruto')::numeric DESC) FROM (
        SELECT jsonb_build_object(
          'method', method,
          'bruto', SUM(amount),
          'taxa', SUM(fee_amount),
          'liquido', SUM(COALESCE(net_amount, amount)),
          'qtd', COUNT(*)
        ) AS x
        FROM public.sale_payments
        WHERE store_id = _store_id
          AND method IN ('credito','debito','pix')
          AND created_at::date BETWEEN _from AND _to
        GROUP BY method
      ) s
    ), '[]'::jsonb)
  ) INTO v
  FROM public.sale_payments
  WHERE store_id = _store_id
    AND method IN ('credito','debito','pix')
    AND created_at::date BETWEEN _from AND _to;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.card_fees_report(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.card_fees_report(uuid, date, date) TO authenticated;

-- ---------- 1.2 FLUXO DE CAIXA PROJETADO ----------
CREATE OR REPLACE FUNCTION public.cash_flow_projection(
  _store_id uuid, _days integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_open numeric := 0;
  v_days int := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  v_result jsonb;
  v_first_negative date;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta loja';
  END IF;

  SELECT COALESCE(cs.opening_amount, 0)
         + COALESCE((SELECT SUM(CASE WHEN cm.type = 'saida' THEN -cm.amount ELSE cm.amount END)
                       FROM public.cash_movements cm WHERE cm.session_id = cs.id), 0)
    INTO v_open
    FROM public.cash_sessions cs
   WHERE cs.store_id = _store_id AND cs.status = 'aberta'
   ORDER BY cs.opened_at DESC LIMIT 1;

  v_open := COALESCE(v_open, 0);

  WITH dias AS (
    SELECT generate_series(CURRENT_DATE, CURRENT_DATE + (v_days - 1), '1 day')::date AS d
  ),
  ent_crediario AS (
    SELECT due_date AS d, SUM(amount - COALESCE(paid_amount, 0)) AS v
      FROM public.sale_receivables
     WHERE store_id = _store_id AND status <> 'pago'
       AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (v_days - 1)
     GROUP BY due_date
  ),
  ent_cartao AS (
    SELECT expected_receipt_date AS d, SUM(COALESCE(net_amount, amount)) AS v
      FROM public.sale_payments
     WHERE store_id = _store_id AND received_at IS NULL
       AND method IN ('credito','debito','pix')
       AND expected_receipt_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (v_days - 1)
     GROUP BY expected_receipt_date
  ),
  saidas AS (
    SELECT GREATEST(due_date, CURRENT_DATE) AS d, SUM(amount) AS v
      FROM public.payables
     WHERE store_id = _store_id AND status IN ('aberto','vencido')
       AND due_date <= CURRENT_DATE + (v_days - 1)
     GROUP BY GREATEST(due_date, CURRENT_DATE)
  ),
  base AS (
    SELECT dias.d,
           COALESCE(ec.v, 0) AS entradas_crediario,
           COALESCE(ek.v, 0) AS entradas_cartao,
           COALESCE(s.v, 0)  AS saidas
      FROM dias
      LEFT JOIN ent_crediario ec ON ec.d = dias.d
      LEFT JOIN ent_cartao ek ON ek.d = dias.d
      LEFT JOIN saidas s ON s.d = dias.d
  ),
  acc AS (
    SELECT d, entradas_crediario, entradas_cartao, saidas,
           (entradas_crediario + entradas_cartao - saidas) AS liquido,
           v_open + SUM(entradas_crediario + entradas_cartao - saidas)
             OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado
      FROM base
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_open,
    'dias', COALESCE(jsonb_agg(jsonb_build_object(
        'data', d,
        'entradas_crediario', entradas_crediario,
        'entradas_cartao', entradas_cartao,
        'entradas', entradas_crediario + entradas_cartao,
        'saidas', saidas,
        'liquido', liquido,
        'acumulado', ROUND(acumulado, 2)
      ) ORDER BY d), '[]'::jsonb),
    'total_entradas', COALESCE(SUM(entradas_crediario + entradas_cartao), 0),
    'total_saidas', COALESCE(SUM(saidas), 0),
    'saldo_final', ROUND(COALESCE(MAX(acumulado) FILTER (WHERE d = CURRENT_DATE + (v_days - 1)), v_open), 2),
    'primeiro_dia_negativo', (SELECT MIN(d) FROM acc WHERE acumulado < 0)
  ) INTO v_result
  FROM acc;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.cash_flow_projection(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.cash_flow_projection(uuid, integer) TO authenticated;

-- ---------- 1.3 DRE GERENCIAL ----------
CREATE OR REPLACE FUNCTION public.dre_gerencial(
  _store_id uuid, _from date, _to date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_receita_vendas numeric := 0;
  v_devolucoes numeric := 0;
  v_receita_os numeric := 0;
  v_cmv numeric := 0;
  v_custo_pecas_os numeric := 0;
  v_taxas numeric := 0;
  v_despesas jsonb := '[]'::jsonb;
  v_despesa_total numeric := 0;
  v_receita_liquida numeric;
  v_lucro_bruto numeric;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta loja';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_receita_vendas
    FROM public.sales
   WHERE store_id = _store_id AND created_at::date BETWEEN _from AND _to;

  SELECT COALESCE(SUM(total_returned), 0) INTO v_devolucoes
    FROM public.sale_returns
   WHERE store_id = _store_id AND created_at::date BETWEEN _from AND _to;

  SELECT COALESCE(SUM(COALESCE(net_value, total_value)), 0) INTO v_receita_os
    FROM public.service_orders
   WHERE store_id = _store_id AND created_at::date BETWEEN _from AND _to
     AND status <> 'cancelado';

  SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost, 0)), 0) INTO v_cmv
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
   WHERE s.store_id = _store_id AND s.created_at::date BETWEEN _from AND _to;

  SELECT COALESCE(SUM(sop.qty * COALESCE(sop.unit_cost, 0)), 0) INTO v_custo_pecas_os
    FROM public.service_order_parts sop
    JOIN public.service_orders so ON so.id = sop.service_order_id
   WHERE sop.store_id = _store_id AND so.created_at::date BETWEEN _from AND _to
     AND so.status <> 'cancelado';

  SELECT COALESCE(SUM(fee_amount), 0) INTO v_taxas
    FROM public.sale_payments
   WHERE store_id = _store_id AND created_at::date BETWEEN _from AND _to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('categoria', cat, 'valor', v) ORDER BY v DESC), '[]'::jsonb),
         COALESCE(SUM(v), 0)
    INTO v_despesas, v_despesa_total
    FROM (
      SELECT COALESCE(NULLIF(category_name, ''), 'Sem categoria') AS cat, SUM(amount) AS v
        FROM public.expenses
       WHERE store_id = _store_id AND expense_date BETWEEN _from AND _to
       GROUP BY 1
    ) t;

  v_receita_liquida := v_receita_vendas - v_devolucoes + v_receita_os;
  v_lucro_bruto := v_receita_liquida - v_cmv - v_custo_pecas_os;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('de', _from, 'ate', _to),
    'receita_vendas', v_receita_vendas,
    'devolucoes', v_devolucoes,
    'receita_os', v_receita_os,
    'receita_liquida', v_receita_liquida,
    'cmv', v_cmv,
    'custo_pecas_os', v_custo_pecas_os,
    'lucro_bruto', v_lucro_bruto,
    'margem_bruta_pct', CASE WHEN v_receita_liquida > 0
      THEN ROUND(v_lucro_bruto * 100.0 / v_receita_liquida, 2) ELSE 0 END,
    'despesas', v_despesas,
    'despesas_total', v_despesa_total,
    'taxas_cartao', v_taxas,
    'resultado_operacional', ROUND(v_lucro_bruto - v_despesa_total - v_taxas, 2),
    'margem_operacional_pct', CASE WHEN v_receita_liquida > 0
      THEN ROUND((v_lucro_bruto - v_despesa_total - v_taxas) * 100.0 / v_receita_liquida, 2) ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dre_gerencial(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.dre_gerencial(uuid, date, date) TO authenticated;
