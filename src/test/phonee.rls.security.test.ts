import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Every phonee_* RPC gates access via `is_admin_master(auth.uid())`.
 * Called by an ANONYMOUS client (no session), each call MUST fail —
 * either with a Postgres 42501 raised inside the function or with the
 * PostgREST permission check. If any of these starts succeeding, an
 * admin master screen has been exposed to the public.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const sb = () => createClient(URL, KEY, { auth: { persistSession: false } });

const mustBlock = (error: any, data: any) => {
  // Explicit error is the primary signal.
  if (error) return true;
  // Some RPCs return jsonb — treat null/undefined result as blocked.
  if (data === null || data === undefined) return true;
  return false;
};

describe("phonee_* RPCs — anonymous callers must be blocked", () => {
  it("phonee_overview", async () => {
    const { data, error } = await sb().rpc("phonee_overview");
    expect(mustBlock(error, data)).toBe(true);
  });
  it("phonee_sales_traffic", async () => {
    const { data, error } = await sb().rpc("phonee_sales_traffic", { _days: 7 });
    expect(mustBlock(error, data)).toBe(true);
  });
  it("phonee_coupons_revenue", async () => {
    const { data, error } = await sb().rpc("phonee_coupons_revenue", { _days: 30 });
    expect(mustBlock(error, data)).toBe(true);
  });
  it("phonee_referrals_overview", async () => {
    const { data, error } = await sb().rpc("phonee_referrals_overview");
    expect(mustBlock(error, data)).toBe(true);
  });
  it("phonee_pixel_events_overview", async () => {
    const { data, error } = await sb().rpc("phonee_pixel_events_overview", { _days: 7 });
    expect(mustBlock(error, data)).toBe(true);
  });
  it("phonee_marketing_dashboard", async () => {
    const { data, error } = await sb().rpc("phonee_marketing_dashboard");
    expect(mustBlock(error, data)).toBe(true);
  });
  it("phonee_user_metrics", async () => {
    const { data, error } = await sb().rpc("phonee_user_metrics");
    expect(mustBlock(error, data)).toBe(true);
  });
  it("phonee_stores (table function)", async () => {
    const { data, error } = await sb().rpc("phonee_stores");
    // table functions gated by is_admin_master return empty array for anon.
    const denied = !!error || (Array.isArray(data) && data.length === 0);
    expect(denied).toBe(true);
  });
  it("phonee_users (table function)", async () => {
    const { data, error } = await sb().rpc("phonee_users");
    const denied = !!error || (Array.isArray(data) && data.length === 0);
    expect(denied).toBe(true);
  });
  it("phonee_growth (table function)", async () => {
    const { data, error } = await sb().rpc("phonee_growth");
    const denied = !!error || (Array.isArray(data) && data.length === 0);
    expect(denied).toBe(true);
  });
  it("phonee_smoke_test itself is blocked", async () => {
    const { data, error } = await sb().rpc("phonee_smoke_test", {});
    expect(mustBlock(error, data)).toBe(true);
  });
  it("phonee_smoke_test_run_and_log manual mode is blocked", async () => {
    const { data, error } = await sb().rpc("phonee_smoke_test_run_and_log", { _source: "manual" });
    expect(mustBlock(error, data)).toBe(true);
  });
  it("history table phonee_smoke_test_runs is not readable by anon", async () => {
    const { data, error } = await sb().from("phonee_smoke_test_runs").select("id").limit(1);
    const denied = !!error || (Array.isArray(data) && data.length === 0);
    expect(denied).toBe(true);
  });
});