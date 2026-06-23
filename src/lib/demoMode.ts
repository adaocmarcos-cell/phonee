import { supabase } from "@/integrations/supabase/client";

const DEMO_FLAG = "phonee.demo_mode";
export const DEMO_EMAIL = "demo@phonee.com.br";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(DEMO_FLAG) === "1";
}

export function markDemoMode() {
  if (typeof window !== "undefined") sessionStorage.setItem(DEMO_FLAG, "1");
}

export function clearDemoMode() {
  if (typeof window !== "undefined") sessionStorage.removeItem(DEMO_FLAG);
}

export async function enterDemoMode(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("demo-enter", { body: {} });
    if (error || !data?.ok) {
      return { ok: false, error: error?.message ?? data?.error ?? "Falha ao iniciar demonstração" };
    }
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (signErr) return { ok: false, error: signErr.message };
    markDemoMode();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function exitDemoMode() {
  clearDemoMode();
  await supabase.auth.signOut();
}

export function isDemoUserEmail(email?: string | null): boolean {
  return (email ?? "").toLowerCase() === DEMO_EMAIL;
}