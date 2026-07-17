
-- =========================================================
-- 1) whatsapp_templates
-- =========================================================
CREATE TABLE public.whatsapp_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  event_key   text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_templates_event_chk CHECK (event_key IN (
    'os_criada','orcamento_pronto','orcamento_aprovado','aparelho_pronto',
    'os_entregue_garantia','venda_concluida','cobranca_pendente'
  )),
  CONSTRAINT whatsapp_templates_unique UNIQUE (store_id, event_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_templates_select_members"
  ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "wa_templates_insert_members"
  ON public.whatsapp_templates FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "wa_templates_update_members"
  ON public.whatsapp_templates FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "wa_templates_delete_owner_manager"
  ON public.whatsapp_templates FOR DELETE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE TRIGGER wa_templates_touch
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2) whatsapp_messages_log
-- =========================================================
CREATE TABLE public.whatsapp_messages_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  os_id          uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  sale_id        uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  event_key      text NOT NULL,
  template_id    uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  template_title text,
  phone          text,
  message_text   text NOT NULL,
  sent_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_log_target_chk CHECK (os_id IS NOT NULL OR sale_id IS NOT NULL)
);

CREATE INDEX whatsapp_log_os_idx    ON public.whatsapp_messages_log(os_id)    WHERE os_id    IS NOT NULL;
CREATE INDEX whatsapp_log_sale_idx  ON public.whatsapp_messages_log(sale_id)  WHERE sale_id  IS NOT NULL;
CREATE INDEX whatsapp_log_store_idx ON public.whatsapp_messages_log(store_id, created_at DESC);

GRANT SELECT, INSERT ON public.whatsapp_messages_log TO authenticated;
GRANT ALL ON public.whatsapp_messages_log TO service_role;

ALTER TABLE public.whatsapp_messages_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_log_select_members"
  ON public.whatsapp_messages_log FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "wa_log_insert_members"
  ON public.whatsapp_messages_log FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_store_access(auth.uid(), store_id)
    AND (sent_by IS NULL OR sent_by = auth.uid())
  );

-- Sem UPDATE/DELETE: histórico é imutável.

-- =========================================================
-- 3) Templates padrão + seeding automático
-- =========================================================
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

Assim que finalizarmos a avaliação, te enviaremos o orçamento por aqui. Qualquer dúvida, é só responder esta mensagem.'),

    (_store_id, 'orcamento_pronto', 'Orçamento pronto',
'Oi, {cliente}! Aqui é da {loja}.
O orçamento da sua OS *#{os_numero}* ({aparelho}) está pronto:

💰 Valor total: *{valor}*
⏱ Prazo estimado: {prazo}

Pode nos confirmar se autoriza o serviço? Estamos à disposição.'),

    (_store_id, 'orcamento_aprovado', 'Orçamento aprovado',
'{cliente}, obrigado pela confiança! ✅
Orçamento da OS *#{os_numero}* aprovado. Já iniciamos o serviço no seu *{aparelho}*.

Prazo estimado: {prazo}. Te avisamos por aqui assim que estiver pronto.
— {loja}'),

    (_store_id, 'aparelho_pronto', 'Aparelho pronto para retirada',
'Boa notícia, {cliente}! 🎉
Seu *{aparelho}* (OS *#{os_numero}*) está *pronto para retirada* na {loja}.

Valor: *{valor}*
Estamos te esperando! 🙌'),

    (_store_id, 'os_entregue_garantia', 'Entrega e garantia',
'{cliente}, seu *{aparelho}* foi entregue com sucesso. Obrigado por escolher a {loja}! 🙏

🛡 Garantia do serviço até *{garantia_ate}*.
Qualquer coisa, é só chamar por aqui.'),

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

REVOKE ALL ON FUNCTION public.seed_whatsapp_templates_for_store(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.seed_whatsapp_templates_for_store(uuid) TO authenticated, service_role;

-- Trigger em stores: quando uma loja nova é criada, seed já roda.
CREATE OR REPLACE FUNCTION public.tg_seed_whatsapp_templates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_whatsapp_templates_for_store(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_stores_seed_whatsapp ON public.stores;
CREATE TRIGGER tg_stores_seed_whatsapp
  AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_whatsapp_templates();

-- Backfill para lojas já existentes.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.stores LOOP
    PERFORM public.seed_whatsapp_templates_for_store(r.id);
  END LOOP;
END $$;
