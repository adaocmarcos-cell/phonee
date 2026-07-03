import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const expected = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    const got = req.headers.get("asaas-access-token");
    if (!expected || got !== expected) return jsonResponse({ error: "invalid token" }, 401);

    const body = await req.json();
    const event = body?.event as string;
    const payment = body?.payment;
    if (!event || !payment) return jsonResponse({ error: "invalid payload" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await admin.from("subscriptions").select("*, plans:plan_id(*)").eq("asaas_charge_id", payment.id).maybeSingle();
    if (!sub) {
      await admin.from("payment_logs").insert({ event_type: event, status: "unknown_charge", asaas_payload: body });
      return jsonResponse({ ok: true, note: "no subscription found" });
    }

    let newStatus = sub.status as string;
    let updates: Record<string, any> = {};

    switch (event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED": {
        newStatus = "active";
        const now = new Date();
        const startedAt = sub.started_at ?? now.toISOString();
        const months = (sub as any).plans?.duration_months as number | null;
        const expiresAt = months ? new Date(now.getTime() + months * 30 * 24 * 3600 * 1000).toISOString() : null;
        updates = { status: newStatus, started_at: startedAt, expires_at: expiresAt };
        break;
      }
      case "PAYMENT_OVERDUE":
        newStatus = "overdue"; updates = { status: newStatus }; break;
      case "PAYMENT_REFUNDED":
        newStatus = "refunded"; updates = { status: newStatus, refund_status: "refunded" }; break;
      case "PAYMENT_DELETED":
        newStatus = "canceled"; updates = { status: newStatus }; break;
      case "PAYMENT_CREATED":
        updates = {}; break;
      default:
        updates = {};
    }

    if (Object.keys(updates).length) {
      // Idempotent write keyed by the natural unique key (asaas_charge_id).
      // If the same webhook event arrives twice, the partial unique index
      // guarantees this cannot create a second row — it always updates the
      // existing one.
      await admin
        .from("subscriptions")
        .upsert(
          { id: sub.id, asaas_charge_id: payment.id, ...updates },
          { onConflict: "asaas_charge_id" }
        );
    }

    // Create user + send password reset on approval
    if (newStatus === "active" && !sub.user_id) {
      const email = sub.customer_email;
      const siteUrl = Deno.env.get("SITE_URL") ?? "";
      const redirectTo = siteUrl ? `${siteUrl}/reset-password` : undefined;

      // Look up the user directly and indexed via profiles.email — avoids
      // paginating auth.users (previous `listUsers({ perPage: 200 })` silently
      // failed once we crossed a few hundred accounts, leaving paid
      // subscriptions orphaned). Only create the auth user when the profile
      // truly doesn't exist yet.
      let userId: string | null = null;
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (existingProfile?.id) {
        userId = existingProfile.id as string;
      } else {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: sub.customer_name, source: "asaas_checkout" },
        });
        if (created?.user) {
          userId = created.user.id;
        } else if (createErr && /already/i.test(createErr.message ?? "")) {
          // Race: profile row may not exist yet even though the auth user does.
          // Re-check profiles once (the DB trigger creates it on user insert).
          const { data: retry } = await admin
            .from("profiles")
            .select("id")
            .ilike("email", email)
            .maybeSingle();
          userId = (retry?.id as string | undefined) ?? null;
        }
      }

      if (userId) {
        await admin
          .from("subscriptions")
          .upsert(
            { id: sub.id, asaas_charge_id: payment.id, user_id: userId },
            { onConflict: "asaas_charge_id" }
          );
        // Send "set password" email via recovery link
        try {
          await admin.auth.admin.generateLink({
            type: "recovery", email,
            options: redirectTo ? { redirectTo } : undefined,
          });
        } catch (_) { /* ignore */ }
      }
    }

    // Audit: because we look up `sub` by asaas_charge_id BEFORE the upsert and
    // bail out earlier when it isn't found, reaching this point means the
    // upsert always updated an existing row rather than creating a new one.
    // Log that explicitly so a reprocessed webhook event is visibly recorded
    // as an idempotent update and never mistaken for a duplicate creation.
    await admin.from("payment_logs").insert({
      subscription_id: sub.id,
      event_type: event,
      status: newStatus,
      amount_cents: sub.amount_cents,
      asaas_payload: body,
      action: "webhook_update",
    });

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: String(e?.message ?? e) }, 500);
  }
});