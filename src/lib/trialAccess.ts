// Pure helper that decides if a user should be allowed to log in.
// Centralizes the access rules used by src/pages/auth/Auth.tsx so they can
// be unit-tested without touching Supabase.
import { anyGrantsAccess, type SubInput } from "@/lib/subscriptionAccess";

export interface TrialRow {
  status?: string | null;
  trial_ends_at?: string | Date | null;
}

export interface StoreRow {
  subscription_status?: string | null;
  billing_cycle?: string | null;
  expires_at?: string | Date | null;
}

export interface LoginAccessInput {
  roles: Array<{ role: string }> | null | undefined;
  myStores: StoreRow[] | null | undefined;
  mySubs: SubInput[] | null | undefined;
  trial: TrialRow | null | undefined;
  /** Injected for deterministic tests. Defaults to Date.now(). */
  now?: number;
}

export interface LoginAccessResult {
  allowed: boolean;
  isAdminMaster: boolean;
  hasActiveStore: boolean;
  hasActiveSub: boolean;
  hasActiveTrial: boolean;
  reason:
    | "admin_master"
    | "store_subscription"
    | "user_subscription"
    | "free_trial"
    | "no_access";
}

export function isTrialActive(trial: TrialRow | null | undefined, now = Date.now()): boolean {
  if (!trial) return false;
  if (trial.status !== "em_teste") return false;
  if (!trial.trial_ends_at) return false;
  const ends = new Date(trial.trial_ends_at).getTime();
  if (!Number.isFinite(ends)) return false;
  return ends > now;
}

export function evaluateLoginAccess(input: LoginAccessInput): LoginAccessResult {
  const now = input.now ?? Date.now();
  const roles = input.roles ?? [];
  const isAdminMaster = roles.some((r) => r?.role === "admin_master");

  const storeAccess = anyGrantsAccess(
    (input.myStores ?? []).map((s) => ({
      status: s.subscription_status ?? null,
      expires_at: s.expires_at ?? null,
      billing_cycle: s.billing_cycle ?? null,
    })),
  );
  const subAccess = anyGrantsAccess(input.mySubs ?? []);
  const hasActiveStore = !!storeAccess?.hasAccess;
  const hasActiveSub = !!subAccess?.hasAccess;
  const hasActiveTrial = isTrialActive(input.trial, now);

  let reason: LoginAccessResult["reason"] = "no_access";
  if (isAdminMaster) reason = "admin_master";
  else if (hasActiveStore) reason = "store_subscription";
  else if (hasActiveSub) reason = "user_subscription";
  else if (hasActiveTrial) reason = "free_trial";

  return {
    allowed: reason !== "no_access",
    isAdminMaster,
    hasActiveStore,
    hasActiveSub,
    hasActiveTrial,
    reason,
  };
}