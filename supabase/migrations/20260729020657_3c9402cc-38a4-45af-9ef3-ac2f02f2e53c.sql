-- ═══ FASE 2 — PÓS-VENDA AUTOMATIZADO ═══

-- 1) Ampliar event_key dos templates para os gatilhos de CRM
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_event_chk;
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_event_chk CHECK (event_key = ANY (ARRAY[
  'os_criada','orcamento_pronto','orcamento_aprovado','aparelho_pronto','os_entregue_garantia',
  'venda_concluida','cobranca_pendente','cobranca_vencida','encomenda_chegou',
  'aniversario','inatividade_90d','ciclo_upgrade_12m','garantia_vencendo_15d','pos_venda_7d','os_entregue_3d'
]));

-- 2) Log de WhatsApp passa a aceitar mensagens ligadas a cliente (CRM)
ALTER TABLE public.whatsapp_messages_log ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.whatsapp_messages_log DROP CONSTRAINT IF EXISTS whatsapp_log_target_chk;
ALTER TABLE public.whatsapp_messages_log ADD CONSTRAINT whatsapp_log_target_chk
  CHECK (os_id IS NOT NULL OR sale_id IS NOT NULL OR customer_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS whatsapp_log_customer_idx ON public.whatsapp_messages_log (customer_id, created_at DESC) WHERE customer_id IS NOT NULL;

-- 3) Réguas de relacionamento
CREATE TABLE public.crm_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  trigger_key text NOT NULL CHECK (trigger_key = ANY (ARRAY['aniversario','inatividade_90d','ciclo_upgrade_12m','garantia_vencendo_15d','pos_venda_7d','os_entregue_3d'])),
  enabled boolean NOT NULL DEFAULT true,
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  send_hour smallint NOT NULL DEFAULT 9 CHECK (send_hour BETWEEN 0 AND 23),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, trigger_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_rules TO authenticated;
GRANT ALL ON public.crm_rules TO service_role;
ALTER TABLE public.crm_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_rules_select ON public.crm_rules FOR SELECT TO authenticated USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY crm_rules_insert ON public.crm_rules FOR INSERT TO authenticated WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY crm_rules_update ON public.crm_rules FOR UPDATE TO authenticated USING (public.user_has_store_access(auth.uid(), store_id)) WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY crm_rules_delete ON public.crm_rules FOR DELETE TO authenticated USING (public.user_has_store_access(auth.uid(), store_id));
CREATE TRIGGER crm_rules_touch BEFORE UPDATE ON public.crm_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Fila diária de pós-venda
CREATE TABLE public.crm_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.crm_rules(id) ON DELETE SET NULL,
  trigger_key text NOT NULL,
  queue_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  phone text,
  reason text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  os_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status = ANY (ARRAY['pendente','enviado','pulado'])),
  sent_at timestamptz,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_queue_dedupe_idx ON public.crm_queue (store_id, trigger_key, customer_id, queue_date) WHERE customer_id IS NOT NULL;
