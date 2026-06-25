// Disparador central de notificações push.
// Chamado por gatilhos do banco (dispatch_push_event) e por jobs agendados.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@phonee.com.br";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

type EventKind =
  | "new_sale" | "low_stock" | "bill_due" | "new_service" | "monthly_report" | "test";

function brl(n: number) {
  return Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildMessage(event: EventKind, payload: any): { title: string; body: string; url: string; tag?: string } {
  switch (event) {
    case "new_sale":
      return {
        title: "🛒 Nova venda registrada",
        body: `Venda #${payload?.sale_number ?? ""} • ${brl(payload?.total)}`,
        url: "/app/vendas",
        tag: `sale-${payload?.sale_id ?? ""}`,
      };
    case "low_stock":
      return {
        title: "📦 Estoque baixo",
        body: `${payload?.name ?? "Produto"} atingiu ${payload?.stock ?? 0} un. (mín. ${payload?.min ?? 0}).`,
        url: "/app/estoque/relatorio",
        tag: `low-${payload?.product_id ?? ""}`,
      };
    case "bill_due":
      return {
        title: "💸 Contas a pagar vencendo",
        body: payload?.count
          ? `${payload.count} conta(s) vencem em até 3 dias — total ${brl(payload?.total ?? 0)}.`
          : `${payload?.description ?? "Despesa"} vence em breve.`,
        url: "/app/despesas",
        tag: "bills-due",
      };
    case "new_service":
      return {
        title: "🔧 Nova OS de assistência",
        body: `OS #${payload?.os_number ?? ""}${payload?.customer_name ? " · " + payload.customer_name : ""}`,
        url: "/app/assistencia",
        tag: `os-${payload?.os_id ?? ""}`,
      };
    case "monthly_report":
      return {
        title: `📊 Relatório de ${payload?.month_label ?? "mês"}`,
        body: `Vendas ${brl(payload?.sales ?? 0)} · Custos ${brl(payload?.costs ?? 0)} · Lucro ${brl(payload?.profit ?? 0)}.`,
        url: "/app/dashboard",
        tag: `report-${payload?.month_key ?? ""}`,
      };
    case "test":
      return { title: "🔔 Notificações ativas", body: "Tudo certo! Você receberá os avisos do Phonee aqui.", url: "/app/configuracoes" };
    default:
      return { title: "Phonee", body: "Você recebeu uma atualização.", url: "/app" };
  }
}

const PREF_COLUMN: Record<EventKind, string | null> = {
  new_sale: "notify_new_sale",
  low_stock: "notify_low_stock",
  bill_due: "notify_bill_due",
  new_service: "notify_new_service",
  monthly_report: "notify_monthly_report",
  test: null,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: "vapid not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400, headers: corsHeaders }); }

  const event = (body.event ?? "test") as EventKind;
  const storeId: string | null = body.store_id ?? null;
  const payload = body.payload ?? {};
  const targetUserId: string | null = body.user_id ?? null;

  // Descobre usuários elegíveis
  let userIds: string[] = [];
  if (targetUserId) {
    userIds = [targetUserId];
  } else if (storeId) {
    // dono + usuários vinculados com role dono/gerente
    const { data: owners } = await admin.from("stores").select("owner_id").eq("id", storeId);
    const ownerId = owners?.[0]?.owner_id;
    const { data: roles } = await admin.from("user_roles")
      .select("user_id, role").eq("store_id", storeId).in("role", ["dono", "gerente"]);
    const set = new Set<string>();
    if (ownerId) set.add(ownerId);
    (roles ?? []).forEach((r: any) => set.add(r.user_id));
    userIds = Array.from(set);
  }
  if (userIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_users" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Filtra por preferências
  const prefCol = PREF_COLUMN[event];
  let allowedUsers = userIds;
  if (prefCol && storeId) {
    const { data: prefs } = await admin.from("notification_preferences")
      .select(`user_id, push_enabled, ${prefCol}`)
      .eq("store_id", storeId)
      .in("user_id", userIds);
    const prefMap = new Map<string, any>();
    (prefs ?? []).forEach((p: any) => prefMap.set(p.user_id, p));
    allowedUsers = userIds.filter((uid) => {
      const p = prefMap.get(uid);
      if (!p) return true; // default: receber tudo
      return p.push_enabled !== false && p[prefCol] !== false;
    });
  }
  if (allowedUsers.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "prefs_off" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: subs } = await admin.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_key,user_id").in("user_id", allowedUsers);

  const msg = buildMessage(event, payload);
  const notification = JSON.stringify({
    title: msg.title,
    body: msg.body,
    url: msg.url,
    tag: msg.tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  });

  let sent = 0, removed = 0;
  await Promise.all((subs ?? []).map(async (s: any) => {
    try {
      await webpush.sendNotification({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth_key },
      }, notification);
      sent++;
    } catch (err: any) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
        removed++;
      } else {
        console.error("push error", code, err?.body ?? err?.message);
      }
    }
  }));

  return new Response(JSON.stringify({ ok: true, sent, removed, targets: allowedUsers.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});