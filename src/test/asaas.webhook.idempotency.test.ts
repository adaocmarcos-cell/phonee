import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test: reprocessing the same Asaas webhook event must NOT
 * create a second row in `subscriptions`.
 *
 * We simulate the webhook by re-implementing its Supabase interaction with a
 * mock client whose state mirrors the database's partial-unique-index rule:
 * `subscriptions.asaas_charge_id` is unique. The mock is used to drive the
 * exact call pattern the edge function performs (select → upsert with
 * onConflict: 'asaas_charge_id' → payment_logs.insert) twice and assert
 * subscription cardinality stays at 1.
 */

type SubRow = {
  id: string;
  asaas_charge_id: string;
  status: string;
  amount_cents: number;
  started_at: string | null;
  expires_at: string | null;
  user_id: string | null;
  customer_email: string;
  plans?: { duration_months: number } | null;
};

function makeMockDb() {
  const state = {
    subscriptions: [] as SubRow[],
    payment_logs: [] as any[],
  };

  const from = (table: "subscriptions" | "payment_logs") => ({
    select: (_cols: string) => ({
      eq: (col: string, val: string) => ({
        maybeSingle: async () => {
          const row = state[table].find((r: any) => r[col] === val) ?? null;
          return { data: row, error: null };
        },
      }),
    }),
    upsert: async (
      payload: Partial<SubRow>,
      opts?: { onConflict?: string }
    ) => {
      if (table !== "subscriptions") throw new Error("mock upsert only for subs");
      const conflictKey = opts?.onConflict ?? "id";
      const key = (payload as any)[conflictKey];
      // Enforce the same rule as the partial unique index: rows with a
      // non-null asaas_charge_id must be unique. If a conflicting row exists,
      // update in place instead of inserting.
      if (conflictKey === "asaas_charge_id" && key) {
        const idx = state.subscriptions.findIndex((r) => r.asaas_charge_id === key);
        if (idx >= 0) {
          state.subscriptions[idx] = { ...state.subscriptions[idx], ...payload };
          return { data: state.subscriptions[idx], error: null };
        }
      }
      state.subscriptions.push(payload as SubRow);
      return { data: payload, error: null };
    },
    insert: async (payload: any) => {
      state[table].push(payload);
      return { data: payload, error: null };
    },
  });

  return { state, from };
}

// Mirrors the essential webhook flow (see supabase/functions/asaas-webhook/index.ts).
async function processWebhook(
  admin: ReturnType<typeof makeMockDb>,
  event: string,
  payment: { id: string }
) {
  const { data: sub } = await admin
    .from("subscriptions")
    .select("*, plans:plan_id(*)")
    .eq("asaas_charge_id", payment.id)
    .maybeSingle();
  if (!sub) return { ok: true, note: "no subscription found" };

  let newStatus = sub.status;
  let updates: Record<string, any> = {};
  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
    newStatus = "active";
    updates = {
      status: "active",
      started_at: sub.started_at ?? new Date().toISOString(),
      expires_at: null,
    };
  }

  if (Object.keys(updates).length) {
    await admin.from("subscriptions").upsert(
      { id: sub.id, asaas_charge_id: payment.id, ...updates },
      { onConflict: "asaas_charge_id" }
    );
  }

  await admin.from("payment_logs").insert({
    subscription_id: sub.id,
    event_type: event,
    status: newStatus,
    amount_cents: sub.amount_cents,
    asaas_payload: { event, payment },
    action: "webhook_update",
  });
  return { ok: true };
}

describe("asaas-webhook idempotency", () => {
  let db: ReturnType<typeof makeMockDb>;
  const charge = "pay_ABC123";

  beforeEach(() => {
    db = makeMockDb();
    db.state.subscriptions.push({
      id: "sub-1",
      asaas_charge_id: charge,
      status: "pending",
      amount_cents: 9900,
      started_at: null,
      expires_at: null,
      user_id: null,
      customer_email: "cli@example.com",
      plans: { duration_months: 12 },
    });
  });

  it("processing the same PAYMENT_CONFIRMED event twice keeps exactly one subscription row", async () => {
    await processWebhook(db, "PAYMENT_CONFIRMED", { id: charge });
    await processWebhook(db, "PAYMENT_CONFIRMED", { id: charge });
    await processWebhook(db, "PAYMENT_CONFIRMED", { id: charge });

    const rows = db.state.subscriptions.filter((r) => r.asaas_charge_id === charge);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
  });

  it("each reprocess emits a payment_logs entry with action=webhook_update", async () => {
    await processWebhook(db, "PAYMENT_CONFIRMED", { id: charge });
    await processWebhook(db, "PAYMENT_CONFIRMED", { id: charge });

    expect(db.state.payment_logs).toHaveLength(2);
    for (const log of db.state.payment_logs) {
      expect(log.action).toBe("webhook_update");
      expect(log.subscription_id).toBe("sub-1");
      expect(log.status).toBe("active");
    }
  });

  it("mock reproduces the DB partial-unique-index rule: manual duplicate insert is prevented", async () => {
    // Attempt to directly duplicate the row (bypassing the upsert): the mock's
    // upsert with the same onConflict key must collapse to an update, not add.
    await db.from("subscriptions").upsert(
      { id: "sub-2", asaas_charge_id: charge, status: "pending" } as any,
      { onConflict: "asaas_charge_id" }
    );
    const rows = db.state.subscriptions.filter((r) => r.asaas_charge_id === charge);
    expect(rows).toHaveLength(1);
  });
});
