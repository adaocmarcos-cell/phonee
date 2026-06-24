import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { asaasFetch, corsHeaders, jsonResponse } from "../_shared/asaas.ts";

// Public polling endpoint: by subscription id, fetches Asaas charge status and
// reconciles the local subscription. Acts as a fallback when the webhook is
// not yet configured or delayed. Returns a sanitized snapshot.

const Schema = z.object({ subscription_id: z.string().uuid() });

const MAP: Record<string, string> = {
  PENDING: "pending",
  AWAITING_RISK_ANALYSIS: "pending",
  CONFIRMED: "active",
  RECEIVED: "active",
  RECEIVED_IN_CASH: "active",
  OVERDUE: "overdue",
  REFUNDED: "refunded",
  REFUND_REQUESTED: "refunded",
  CHARGEBACK_REQUESTED: "refunded",
  CHARGEBACK_DISPUTE: "refunded",
  DELETED: "canceled",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await admin
      .from("subscriptions")
      .select("*, plans:plan_id(duration_months)")
      .eq("id", parsed.data.subscription_id)
      .maybeSingle();
    if (!sub) return jsonResponse({ error: "not_found" }, 404);

    // If already active/refunded/canceled, just echo current state.
    const finalStates = new Set(["active", "refunded", "canceled"]);
    if (finalStates.has(sub.status) || !sub.asaas_charge_id || !Deno.env.get("ASAAS_API_KEY")) {
      return jsonResponse(sanitize(sub));
    }

    const { data: settings } = await admin.from("asaas_settings").select("environment").limit(1).maybeSingle();
    const env = (settings?.environment ?? "production") as "sandbox" | "production";
    let r = await asaasFetch(env, `/payments/${sub.asaas_charge_id}`);
    if (!r.ok) {
      const alt = env === "sandbox" ? "production" : "sandbox";
      r = await asaasFetch(alt, `/payments/${sub.asaas_charge_id}`);
    }
    if (!r.ok) return jsonResponse(sanitize(sub));

    const remoteStatus = String(r.data?.status ?? "").toUpperCase();
    const mapped = MAP[remoteStatus] ?? sub.status;
    if (mapped !== sub.status) {
      const updates: Record<string, any> = { status: mapped };
      if (mapped === "active") {
        const months = (sub as any).plans?.duration_months as number | null;
        const now = new Date();
        updates.started_at = sub.started_at ?? now.toISOString();
        updates.expires_at = months ? new Date(now.getTime() + months * 30 * 24 * 3600 * 1000).toISOString() : sub.expires_at;
      }
      await admin.from("subscriptions").update(updates).eq("id", sub.id);
      await admin.from("payment_logs").insert({
        subscription_id: sub.id,
        event_type: `POLL_${remoteStatus}`,
        status: mapped,
        amount_cents: sub.amount_cents,
        asaas_payload: r.data,
        action: "check_status",
      });
      Object.assign(sub, updates);
    }
    return jsonResponse(sanitize(sub));
  } catch (e) {
    return jsonResponse({ error: String((e as any)?.message ?? e) }, 500);
  }
});

function sanitize(sub: any) {
  return {
    id: sub.id,
    status: sub.status,
    payment_method: sub.payment_method,
    customer_email: sub.customer_email,
    invoice_url: sub.invoice_url,
    pix_qr_code: sub.pix_qr_code,
    pix_copy_paste: sub.pix_copy_paste,
    expires_at: sub.expires_at,
  };
}