import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { asaasFetch, corsHeaders, jsonResponse } from "../_shared/asaas.ts";

// Re-sincroniza a assinatura do usuário autenticado.
// - Vincula assinaturas órfãs (customer_email == user.email) ao user_id atual.
// - Vincula assinaturas sem store_id à loja do usuário (se existir).
// - Consulta o Asaas para reconciliar cobranças em estado não-final.
// - Retorna a melhor assinatura consolidada.

const ASAAS_MAP: Record<string, string> = {
  PENDING: "pending",
  AWAITING_RISK_ANALYSIS: "pending",
  CONFIRMED: "active",
  RECEIVED: "active",
  RECEIVED_IN_CASH: "active",
  OVERDUE: "overdue",
  REFUNDED: "refunded",
  REFUND_REQUESTED: "refunded",
  DELETED: "canceled",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user) return jsonResponse({ error: "unauthorized" }, 401);
    const user = userData.user;
    const email = (user.email ?? "").toLowerCase();

    const admin = createClient(url, service);

    // 1) Reivindicar assinaturas órfãs por e-mail
    if (email) {
      await admin
        .from("subscriptions")
        .update({ user_id: user.id })
        .is("user_id", null)
        .ilike("customer_email", email);
    }

    // 2) Carregar assinaturas do usuário
    const { data: subs } = await admin
      .from("subscriptions")
      .select("*, plans:plan_id(duration_months, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const list = (subs ?? []) as any[];

    // 3) Descobrir a loja do usuário (própria ou vinculada)
    const { data: ownStore } = await admin
      .from("stores")
      .select("id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    let storeId = ownStore?.id as string | undefined;
    if (!storeId) {
      const { data: linked } = await admin
        .from("user_stores")
        .select("store_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      storeId = linked?.store_id as string | undefined;
    }

    // 4) Vincular store_id órfão à loja do usuário (se houver)
    if (storeId) {
      const orphanIds = list.filter((s) => !s.store_id).map((s) => s.id);
      if (orphanIds.length) {
        await admin.from("subscriptions").update({ store_id: storeId }).in("id", orphanIds);
      }
    }

    // 5) Reconciliar com Asaas quando possível
    const hasAsaas = !!Deno.env.get("ASAAS_API_KEY");
    if (hasAsaas) {
      const { data: settings } = await admin.from("asaas_settings").select("environment").limit(1).maybeSingle();
      const env = (settings?.environment ?? "production") as "sandbox" | "production";
      const finalStates = new Set(["refunded", "canceled"]);
      for (const s of list) {
        if (!s.asaas_charge_id) continue;
        if (finalStates.has(s.status)) continue;
        let r = await asaasFetch(env, `/payments/${s.asaas_charge_id}`);
        if (!r.ok) {
          const alt = env === "sandbox" ? "production" : "sandbox";
          r = await asaasFetch(alt, `/payments/${s.asaas_charge_id}`);
        }
        if (!r.ok) continue;
        const remote = String(r.data?.status ?? "").toUpperCase();
        const mapped = ASAAS_MAP[remote] ?? s.status;
        if (mapped !== s.status) {
          const updates: Record<string, any> = { status: mapped };
          if (mapped === "active") {
            const months = s.plans?.duration_months as number | null;
            const now = new Date();
            updates.started_at = s.started_at ?? now.toISOString();
            updates.expires_at = months
              ? new Date(now.getTime() + months * 30 * 24 * 3600 * 1000).toISOString()
              : s.expires_at;
          }
          await admin.from("subscriptions").update(updates).eq("id", s.id);
          await admin.from("payment_logs").insert({
            subscription_id: s.id,
            event_type: `RESYNC_${remote}`,
            status: mapped,
            amount_cents: s.amount_cents,
            asaas_payload: r.data,
            action: "resync",
          });
          Object.assign(s, updates);
        }
      }
    }

    // 6) Recarrega lista final e devolve resumo
    const { data: fresh } = await admin
      .from("subscriptions")
      .select("id, status, billing_cycle, expires_at, cancel_at_period_end, plan_id, store_id, plans:plan_id(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    return jsonResponse({
      ok: true,
      claimed_count: list.length,
      store_id: storeId ?? null,
      subscriptions: (fresh ?? []).map((s: any) => ({
        id: s.id,
        status: s.status,
        billing_cycle: s.billing_cycle,
        expires_at: s.expires_at,
        cancel_at_period_end: s.cancel_at_period_end,
        plan_name: s.plans?.name ?? null,
      })),
    });
  } catch (e) {
    return jsonResponse({ error: String((e as any)?.message ?? e) }, 500);
  }
});