CREATE INDEX crm_queue_store_date_idx ON public.crm_queue (store_id, queue_date DESC, status);
CREATE INDEX crm_queue_sent_idx ON public.crm_queue (store_id, sent_at) WHERE status = 'enviado';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_queue TO authenticated;
GRANT ALL ON public.crm_queue TO service_role;
ALTER TABLE public.crm_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_queue_select ON public.crm_queue FOR SELECT TO authenticated USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY crm_queue_insert ON public.crm_queue FOR INSERT TO authenticated WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY crm_queue_update ON public.crm_queue FOR UPDATE TO authenticated USING (public.user_has_store_access(auth.uid(), store_id)) WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY crm_queue_delete ON public.crm_queue FOR DELETE TO authenticated USING (public.user_has_store_access(auth.uid(), store_id));
CREATE TRIGGER crm_queue_touch BEFORE UPDATE ON public.crm_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Render de placeholders {chave}
CREATE OR REPLACE FUNCTION public.crm_render(_body text, _vars jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; v text; out_text text := coalesce(_body, '');
BEGIN
  FOR k, v IN SELECT key, coalesce(value #>> '{}', '') FROM jsonb_each(coalesce(_vars,'{}'::jsonb)) LOOP
    out_text := replace(out_text, '{' || k || '}', v);
  END LOOP;
  RETURN out_text;
END $$;

-- 6) Textos padrão por gatilho (fallback quando não há template configurado)
CREATE OR REPLACE FUNCTION public.crm_default_body(_trigger text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _trigger
    WHEN 'aniversario' THEN E'Feliz aniversário, {cliente}! 🎉\nA {loja} deseja um dia incrível pra você.\nPassa aqui que temos um mimo especial de aniversário te esperando. 🎁'
    WHEN 'inatividade_90d' THEN E'Oi, {cliente}! Aqui é da {loja}. 👋\nFaz {dias} dias desde a sua última compra e ficamos com saudade.\nChegaram novidades — quer que eu te mande as ofertas da semana?'
    WHEN 'ciclo_upgrade_12m' THEN E'{cliente}, tudo bem? Aqui é da {loja}.\nSeu *{aparelho}* já está com {meses} meses de uso. 📱\nA gente aceita ele como entrada num modelo mais novo — quer que eu faça uma avaliação sem compromisso?'
    WHEN 'garantia_vencendo_15d' THEN E'Oi, {cliente}! Um aviso da {loja}. 🛡\nA garantia do seu *{aparelho}* vence em *{data}*.\nSe estiver com qualquer problema, traga antes do prazo que resolvemos sem custo.'
    WHEN 'pos_venda_7d' THEN E'{cliente}, tudo certo com o seu *{aparelho}*? 😊\nAqui é da {loja}. Faz uma semana da sua compra e queremos saber se está tudo funcionando bem.\nQualquer dúvida, é só chamar!'
    WHEN 'os_entregue_3d' THEN E'Oi, {cliente}! Aqui é da {loja}.\nSeu *{aparelho}* foi entregue há alguns dias — está tudo funcionando certinho depois do reparo?\nSe precisar de algo, estamos por aqui. 🔧'
    ELSE '{cliente}, aqui é da {loja}.' END
$$;

CREATE OR REPLACE FUNCTION public.crm_trigger_label(_trigger text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _trigger
    WHEN 'aniversario' THEN 'Aniversário'
    WHEN 'inatividade_90d' THEN 'Cliente inativo'
    WHEN 'ciclo_upgrade_12m' THEN 'Ciclo de upgrade'
    WHEN 'garantia_vencendo_15d' THEN 'Garantia vencendo'
    WHEN 'pos_venda_7d' THEN 'Pós-venda'
    WHEN 'os_entregue_3d' THEN 'Pós-reparo'
    ELSE _trigger END
$$;

-- 7) Geração da fila do dia para uma loja
CREATE OR REPLACE FUNCTION public.crm_build_queue(_store_id uuid, _date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date := coalesce(_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  r record; loja text; body text; inserted int; total int := 0; per jsonb := '{}'::jsonb;
  inact_days int; upg_months int; war_days int; pv_days int; os_days int;
BEGIN
  SELECT name INTO loja FROM public.stores WHERE id = _store_id;
  IF loja IS NULL THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;

  FOR r IN SELECT * FROM public.crm_rules WHERE store_id = _store_id AND enabled LOOP
    body := coalesce((SELECT t.body FROM public.whatsapp_templates t WHERE t.id = r.template_id AND t.is_active), public.crm_default_body(r.trigger_key));
    inserted := 0;

    IF r.trigger_key = 'aniversario' THEN
      WITH cand AS (
        SELECT c.id, c.name, coalesce(c.whatsapp, c.phone) AS phone
        FROM public.customers c
        WHERE c.store_id = _store_id AND c.birthdate IS NOT NULL
          AND to_char(c.birthdate,'MM-DD') = to_char(d,'MM-DD')
          AND coalesce(c.whatsapp, c.phone) IS NOT NULL
      ), ins AS (
        INSERT INTO public.crm_queue (store_id, rule_id, trigger_key, queue_date, customer_id, customer_name, phone, reason, context, message)
        SELECT _store_id, r.id, r.trigger_key, d, cand.id, cand.name, cand.phone,
               'Aniversário hoje', jsonb_build_object('data', to_char(d,'DD/MM/YYYY')),
               public.crm_render(body, jsonb_build_object('cliente', split_part(cand.name,' ',1), 'loja', loja))
        FROM cand ON CONFLICT DO NOTHING RETURNING 1)
      SELECT count(*) INTO inserted FROM ins;

    ELSIF r.trigger_key = 'inatividade_90d' THEN
      inact_days := coalesce((r.params->>'days')::int, 90);
      WITH last_sale AS (
        SELECT s.customer_id, max(s.created_at) AS last_at
        FROM public.sales s WHERE s.store_id = _store_id AND s.customer_id IS NOT NULL GROUP BY 1
      ), cand AS (
        SELECT c.id, c.name, coalesce(c.whatsapp, c.phone) AS phone,
               (d - (ls.last_at AT TIME ZONE 'America/Sao_Paulo')::date) AS dias
        FROM last_sale ls JOIN public.customers c ON c.id = ls.customer_id
        WHERE coalesce(c.whatsapp, c.phone) IS NOT NULL
          AND (d - (ls.last_at AT TIME ZONE 'America/Sao_Paulo')::date) = inact_days
      ), ins AS (
        INSERT INTO public.crm_queue (store_id, rule_id, trigger_key, queue_date, customer_id, customer_name, phone, reason, context, message)
        SELECT _store_id, r.id, r.trigger_key, d, cand.id, cand.name, cand.phone,
               'Sem comprar há ' || cand.dias || ' dias', jsonb_build_object('dias', cand.dias),
               public.crm_render(body, jsonb_build_object('cliente', split_part(cand.name,' ',1), 'loja', loja, 'dias', cand.dias::text))
        FROM cand ON CONFLICT DO NOTHING RETURNING 1)
      SELECT count(*) INTO inserted FROM ins;

    ELSIF r.trigger_key = 'ciclo_upgrade_12m' THEN
      upg_months := coalesce((r.params->>'months')::int, 12);
      WITH cand AS (
        SELECT DISTINCT ON (s.customer_id) s.customer_id AS cid, c.name, coalesce(c.whatsapp, c.phone) AS phone,
               s.id AS sale_id, si.name AS aparelho, si.total AS valor, s.created_at
        FROM public.sales s
        JOIN public.sale_items si ON si.sale_id = s.id
        LEFT JOIN public.products p ON p.id = si.product_id
        JOIN public.customers c ON c.id = s.customer_id
        WHERE s.store_id = _store_id AND s.customer_id IS NOT NULL
          AND coalesce(c.whatsapp, c.phone) IS NOT NULL
          AND (p.item_kind = 'aparelho' OR si.imei_serial IS NOT NULL)
          AND (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date = (d - (upg_months || ' months')::interval)::date
        ORDER BY s.customer_id, s.created_at DESC
      ), ins AS (
        INSERT INTO public.crm_queue (store_id, rule_id, trigger_key, queue_date, customer_id, customer_name, phone, reason, context, sale_id, message)
        SELECT _store_id, r.id, r.trigger_key, d, cand.cid, cand.name, cand.phone,
               'Comprou ' || cand.aparelho || ' há ' || upg_months || ' meses',
               jsonb_build_object('aparelho', cand.aparelho, 'valor', cand.valor, 'meses', upg_months),
               cand.sale_id,
               public.crm_render(body, jsonb_build_object('cliente', split_part(cand.name,' ',1), 'loja', loja, 'aparelho', cand.aparelho, 'meses', upg_months::text))
        FROM cand ON CONFLICT DO NOTHING RETURNING 1)
      SELECT count(*) INTO inserted FROM ins;

    ELSIF r.trigger_key = 'garantia_vencendo_15d' THEN
      war_days := coalesce((r.params->>'days')::int, 15);
      WITH cand AS (
        SELECT DISTINCT ON (s.customer_id, si.id) s.customer_id AS cid, c.name, coalesce(c.whatsapp, c.phone) AS phone,
               s.id AS sale_id, si.name AS aparelho,
               ((s.created_at AT TIME ZONE 'America/Sao_Paulo')::date + si.warranty_days) AS fim
        FROM public.sales s
        JOIN public.sale_items si ON si.sale_id = s.id
        JOIN public.customers c ON c.id = s.customer_id
        WHERE s.store_id = _store_id AND coalesce(si.warranty_days,0) > 0
          AND coalesce(c.whatsapp, c.phone) IS NOT NULL
          AND ((s.created_at AT TIME ZONE 'America/Sao_Paulo')::date + si.warranty_days) = d + war_days
        ORDER BY s.customer_id, si.id
      ), ins AS (
        INSERT INTO public.crm_queue (store_id, rule_id, trigger_key, queue_date, customer_id, customer_name, phone, reason, context, sale_id, message)
        SELECT _store_id, r.id, r.trigger_key, d, cand.cid, cand.name, cand.phone,
               'Garantia vence em ' || to_char(cand.fim,'DD/MM'),
               jsonb_build_object('aparelho', cand.aparelho, 'data', to_char(cand.fim,'DD/MM/YYYY')),
               cand.sale_id,
               public.crm_render(body, jsonb_build_object('cliente', split_part(cand.name,' ',1), 'loja', loja, 'aparelho', cand.aparelho, 'data', to_char(cand.fim,'DD/MM/YYYY')))
        FROM cand ON CONFLICT DO NOTHING RETURNING 1)
      SELECT count(*) INTO inserted FROM ins;

    ELSIF r.trigger_key = 'pos_venda_7d' THEN
      pv_days := coalesce((r.params->>'days')::int, 7);
      WITH cand AS (
        SELECT DISTINCT ON (s.customer_id) s.customer_id AS cid, c.name, coalesce(c.whatsapp, c.phone) AS phone,
               s.id AS sale_id,
               coalesce((SELECT si.name FROM public.sale_items si WHERE si.sale_id = s.id ORDER BY si.total DESC LIMIT 1), 'produto') AS aparelho
        FROM public.sales s JOIN public.customers c ON c.id = s.customer_id
        WHERE s.store_id = _store_id AND coalesce(c.whatsapp, c.phone) IS NOT NULL
          AND (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date = d - pv_days
        ORDER BY s.customer_id, s.created_at DESC
      ), ins AS (
        INSERT INTO public.crm_queue (store_id, rule_id, trigger_key, queue_date, customer_id, customer_name, phone, reason, context, sale_id, message)
        SELECT _store_id, r.id, r.trigger_key, d, cand.cid, cand.name, cand.phone,
               'Comprou há ' || pv_days || ' dias', jsonb_build_object('aparelho', cand.aparelho, 'dias', pv_days),
               cand.sale_id,
               public.crm_render(body, jsonb_build_object('cliente', split_part(cand.name,' ',1), 'loja', loja, 'aparelho', cand.aparelho, 'dias', pv_days::text))
        FROM cand ON CONFLICT DO NOTHING RETURNING 1)
      SELECT count(*) INTO inserted FROM ins;

    ELSIF r.trigger_key = 'os_entregue_3d' THEN
      os_days := coalesce((r.params->>'days')::int, 3);
      WITH cand AS (
        SELECT DISTINCT ON (o.id) o.id AS os_id, o.customer_id AS cid,
               coalesce(c.name, o.customer_name) AS name,
               coalesce(c.whatsapp, c.phone, o.customer_whatsapp) AS phone,
               trim(coalesce(o.device_brand,'') || ' ' || coalesce(o.device_model,'')) AS aparelho
        FROM public.service_orders o
        LEFT JOIN public.customers c ON c.id = o.customer_id
        WHERE o.store_id = _store_id AND o.status = 'entregue'
          AND coalesce(c.whatsapp, c.phone, o.customer_whatsapp) IS NOT NULL
          AND (o.updated_at AT TIME ZONE 'America/Sao_Paulo')::date = d - os_days
      ), ins AS (
        INSERT INTO public.crm_queue (store_id, rule_id, trigger_key, queue_date, customer_id, customer_name, phone, reason, context, os_id, message)
        SELECT _store_id, r.id, r.trigger_key, d, cand.cid, cand.name, cand.phone,
               'OS entregue há ' || os_days || ' dias', jsonb_build_object('aparelho', cand.aparelho, 'dias', os_days),
               cand.os_id,
               public.crm_render(body, jsonb_build_object('cliente', split_part(cand.name,' ',1), 'loja', loja, 'aparelho', nullif(cand.aparelho,''), 'dias', os_days::text))
        FROM cand ON CONFLICT DO NOTHING RETURNING 1)
      SELECT count(*) INTO inserted FROM ins;
    END IF;

    total := total + coalesce(inserted,0);
    per := per || jsonb_build_object(r.trigger_key, coalesce(inserted,0));
  END LOOP;

  RETURN jsonb_build_object('store_id', _store_id, 'data', d, 'gerados', total, 'por_gatilho', per);
END $$;

REVOKE ALL ON FUNCTION public.crm_build_queue(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_build_queue(uuid, date) TO authenticated, service_role;

-- 8) Job diário
CREATE OR REPLACE FUNCTION public.crm_daily_job()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; total int := 0; lojas int := 0;
BEGIN
  FOR s IN SELECT DISTINCT store_id FROM public.crm_rules WHERE enabled LOOP
    BEGIN
      total := total + coalesce((public.crm_build_queue(s.store_id, NULL)->>'gerados')::int, 0);
      lojas := lojas + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('ran_at', now(), 'lojas', lojas, 'gerados', total);
END $$;
REVOKE ALL ON FUNCTION public.crm_daily_job() FROM public;
GRANT EXECUTE ON FUNCTION public.crm_daily_job() TO service_role;

-- 9) Marcar enviado / pular
CREATE OR REPLACE FUNCTION public.crm_mark_sent(_queue_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  SELECT * INTO q FROM public.crm_queue WHERE id = _queue_id;
  IF q IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), q.store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF q.status = 'enviado' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  UPDATE public.crm_queue SET status = 'enviado', sent_at = now(), sent_by = auth.uid() WHERE id = _queue_id;

  INSERT INTO public.whatsapp_messages_log (store_id, customer_id, sale_id, os_id, event_key, template_id, template_title, phone, message_text, sent_by)
  VALUES (q.store_id, q.customer_id, q.sale_id, q.os_id, q.trigger_key,
          (SELECT r.template_id FROM public.crm_rules r WHERE r.id = q.rule_id),
          public.crm_trigger_label(q.trigger_key), q.phone, q.message, auth.uid());

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.crm_mark_sent(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_mark_sent(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_skip(_queue_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record;
BEGIN
  SELECT * INTO q FROM public.crm_queue WHERE id = _queue_id;
  IF q IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF NOT public.user_has_store_access(auth.uid(), q.store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  UPDATE public.crm_queue SET status = 'pulado' WHERE id = _queue_id AND status = 'pendente';
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.crm_skip(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_skip(uuid) TO authenticated, service_role;

-- 10) Métricas de pós-venda
CREATE OR REPLACE FUNCTION public.crm_metrics(_store_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE enviados int; pulados int; pendentes int; reativados int; receita numeric; por jsonb;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT count(*) FILTER (WHERE status='enviado'), count(*) FILTER (WHERE status='pulado'), count(*) FILTER (WHERE status='pendente')
    INTO enviados, pulados, pendentes
  FROM public.crm_queue WHERE store_id=_store_id AND queue_date BETWEEN _from AND _to;

  SELECT coalesce(jsonb_agg(jsonb_build_object('trigger', trigger_key, 'label', public.crm_trigger_label(trigger_key), 'enviados', n) ORDER BY n DESC), '[]'::jsonb)
    INTO por
  FROM (SELECT trigger_key, count(*) n FROM public.crm_queue
        WHERE store_id=_store_id AND status='enviado' AND queue_date BETWEEN _from AND _to GROUP BY 1) x;

  WITH sends AS (
    SELECT DISTINCT ON (q.customer_id) q.customer_id, q.sent_at
    FROM public.crm_queue q
    WHERE q.store_id=_store_id AND q.status='enviado' AND q.customer_id IS NOT NULL
      AND q.queue_date BETWEEN _from AND _to
    ORDER BY q.customer_id, q.sent_at
  ), conv AS (
    SELECT s.customer_id, sum(sa.total) AS valor
    FROM sends s JOIN public.sales sa ON sa.customer_id = s.customer_id AND sa.store_id=_store_id
      AND sa.created_at > s.sent_at AND sa.created_at <= s.sent_at + interval '30 days'
    GROUP BY 1
  )
  SELECT count(*), coalesce(sum(valor),0) INTO reativados, receita FROM conv;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('de', _from, 'ate', _to),
    'enviados', enviados, 'pulados', pulados, 'pendentes', pendentes,
    'clientes_reativados', reativados, 'receita_atribuida', receita,
    'ticket_medio', CASE WHEN reativados > 0 THEN round(receita/reativados, 2) ELSE 0 END,
    'taxa_conversao_pct', CASE WHEN enviados > 0 THEN round(reativados::numeric*100/enviados, 2) ELSE 0 END,
    'por_gatilho', por
  );
END $$;
REVOKE ALL ON FUNCTION public.crm_metrics(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_metrics(uuid, date, date) TO authenticated, service_role;

-- 11) Clientes prontos para upgrade
CREATE OR REPLACE FUNCTION public.crm_upgrade_candidates(_store_id uuid, _months int DEFAULT 12, _limit int DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.user_has_store_access(auth.uid(), _store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  WITH base AS (
    SELECT DISTINCT ON (s.customer_id)
      s.customer_id, c.name AS customer_name, coalesce(c.whatsapp, c.phone) AS phone,
      s.id AS sale_id, s.sale_number, s.created_at AS sale_at,
      si.name AS aparelho, si.imei_serial, si.total AS valor_pago,
      si.brand, si.model
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products p ON p.id = si.product_id
    JOIN public.customers c ON c.id = s.customer_id
    WHERE s.store_id = _store_id AND s.customer_id IS NOT NULL
      AND (p.item_kind = 'aparelho' OR si.imei_serial IS NOT NULL)
      AND s.created_at <= now() - (_months || ' months')::interval
    ORDER BY s.customer_id, s.created_at DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'customer_id', customer_id, 'customer_name', customer_name, 'phone', phone,
    'sale_id', sale_id, 'sale_number', sale_number, 'sale_at', sale_at,
    'aparelho', aparelho, 'brand', brand, 'model', model, 'imei', imei_serial,
    'valor_pago', valor_pago,
    'meses', floor(extract(epoch from (now() - sale_at)) / 2592000)::int,
    'entrada_estimada', round(valor_pago * greatest(0.25, 1 - 0.035 * floor(extract(epoch from (now() - sale_at)) / 2592000)), 2)
  ) ORDER BY sale_at), '[]'::jsonb) INTO res
  FROM (SELECT * FROM base ORDER BY sale_at LIMIT _limit) t;

  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.crm_upgrade_candidates(uuid, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_upgrade_candidates(uuid, int, int) TO authenticated, service_role;

-- 12) Agendamento diário 07:10 BRT (10:10 UTC)
SELECT cron.unschedule('crm-daily-queue') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-daily-queue');
SELECT cron.schedule('crm-daily-queue', '10 10 * * *', $$SELECT public.crm_daily_job();$$);