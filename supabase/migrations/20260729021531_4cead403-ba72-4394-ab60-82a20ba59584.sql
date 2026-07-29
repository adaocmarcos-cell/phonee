-- ============ METAS ============
CREATE TABLE public.store_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  metric text NOT NULL CHECK (metric IN ('faturamento','lucro','vendas_qtd','os_qtd','ticket_medio')),
  seller_id uuid NULL,
  target_value numeric NOT NULL DEFAULT 0 CHECK (target_value >= 0),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_goals TO authenticated;
GRANT ALL ON public.store_goals TO service_role;
ALTER TABLE public.store_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_goals_select ON public.store_goals FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY store_goals_write ON public.store_goals FOR ALL TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::app_role) OR public.has_permission(auth.uid(), store_id, 'configuracoes', 'editar'))
  WITH CHECK (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::app_role) OR public.has_permission(auth.uid(), store_id, 'configuracoes', 'editar'));

CREATE UNIQUE INDEX store_goals_store_uq ON public.store_goals (store_id, period_month, metric) WHERE seller_id IS NULL;
CREATE UNIQUE INDEX store_goals_seller_uq ON public.store_goals (store_id, period_month, metric, seller_id) WHERE seller_id IS NOT NULL;
CREATE INDEX store_goals_store_month_idx ON public.store_goals (store_id, period_month);

CREATE TRIGGER trg_store_goals_updated BEFORE UPDATE ON public.store_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AVALIACAO DE SEMINOVOS ============
CREATE TABLE public.appraisal_settings (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  target_margin_pct numeric NOT NULL DEFAULT 30 CHECK (target_margin_pct >= 0 AND target_margin_pct < 95),
  condition_factors jsonb NOT NULL DEFAULT '{"otimo":1.0,"bom":0.9,"regular":0.78,"com_defeito":0.55}'::jsonb,
  battery_threshold int NOT NULL DEFAULT 85 CHECK (battery_threshold BETWEEN 0 AND 100),
  battery_penalty_pct numeric NOT NULL DEFAULT 8 CHECK (battery_penalty_pct >= 0 AND battery_penalty_pct <= 50),
  lookback_days int NOT NULL DEFAULT 180 CHECK (lookback_days BETWEEN 30 AND 730),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appraisal_settings TO authenticated;
GRANT ALL ON public.appraisal_settings TO service_role;
ALTER TABLE public.appraisal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY appraisal_settings_select ON public.appraisal_settings FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY appraisal_settings_write ON public.appraisal_settings FOR ALL TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::app_role) OR public.has_permission(auth.uid(), store_id, 'configuracoes', 'editar'))
  WITH CHECK (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::app_role) OR public.has_permission(auth.uid(), store_id, 'configuracoes', 'editar'));

CREATE TRIGGER trg_appraisal_settings_updated BEFORE UPDATE ON public.appraisal_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ORCAMENTOS ============
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  quote_number int,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','aceito','recusado','expirado','convertido')),
  valid_until date NOT NULL DEFAULT (CURRENT_DATE + 7),
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  sale_id uuid NULL REFERENCES public.sales(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  is_service boolean NOT NULL DEFAULT false,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY quotes_insert ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY quotes_update ON public.quotes FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY quotes_delete ON public.quotes FOR DELETE TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::app_role));

CREATE POLICY quote_items_select ON public.quote_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.user_has_store_access(auth.uid(), q.store_id)));
CREATE POLICY quote_items_insert ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.user_has_store_access(auth.uid(), q.store_id)));
CREATE POLICY quote_items_update ON public.quote_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.user_has_store_access(auth.uid(), q.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.user_has_store_access(auth.uid(), q.store_id)));
CREATE POLICY quote_items_delete ON public.quote_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.user_has_store_access(auth.uid(), q.store_id)));

CREATE INDEX quotes_store_created_idx ON public.quotes (store_id, created_at DESC);
CREATE INDEX quotes_status_idx ON public.quotes (store_id, status);
CREATE INDEX quote_items_quote_idx ON public.quote_items (quote_id);

CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.assign_quote_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    SELECT COALESCE(MAX(quote_number), 0) + 1 INTO NEW.quote_number
    FROM public.quotes WHERE store_id = NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quotes_number BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.assign_quote_number();

-- ============ RPC: AVALIACAO DE SEMINOVO ============
CREATE OR REPLACE FUNCTION public.appraise_device(
  _store_id uuid,
  _model text,
  _condition device_condition,
  _battery_health int DEFAULT NULL,
  _storage text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v_term text;
  v_ref numeric := 0;
  v_samples int := 0;
  v_source text := 'sem_referencia';
  v_factor numeric := 1;
  v_battery_factor numeric := 1;
  v_margin numeric;
  v_estimated_sale numeric;
  v_entry numeric;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;

  SELECT * INTO s FROM public.appraisal_settings WHERE store_id = _store_id;
  IF NOT FOUND THEN
    s := ROW(_store_id, 30::numeric, '{"otimo":1.0,"bom":0.9,"regular":0.78,"com_defeito":0.55}'::jsonb, 85, 8::numeric, 180, now())::public.appraisal_settings;
  END IF;

  v_term := '%' || trim(coalesce(_model, '')) || '%';
  IF trim(coalesce(_model, '')) = '' THEN
    RETURN jsonb_build_object('erro', 'Informe o modelo do aparelho');
  END IF;

  -- 1) preco medio realmente praticado em vendas do mesmo modelo
  SELECT round(avg(si.unit_price - COALESCE(si.discount_amount, 0) / GREATEST(si.quantity, 1)), 2), count(*)
    INTO v_ref, v_samples
  FROM public.sale_items si
  JOIN public.sales sa ON sa.id = si.sale_id
  WHERE sa.store_id = _store_id
    AND sa.created_at >= now() - make_interval(days => s.lookback_days)
    AND si.is_service = false
    AND (si.name ILIKE v_term OR si.model ILIKE v_term OR si.description ILIKE v_term);

  IF COALESCE(v_samples, 0) > 0 AND COALESCE(v_ref, 0) > 0 THEN
    v_source := 'historico_vendas';
  ELSE
    -- 2) preco de tabela do estoque atual
    SELECT round(avg(p.sale_price), 2), count(*) INTO v_ref, v_samples
    FROM public.products p
    WHERE p.store_id = _store_id
      AND p.item_kind = 'aparelho'
      AND p.sale_price > 0
      AND p.name ILIKE v_term;
    IF COALESCE(v_samples, 0) > 0 AND COALESCE(v_ref, 0) > 0 THEN
      v_source := 'tabela_estoque';
    ELSE
      -- 3) trade-ins anteriores do mesmo modelo
      SELECT round(avg(t.intended_sale_value), 2), count(*) INTO v_ref, v_samples
      FROM public.trade_ins t
      WHERE t.store_id = _store_id AND t.intended_sale_value > 0 AND t.model ILIKE v_term;
      IF COALESCE(v_samples, 0) > 0 AND COALESCE(v_ref, 0) > 0 THEN
        v_source := 'trocas_anteriores';
      ELSE
        v_ref := 0; v_samples := 0;
      END IF;
    END IF;
  END IF;

  v_factor := COALESCE((s.condition_factors ->> _condition::text)::numeric, 0.8);
  IF _battery_health IS NOT NULL AND _battery_health > 0 AND _battery_health < s.battery_threshold THEN
    v_battery_factor := 1 - (s.battery_penalty_pct / 100.0);
  END IF;

  v_margin := s.target_margin_pct;
  v_estimated_sale := round(COALESCE(v_ref, 0) * v_factor * v_battery_factor, 2);
  v_entry := round(v_estimated_sale * (1 - v_margin / 100.0), 2);

  RETURN jsonb_build_object(
    'modelo', _model,
    'armazenamento', _storage,
    'estado', _condition::text,
    'referencia', COALESCE(v_ref, 0),
    'amostras', COALESCE(v_samples, 0),
    'fonte', v_source,
    'fator_estado', v_factor,
    'fator_bateria', v_battery_factor,
    'margem_alvo_pct', v_margin,
    'venda_estimada', v_estimated_sale,
    'entrada_sugerida', GREATEST(v_entry, 0),
    'lucro_estimado', GREATEST(v_estimated_sale - v_entry, 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.appraise_device(uuid, text, device_condition, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.appraise_device(uuid, text, device_condition, int, text) TO authenticated;

-- ============ RPC: CRIAR ORCAMENTO ============
CREATE OR REPLACE FUNCTION public.create_quote(
  _store_id uuid,
  _items jsonb,
  _customer_id uuid DEFAULT NULL,
  _customer_name text DEFAULT NULL,
  _customer_phone text DEFAULT NULL,
  _discount numeric DEFAULT 0,
  _valid_days int DEFAULT 7,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote_id uuid;
  v_number int;
  it jsonb;
  v_subtotal numeric := 0;
  v_line numeric;
  v_count int := 0;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item no orçamento';
  END IF;
  IF COALESCE(_discount, 0) < 0 THEN
    RAISE EXCEPTION 'Desconto inválido';
  END IF;

  INSERT INTO public.quotes (store_id, customer_id, customer_name, customer_phone, valid_until, discount, notes, created_by)
  VALUES (_store_id, _customer_id, NULLIF(trim(COALESCE(_customer_name, '')), ''), NULLIF(trim(COALESCE(_customer_phone, '')), ''),
          CURRENT_DATE + GREATEST(COALESCE(_valid_days, 7), 0), COALESCE(_discount, 0),
          NULLIF(trim(COALESCE(_notes, '')), ''), auth.uid())
  RETURNING id, quote_number INTO v_quote_id, v_number;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF COALESCE(trim(it ->> 'description'), '') = '' THEN
      RAISE EXCEPTION 'Item sem descrição';
    END IF;
    IF COALESCE((it ->> 'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida em "%"', it ->> 'description';
    END IF;
    IF COALESCE((it ->> 'unit_price')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Preço inválido em "%"', it ->> 'description';
    END IF;

    v_line := round(COALESCE((it ->> 'quantity')::numeric, 1) * COALESCE((it ->> 'unit_price')::numeric, 0)
              - COALESCE((it ->> 'discount_amount')::numeric, 0), 2);
    IF v_line < 0 THEN
      RAISE EXCEPTION 'Desconto do item maior que o valor em "%"', it ->> 'description';
    END IF;

    INSERT INTO public.quote_items (quote_id, product_id, description, is_service, quantity, unit_price, discount_amount, total)
    VALUES (v_quote_id, NULLIF(it ->> 'product_id', '')::uuid, trim(it ->> 'description'),
            COALESCE((it ->> 'is_service')::boolean, false),
            COALESCE((it ->> 'quantity')::numeric, 1),
            COALESCE((it ->> 'unit_price')::numeric, 0),
            COALESCE((it ->> 'discount_amount')::numeric, 0),
            v_line);

    v_subtotal := v_subtotal + v_line;
    v_count := v_count + 1;
  END LOOP;

  IF COALESCE(_discount, 0) > v_subtotal THEN
    RAISE EXCEPTION 'Desconto maior que o valor do orçamento';
  END IF;

  UPDATE public.quotes
     SET subtotal = v_subtotal, total = round(v_subtotal - COALESCE(_discount, 0), 2)
   WHERE id = v_quote_id;

  RETURN jsonb_build_object('quote_id', v_quote_id, 'quote_number', v_number, 'itens', v_count,
                            'subtotal', v_subtotal, 'total', round(v_subtotal - COALESCE(_discount, 0), 2));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_quote(uuid, jsonb, uuid, text, text, numeric, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_quote(uuid, jsonb, uuid, text, text, numeric, int, text) TO authenticated;

-- ============ RPC: STATUS DO ORCAMENTO ============
CREATE OR REPLACE FUNCTION public.quote_set_status(_quote_id uuid, _status text, _sale_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q record;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = _quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), q.store_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;
  IF _status NOT IN ('aberto','aceito','recusado','expirado','convertido') THEN
    RAISE EXCEPTION 'Situação inválida';
  END IF;
  IF _sale_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sales sa WHERE sa.id = _sale_id AND sa.store_id = q.store_id
  ) THEN
    RAISE EXCEPTION 'Venda inválida para esta loja';
  END IF;

  UPDATE public.quotes
     SET status = _status,
         sale_id = COALESCE(_sale_id, sale_id)
   WHERE id = _quote_id;

  RETURN jsonb_build_object('ok', true, 'status', _status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quote_set_status(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.quote_set_status(uuid, text, uuid) TO authenticated;

-- ============ RPC: PROGRESSO DAS METAS ============
CREATE OR REPLACE FUNCTION public.goals_progress(_store_id uuid, _month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta loja';
  END IF;

  v_start := date_trunc('month', COALESCE(_month, CURRENT_DATE))::date;
  v_end := (v_start + INTERVAL '1 month')::date;

  SELECT COALESCE(jsonb_agg(x ORDER BY x ->> 'metric', x ->> 'seller_id'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', g.id,
      'metric', g.metric,
      'seller_id', g.seller_id,
      'seller_name', pr.full_name,
      'target_value', g.target_value,
      'realizado', r.valor,
      'progresso_pct', CASE WHEN g.target_value > 0 THEN round((r.valor / g.target_value) * 100, 1) ELSE 0 END
    ) AS x
    FROM public.store_goals g
    LEFT JOIN public.profiles pr ON pr.id = g.seller_id
    CROSS JOIN LATERAL (
      SELECT CASE g.metric
        WHEN 'faturamento' THEN (
          SELECT COALESCE(SUM(sa.total - COALESCE(sa.returned_total, 0)), 0)
          FROM public.sales sa
          WHERE sa.store_id = _store_id AND sa.created_at >= v_start AND sa.created_at < v_end
            AND (g.seller_id IS NULL OR sa.seller_id = g.seller_id))
        WHEN 'vendas_qtd' THEN (
          SELECT COALESCE(COUNT(*), 0)::numeric
          FROM public.sales sa
          WHERE sa.store_id = _store_id AND sa.created_at >= v_start AND sa.created_at < v_end
            AND (g.seller_id IS NULL OR sa.seller_id = g.seller_id))
        WHEN 'ticket_medio' THEN (
          SELECT COALESCE(round(AVG(sa.total - COALESCE(sa.returned_total, 0)), 2), 0)
          FROM public.sales sa
          WHERE sa.store_id = _store_id AND sa.created_at >= v_start AND sa.created_at < v_end
            AND (g.seller_id IS NULL OR sa.seller_id = g.seller_id))
        WHEN 'lucro' THEN (
          SELECT COALESCE(SUM(si.total - COALESCE(si.unit_cost, 0) * si.quantity), 0)
          FROM public.sale_items si
          JOIN public.sales sa ON sa.id = si.sale_id
          WHERE sa.store_id = _store_id AND sa.created_at >= v_start AND sa.created_at < v_end
            AND (g.seller_id IS NULL OR sa.seller_id = g.seller_id))
        WHEN 'os_qtd' THEN (
          SELECT COALESCE(COUNT(*), 0)::numeric
          FROM public.service_orders so
          WHERE so.store_id = _store_id AND so.created_at >= v_start AND so.created_at < v_end
            AND so.status <> 'cancelado'
            AND (g.seller_id IS NULL OR so.technician_id = g.seller_id))
        ELSE 0 END AS valor
    ) r
    WHERE g.store_id = _store_id AND g.period_month = v_start
  ) t;

  RETURN jsonb_build_object('mes', v_start, 'metas', v_result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.goals_progress(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.goals_progress(uuid, date) TO authenticated;