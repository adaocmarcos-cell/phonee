
-- 1) Novos campos em service_orders
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS budget_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS budget_decided_by_name text,
  ADD COLUMN IF NOT EXISTS budget_decided_ip inet;

-- Backfill (defensivo): qualquer registro antigo sem token recebe um novo.
UPDATE public.service_orders SET public_token = gen_random_uuid() WHERE public_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_orders_public_token_key
  ON public.service_orders(public_token);

-- 2) RPC pública SECURITY DEFINER: retorna somente campos seguros por token.
--    Acessível anonimamente. Sem token válido, retorna NULL.
CREATE OR REPLACE FUNCTION public.get_public_os(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _os public.service_orders;
  _store public.stores;
  _warranty_days int := 90;
  _garantia_ate date;
BEGIN
  IF _token IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO _os FROM public.service_orders WHERE public_token = _token;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO _store FROM public.stores WHERE id = _os.store_id;

  IF _os.end_date IS NOT NULL THEN
    _garantia_ate := _os.end_date + _warranty_days;
  ELSE
    _garantia_ate := NULL;
  END IF;

  RETURN jsonb_build_object(
    'os_number',        _os.os_number,
    'status',           _os.status,
    'budget_status',    _os.budget_status,
    'customer_first_name', split_part(coalesce(_os.customer_name,''), ' ', 1),
    'device', jsonb_build_object(
      'category', _os.device_category,
      'brand',    _os.device_brand,
      'model',    _os.device_model,
      'color',    _os.device_color,
      'storage',  _os.device_storage
    ),
    'reasons',          coalesce(_os.reasons, ARRAY[]::text[]),
    'issue_description', _os.issue_description,
    'estimated_days',   _os.estimated_days,
    'budget', jsonb_build_object(
      'parts', _os.parts_value,
      'labor', _os.labor_value,
      'total', _os.total_value
    ),
    'dates', jsonb_build_object(
      'created_at', _os.created_at,
      'start_date', _os.start_date,
      'end_date',   _os.end_date,
      'signed_at',  _os.signed_at
    ),
    'warranty_until',   _garantia_ate,
    'budget_decision', CASE
      WHEN _os.budget_status IN ('aprovado','reprovado') THEN jsonb_build_object(
        'status',    _os.budget_status,
        'name',      _os.budget_decided_by_name,
        'decided_at', _os.budget_decided_at
      )
      ELSE NULL
    END,
    'store', jsonb_build_object(
      'name',       coalesce(_store.trade_name, _store.name),
      'logo_url',   _store.logo_url,
      'primary_color', _store.primary_color,
      'phone',      _store.phone,
      'email',      _store.email,
      'address',    _store.address
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_os(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_os(uuid) TO anon, authenticated;

-- 3) RPC pública: aprovar/recusar orçamento
CREATE OR REPLACE FUNCTION public.approve_public_budget(
  _token uuid,
  _decision text,
  _name text,
  _ip inet DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _os public.service_orders;
  _new_budget os_budget_status;
  _new_status os_status;
BEGIN
  IF _token IS NULL THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '22023';
  END IF;
  IF _decision NOT IN ('aprovar','recusar') THEN
    RAISE EXCEPTION 'decisao_invalida' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(_name),'') = '' THEN
    RAISE EXCEPTION 'nome_obrigatorio' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _os FROM public.service_orders WHERE public_token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'os_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- Só aceita decisão enquanto ainda estiver pendente
  IF _os.budget_status <> 'pendente' THEN
    RAISE EXCEPTION 'orcamento_ja_decidido' USING ERRCODE = '22023';
  END IF;

  IF _decision = 'aprovar' THEN
    _new_budget := 'aprovado';
    _new_status := CASE WHEN _os.status = 'aguardando_aprovacao' THEN 'em_reparo'::os_status ELSE _os.status END;
  ELSE
    _new_budget := 'reprovado';
    _new_status := CASE WHEN _os.status = 'aguardando_aprovacao' THEN 'cancelado'::os_status ELSE _os.status END;
  END IF;

  UPDATE public.service_orders
     SET budget_status = _new_budget,
         status = _new_status,
         budget_decided_at = now(),
         budget_decided_by_name = btrim(_name),
         budget_decided_ip = _ip
   WHERE id = _os.id;

  -- Alerta para o lojista (aparece no sino de notificações)
  INSERT INTO public.alerts (store_id, type, severity, title, message, link)
  VALUES (
    _os.store_id,
    'os_budget_decision',
    CASE WHEN _new_budget = 'aprovado' THEN 'info'::alert_severity ELSE 'warning'::alert_severity END,
    'Orçamento ' || (CASE WHEN _new_budget = 'aprovado' THEN 'aprovado' ELSE 'recusado' END)
      || ' — OS #' || coalesce(lpad(_os.os_number::text, 4, '0'), '—'),
    'Cliente "' || btrim(_name) || '" ' ||
      (CASE WHEN _new_budget = 'aprovado' THEN 'aprovou' ELSE 'recusou' END) ||
      ' o orçamento pela página pública.',
    '/painel/ordens/' || _os.id::text
  );

  -- Registro em audit_log se existir a estrutura mínima
  BEGIN
    INSERT INTO public.audit_log (store_id, entity_type, entity_id, action, details)
    VALUES (
      _os.store_id, 'service_order', _os.id,
      'budget_' || (CASE WHEN _new_budget = 'aprovado' THEN 'approved' ELSE 'rejected' END) || '_public',
      jsonb_build_object('name', btrim(_name), 'ip', _ip::text, 'os_number', _os.os_number)
    );
  EXCEPTION WHEN OTHERS THEN
    -- se audit_log tiver outra assinatura, apenas ignora sem quebrar o fluxo público.
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'budget_status', _new_budget,
    'status', _new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_public_budget(uuid, text, text, inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_public_budget(uuid, text, text, inet) TO anon, authenticated;

-- 4) Atualiza os modelos padrão para incluir o link de acompanhamento
CREATE OR REPLACE FUNCTION public.seed_whatsapp_templates_for_store(_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.whatsapp_templates (store_id, event_key, title, body)
  VALUES
    (_store_id, 'os_criada', 'OS criada',
'Olá, {cliente}! 👋
Aqui é da {loja}. Recebemos seu aparelho *{aparelho}* e abrimos a OS *#{os_numero}*.

Acompanhe em tempo real:
{link_acompanhamento}

Assim que finalizarmos a avaliação, te enviaremos o orçamento por aqui.'),

    (_store_id, 'orcamento_pronto', 'Orçamento pronto',
'Oi, {cliente}! Aqui é da {loja}.
O orçamento da sua OS *#{os_numero}* ({aparelho}) está pronto:

💰 Valor total: *{valor}*
⏱ Prazo estimado: {prazo}

👉 Aprove ou recuse direto pelo link:
{link_acompanhamento}'),

    (_store_id, 'orcamento_aprovado', 'Orçamento aprovado',
'{cliente}, obrigado pela confiança! ✅
Orçamento da OS *#{os_numero}* aprovado. Já iniciamos o serviço no seu *{aparelho}*.

Prazo estimado: {prazo}. Acompanhe por aqui: {link_acompanhamento}
— {loja}'),

    (_store_id, 'aparelho_pronto', 'Aparelho pronto para retirada',
'Boa notícia, {cliente}! 🎉
Seu *{aparelho}* (OS *#{os_numero}*) está *pronto para retirada* na {loja}.

Valor: *{valor}*
Detalhes: {link_acompanhamento}'),

    (_store_id, 'os_entregue_garantia', 'Entrega e garantia',
'{cliente}, seu *{aparelho}* foi entregue com sucesso. Obrigado por escolher a {loja}! 🙏

🛡 Garantia do serviço até *{garantia_ate}*.
Consulte sua OS quando quiser: {link_acompanhamento}'),

    (_store_id, 'venda_concluida', 'Venda concluída',
'Obrigado pela compra, {cliente}! 🛍
A {loja} agradece a preferência.

Valor total: *{valor}*
Qualquer dúvida sobre o produto, é só responder esta mensagem. Volte sempre! 💙'),

    (_store_id, 'cobranca_pendente', 'Cobrança pendente',
'Olá, {cliente}! Aqui é da {loja}.
Passando pra lembrar de um valor em aberto: *{valor}* (vencimento {prazo}).

Se já efetuou o pagamento, pode desconsiderar. Qualquer coisa, respondemos por aqui. Obrigado! 🙌')
  ON CONFLICT (store_id, event_key) DO NOTHING;
END;
$$;
