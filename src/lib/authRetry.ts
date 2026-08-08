import { supabase } from "@/integrations/supabase/client";

const EXPIRY_SKEW_SECONDS = 60;

/** Renova a sessão se o access token estiver expirado ou perto de expirar. */
export async function ensureFreshSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return false;
    const expiresAt = Number(session.expires_at ?? 0);
    const nowSec = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt - nowSec > EXPIRY_SKEW_SECONDS) return true;
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    return !error && !!refreshed.session;
  } catch {
    return false;
  }
}

export function isAuthExpiredError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "");
  const code = String((error as any)?.code ?? "");
  const status = Number((error as any)?.status ?? 0);
  return (
    status === 401 ||
    code === "PGRST301" ||
    /jwt expired|invalid jwt|token (is )?expired|auth session missing|refresh token/i.test(msg)
  );
}

export function isNetworkError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "");
  return /failed to fetch|network ?error|load failed|networkerror/i.test(msg);
}

/**
 * Executa uma chamada ao backend garantindo sessão válida e refazendo
 * a requisição uma única vez se o token expirou ou a rede falhou.
 */
export async function withAuthRetry<T extends { error: any }>(
  run: () => Promise<T>,
): Promise<T> {
  await ensureFreshSession();
  const first = await run();
  if (!first.error) return first;
  if (!isAuthExpiredError(first.error) && !isNetworkError(first.error)) return first;

  const ok = await ensureFreshSession();
  if (!ok && isAuthExpiredError(first.error)) return first;
  return await run();
}

/** Mensagem amigável para falhas de sessão/rede. */
export function authErrorMessage(error: unknown): string | null {
  if (isAuthExpiredError(error)) {
    return "Sua sessão expirou. Faça login novamente para salvar a venda.";
  }
  if (isNetworkError(error)) {
    return "Falha de conexão ao salvar. Verifique a internet e tente novamente.";
  }
  return null;
}
