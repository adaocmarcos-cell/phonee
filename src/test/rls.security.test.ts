import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * RLS exploitation tests. These run as an ANONYMOUS client (no session).
 * Every write attempt MUST fail or return zero affected rows.
 * If any of these starts passing, a policy regressed and someone could:
 *  - upgrade their own plan,
 *  - flip their subscription to active without paying,
 *  - become admin_master,
 *  - read other stores' financial data.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const sb = () => createClient(URL, KEY, { auth: { persistSession: false } });

const isDenied = (error: any, data: any) => {
  // Either an explicit error or zero rows touched is acceptable proof of RLS denial.
  if (error) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  return false;
};

describe("RLS — sensitive write paths must be denied for anonymous/normal users", () => {
  it("cannot UPDATE subscriptions (no policy permits this)", async () => {
    const { data, error } = await sb()
      .from("subscriptions")
      .update({ status: "active", expires_at: "2099-01-01" })
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id");
    expect(isDenied(error, data)).toBe(true);
  });

  it("cannot INSERT an already-active subscription", async () => {
    const { error } = await sb().from("subscriptions").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      plan_id: "00000000-0000-0000-0000-000000000000",
      customer_name: "x", customer_email: "x@x.com", customer_doc: "0",
      payment_method: "PIX", amount_cents: 1, status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("cannot escalate to admin_master via user_roles", async () => {
    const { error } = await sb().from("user_roles").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      role: "admin_master" as any,
    });
    expect(error).toBeTruthy();
  });

  it("cannot self-credit referral_credits", async () => {
    const { error } = await sb().from("referral_credits").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      type: "credito_indicacao", amount_cents: 9_999_900,
    });
    expect(error).toBeTruthy();
  });

  it("cannot list other stores' sales without store access", async () => {
    const { data, error } = await sb().from("sales").select("id").limit(5);
    // anon shouldn't get rows
    expect(isDenied(error, data)).toBe(true);
  });

  it("cannot bypass change-request workflow by calling approve directly", async () => {
    const { error } = await sb().rpc("approve_subscription_change", {
      _request_id: "00000000-0000-0000-0000-000000000000", _review_notes: "x",
    });
    expect(error).toBeTruthy(); // forbidden / unauthenticated
  });

  it("anon cannot create a change request", async () => {
    const { error } = await sb().rpc("request_subscription_change", {
      _subscription_id: "00000000-0000-0000-0000-000000000000",
      _changes: { status: "active" }, _reason: "exploit attempt",
    });
    expect(error).toBeTruthy();
  });
});