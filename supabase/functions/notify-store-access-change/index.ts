// Envia notificação (WhatsApp + alerta in-app) quando uma loja é bloqueada/desbloqueada.
// Pula lojas em trial ativo. Usa Meta/webhook genérico se WHATSAPP_WEBHOOK_URL estiver configurado,
// senão registra o wa.me link em whatsapp_messages_log para envio manual.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLIC_URL = "https://phonee.com.br/comprar";

function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function buildMessage(storeName: string, blocked: boolean): string {
  if (blocked) {
    return (
      `Olá! Aqui é o Phonee 💙\n\n` +
      `O acesso da loja *${storeName}* está temporariamente pausado. ` +
      `Seus dados estão guardados com segurança.\n\n` +
      `Para reativar agora e continuar vendendo, escolha um plano:\n${PUBLIC_URL}\n\n` +
      `Qualquer dúvida, é só responder por aqui.`
    );
  }
  return (
    `Boas notícias! 🎉\n\n` +
    `O acesso da loja *${storeName}* foi *reativado*. ` +
    `Já pode entrar e voltar a usar o Phonee normalmente.\n\n` +
    `Bom trabalho! 💙`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const storeId = String(body?.store_id ?? "").trim();
    const blocked = Boolean(body?.blocked);
    if (!storeId) {
      return new Response(JSON.stringify({ error: "store_id_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Loja + telefone do dono
    const { data: store, error: storeErr } = await admin
      .from("stores")
      .select("id, name, phone, owner_id")
      .eq("id", storeId)
      .maybeSingle();
    if (storeErr) throw storeErr;
    if (!store) {
      return new Response(JSON.stringify({ error: "store_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trial ativo? -> pular
    const nowIso = new Date().toISOString();
    const { data: activeTrial } = await admin
      .from("subscriptions")
      .select("id")
      .eq("store_id", storeId)
      .eq("billing_cycle", "trial")
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .limit(1)
      .maybeSingle();
    if (activeTrial) {
      return new Response(JSON.stringify({ skipped: "trial_active" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Descobrir telefone: prioridade store.phone, senão profile do dono
    let phone = onlyDigits(store.phone);
    if (!phone && store.owner_id) {
      const { data: prof } = await admin
        .from("profiles")
        .select("phone")
        .eq("id", store.owner_id)
        .maybeSingle();
      phone = onlyDigits(prof?.phone as string | null | undefined);
    }

    const message = buildMessage(store.name ?? "sua loja", blocked);
    const eventKey = blocked ? "loja_bloqueada" : "loja_desbloqueada";

    // Envio automatizado (opcional): WHATSAPP_WEBHOOK_URL + WHATSAPP_WEBHOOK_TOKEN
    const webhookUrl = Deno.env.get("WHATSAPP_WEBHOOK_URL");
    const webhookToken = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN");
    let dispatched: "webhook" | "logged_only" = "logged_only";
    let dispatchDetails: unknown = null;

    if (phone && webhookUrl) {
      try {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
          },
          body: JSON.stringify({
            event: eventKey,
            phone,
            message,
            store_id: storeId,
            store_name: store.name,
            cta_url: PUBLIC_URL,
          }),
        });
        const text = await resp.text();
        dispatchDetails = { status: resp.status, body: text.slice(0, 500) };
        if (resp.ok) dispatched = "webhook";
      } catch (e) {
        dispatchDetails = { error: String(e) };
      }
    }

    // Log de mensagem (fica com wa.me pronto pra envio manual se dispatch falhou)
    await admin.from("whatsapp_messages_log").insert({
      store_id: storeId,
      event_key: eventKey,
      template_title: blocked ? "Acesso bloqueado" : "Acesso reativado",
      phone: phone || null,
      message_text: message,
    });

    // Alerta in-app (visível também para o time interno)
    await admin.from("alerts").insert({
      store_id: storeId,
      type: blocked ? "access_blocked" : "access_unblocked",
      severity: blocked ? "warning" : "info",
      title: blocked ? "Loja bloqueada — cliente notificado" : "Loja reativada — cliente notificado",
      message: phone
        ? `WhatsApp ${phone} · ${dispatched === "webhook" ? "enviado automaticamente" : "aguardando envio"}`
        : "Sem telefone cadastrado para envio",
      link: "/comprar",
    });

    return new Response(
      JSON.stringify({ ok: true, dispatched, phone: phone || null, details: dispatchDetails }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});