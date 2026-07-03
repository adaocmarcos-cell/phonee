import { describe, it, expectTypeOf } from "vitest";
import type { Database } from "@/integrations/supabase/types";

type Fns = Database["public"]["Functions"];

/**
 * Contract test — validates, at compile time (via expectTypeOf), that every
 * phonee_* RPC used in the admin master screens has a signature matching what
 * the frontend calls with. If a signature drifts (arg renamed/removed, return
 * shape changed), this test refuses to compile — which fails `vitest run`.
 *
 * Add entries here whenever a screen starts using a new phonee_* RPC.
 */
describe("phonee_* RPC contract (used by admin master screens)", () => {
  it("phonee_overview — no args, jsonb return", () => {
    expectTypeOf<Fns["phonee_overview"]["Args"]>().toBeNever();
    expectTypeOf<Fns["phonee_overview"]["Returns"]>().not.toBeNever();
  });

  it("phonee_sales_traffic — accepts _days/_from/_to/_store_id/_path", () => {
    type A = Fns["phonee_sales_traffic"]["Args"];
    expectTypeOf<A["_days"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<A["_from"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<A["_to"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<A["_store_id"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<A["_path"]>().toEqualTypeOf<string | undefined>();
  });

  it("phonee_coupons_revenue — _days number", () => {
    type A = Fns["phonee_coupons_revenue"]["Args"];
    expectTypeOf<A["_days"]>().toEqualTypeOf<number | undefined>();
  });

  it("phonee_pixel_events_overview — _days number", () => {
    type A = Fns["phonee_pixel_events_overview"]["Args"];
    expectTypeOf<A["_days"]>().toEqualTypeOf<number | undefined>();
  });

  it("phonee_referrals_overview — no args", () => {
    expectTypeOf<Fns["phonee_referrals_overview"]["Args"]>().toBeNever();
  });

  it("phonee_marketing_dashboard — no args", () => {
    expectTypeOf<Fns["phonee_marketing_dashboard"]["Args"]>().toBeNever();
  });

  it("phonee_user_metrics — no args", () => {
    expectTypeOf<Fns["phonee_user_metrics"]["Args"]>().toBeNever();
  });

  it("phonee_stores — table return with owner_email/plan_name/total_sales", () => {
    type R = Fns["phonee_stores"]["Returns"][number];
    expectTypeOf<R["owner_email"]>().toBeString();
    expectTypeOf<R["plan_name"]>().toBeString();
    expectTypeOf<R["total_sales"]>().toBeNumber();
  });

  it("phonee_users — table return with roles/stores/plan_name", () => {
    type R = Fns["phonee_users"]["Returns"][number];
    expectTypeOf<R["roles"]>().toEqualTypeOf<string[]>();
    expectTypeOf<R["plan_name"]>().toBeString();
  });

  it("phonee_growth — table with month_start/new_stores/gmv", () => {
    type R = Fns["phonee_growth"]["Returns"][number];
    expectTypeOf<R["month_start"]>().toBeString();
    expectTypeOf<R["new_stores"]>().toBeNumber();
    expectTypeOf<R["gmv"]>().toBeNumber();
  });

  it("phonee_plans_list — table with id/name/price_cents", () => {
    type R = Fns["phonee_plans_list"]["Returns"][number];
    expectTypeOf<R["price_cents"]>().toBeNumber();
  });

  it("phonee_partner_trials_list — table", () => {
    type R = Fns["phonee_partner_trials_list"]["Returns"][number];
    expectTypeOf<R["email"]>().toBeString();
  });

  it("phonee_user_subscriptions — requires _user_id", () => {
    type A = Fns["phonee_user_subscriptions"]["Args"];
    expectTypeOf<A["_user_id"]>().toBeString();
  });

  it("phonee_smoke_test — accepts optional _as_admin", () => {
    type A = Fns["phonee_smoke_test"]["Args"];
    expectTypeOf<A["_as_admin"]>().toEqualTypeOf<string | undefined>();
  });

  it("phonee_smoke_test_run_and_log — optional _source, uuid return", () => {
    type A = Fns["phonee_smoke_test_run_and_log"]["Args"];
    expectTypeOf<A["_source"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Fns["phonee_smoke_test_run_and_log"]["Returns"]>().toBeString();
  });

  it("phonee_security_test — no args", () => {
    expectTypeOf<Fns["phonee_security_test"]["Args"]>().toBeNever();
  });
});