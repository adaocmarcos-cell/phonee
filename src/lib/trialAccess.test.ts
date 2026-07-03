import { describe, it, expect } from "vitest";
import { evaluateLoginAccess, isTrialActive } from "./trialAccess";

const DAY = 86_400_000;
const NOW = new Date("2026-07-03T18:00:00Z").getTime();
const inDays = (d: number) => new Date(NOW + d * DAY).toISOString();

describe("isTrialActive", () => {
  it("returns false when trial is missing", () => {
    expect(isTrialActive(null, NOW)).toBe(false);
    expect(isTrialActive(undefined, NOW)).toBe(false);
  });

  it("returns true when status='em_teste' and trial_ends_at is in the future", () => {
    expect(isTrialActive({ status: "em_teste", trial_ends_at: inDays(3) }, NOW)).toBe(true);
  });

  it("returns true exactly until trial_ends_at (boundary is exclusive)", () => {
    // One millisecond before end → still active
    expect(
      isTrialActive({ status: "em_teste", trial_ends_at: new Date(NOW + 1).toISOString() }, NOW),
    ).toBe(true);
    // Exactly at end → expired
    expect(
      isTrialActive({ status: "em_teste", trial_ends_at: new Date(NOW).toISOString() }, NOW),
    ).toBe(false);
    // After end → expired
    expect(isTrialActive({ status: "em_teste", trial_ends_at: inDays(-1) }, NOW)).toBe(false);
  });

  it("ignores trials that are not 'em_teste'", () => {
    expect(isTrialActive({ status: "expirado", trial_ends_at: inDays(3) }, NOW)).toBe(false);
    expect(isTrialActive({ status: "cancelado", trial_ends_at: inDays(3) }, NOW)).toBe(false);
    expect(isTrialActive({ status: null, trial_ends_at: inDays(3) }, NOW)).toBe(false);
  });

  it("rejects malformed trial_ends_at values", () => {
    expect(isTrialActive({ status: "em_teste", trial_ends_at: null }, NOW)).toBe(false);
    expect(isTrialActive({ status: "em_teste", trial_ends_at: "not-a-date" }, NOW)).toBe(false);
  });
});

describe("evaluateLoginAccess", () => {
  const empty = { roles: [], myStores: [], mySubs: [], trial: null, now: NOW };

  it("denies access when there is nothing at all", () => {
    const r = evaluateLoginAccess(empty);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("no_access");
  });

  it("grants access to admin_master regardless of subscriptions", () => {
    const r = evaluateLoginAccess({ ...empty, roles: [{ role: "admin_master" }] });
    expect(r.allowed).toBe(true);
    expect(r.isAdminMaster).toBe(true);
    expect(r.reason).toBe("admin_master");
  });

  it("grants access via an active store subscription", () => {
    const r = evaluateLoginAccess({
      ...empty,
      myStores: [{ subscription_status: "active", billing_cycle: "annual", expires_at: inDays(30) }],
    });
    expect(r.allowed).toBe(true);
    expect(r.hasActiveStore).toBe(true);
    expect(r.reason).toBe("store_subscription");
  });

  it("grants access via a user-level active subscription", () => {
    const r = evaluateLoginAccess({
      ...empty,
      mySubs: [{ status: "active", billing_cycle: "annual", expires_at: inDays(30) }],
    });
    expect(r.allowed).toBe(true);
    expect(r.hasActiveSub).toBe(true);
    expect(r.reason).toBe("user_subscription");
  });

  it("grants access to a free trial that has not yet expired", () => {
    const r = evaluateLoginAccess({
      ...empty,
      trial: { status: "em_teste", trial_ends_at: inDays(6) },
    });
    expect(r.allowed).toBe(true);
    expect(r.hasActiveTrial).toBe(true);
    expect(r.reason).toBe("free_trial");
  });

  it("denies access when trial_ends_at is in the past", () => {
    const r = evaluateLoginAccess({
      ...empty,
      trial: { status: "em_teste", trial_ends_at: inDays(-1) },
    });
    expect(r.allowed).toBe(false);
    expect(r.hasActiveTrial).toBe(false);
    expect(r.reason).toBe("no_access");
  });

  it("still grants access on the last day of the trial", () => {
    // trial_ends_at is 1 minute in the future
    const r = evaluateLoginAccess({
      ...empty,
      trial: {
        status: "em_teste",
        trial_ends_at: new Date(NOW + 60_000).toISOString(),
      },
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("free_trial");
  });

  it("denies access at the exact trial_ends_at instant", () => {
    const r = evaluateLoginAccess({
      ...empty,
      trial: { status: "em_teste", trial_ends_at: new Date(NOW).toISOString() },
    });
    expect(r.allowed).toBe(false);
  });

  it("does not grant access when only a trial exists but is already flagged as expired", () => {
    const r = evaluateLoginAccess({
      ...empty,
      trial: { status: "expirado", trial_ends_at: inDays(3) },
    });
    expect(r.allowed).toBe(false);
  });

  it("prefers admin_master over other reasons when multiple apply", () => {
    const r = evaluateLoginAccess({
      roles: [{ role: "admin_master" }],
      myStores: [{ subscription_status: "active", expires_at: inDays(30), billing_cycle: "annual" }],
      mySubs: [{ status: "active", expires_at: inDays(30), billing_cycle: "annual" }],
      trial: { status: "em_teste", trial_ends_at: inDays(3) },
      now: NOW,
    });
    expect(r.reason).toBe("admin_master");
    expect(r.allowed).toBe(true);
  });

  it("falls back to trial when both store and user subscriptions are expired", () => {
    const r = evaluateLoginAccess({
      ...empty,
      myStores: [{ subscription_status: "active", billing_cycle: "annual", expires_at: inDays(-10) }],
      mySubs: [{ status: "active", billing_cycle: "annual", expires_at: inDays(-5) }],
      trial: { status: "em_teste", trial_ends_at: inDays(2) },
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("free_trial");
  });

  it("gracefully handles null/undefined inputs", () => {
    const r = evaluateLoginAccess({
      roles: null,
      myStores: null,
      mySubs: null,
      trial: null,
      now: NOW,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("no_access");
  });

  it("supports a 7-day trial across its full lifecycle", () => {
    const trialStart = NOW;
    const trialEnd = trialStart + 7 * DAY;
    const trial = { status: "em_teste", trial_ends_at: new Date(trialEnd).toISOString() };

    // Day 0, 1, 6.999 → allowed
    for (const offset of [0, 1 * DAY, 3 * DAY, 7 * DAY - 1]) {
      const r = evaluateLoginAccess({ ...empty, trial, now: trialStart + offset });
      expect(r.allowed, `expected allowed at offset ${offset}ms`).toBe(true);
    }
    // Day 7 (exact) and later → denied
    for (const offset of [7 * DAY, 7 * DAY + 1, 8 * DAY]) {
      const r = evaluateLoginAccess({ ...empty, trial, now: trialStart + offset });
      expect(r.allowed, `expected denied at offset ${offset}ms`).toBe(false);
    }
  });
});