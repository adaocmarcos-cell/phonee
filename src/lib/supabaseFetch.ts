import { toast } from "sonner";

/**
 * Helpers centralizados para chamadas ao Supabase.
 *
 * Objetivo:
 *  - Nunca engolir `error`: sempre exibir toast com a mensagem real.
 *  - Detectar sessão expirada (JWT expired / 401 / refresh token inválido)
 *    e disparar um evento global para redirecionar ao login preservando a
 *    rota atual como `returnTo`.
 *
 * NÃO altera regras de negócio: apenas padroniza a superfície de erro.
 */

export const SESSION_EXPIRED_EVENT = "phonee:session-expired";

export function isAuthExpiredError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message ?? err?.error_description ?? "").toLowerCase();
  const status = err?.status ?? err?.statusCode;
  const code = String(err?.code ?? "").toUpperCase();
  if (status === 401) return true;
  if (code === "PGRST301" || code === "PGRST302") return true; // JWT expirado / inválido no PostgREST
  return (
    msg.includes("jwt expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("jwt is expired") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    msg.includes("refresh_token_not_found") ||
    msg.includes("token has expired")
  );
}

let expiredNotified = false;

export function notifySessionExpired(): void {
  if (typeof window === "undefined") return;
  if (expiredNotified) return;
  expiredNotified = true;
  // Zera o flag depois de 5s (caso o usuário reautentique na mesma sessão).
  setTimeout(() => { expiredNotified = false; }, 5000);
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

export function extractSupabaseErrorMessage(err: any, fallback = "Falha ao acessar o banco de dados"): string {
  if (!err) return fallback;
  return (
    err?.message ||
    err?.error_description ||
    err?.hint ||
    err?.details ||
    fallback
  );
}

/**
 * Trata um erro do Supabase: se for sessão expirada dispara o evento e
 * silencia o toast (o listener global já mostra "Sessão expirada"); caso
 * contrário emite um toast de erro com a mensagem real.
 * Retorna `true` se o erro foi de sessão (para o chamador decidir cortar
 * o fluxo sem mostrar outra mensagem).
 */
export function handleSupabaseError(err: any, fallbackMsg?: string): boolean {
  if (!err) return false;
  if (isAuthExpiredError(err)) {
    notifySessionExpired();
    return true;
  }
  toast.error(extractSupabaseErrorMessage(err, fallbackMsg));
  return false;
}

/**
 * Executa uma query Supabase (thenable) e:
 *  - Retorna `data` em sucesso.
 *  - Em erro: dispara toast (a menos que `silent`) e lança o erro.
 *  - Trata sessão expirada globalmente.
 *
 * Uso: `const rows = await runQuery(supabase.from("x").select("*").eq(...));`
 */
export async function runQuery<T = any>(
  builder: PromiseLike<{ data: T | null; error: any }>,
  opts?: { silent?: boolean; fallbackMsg?: string }
): Promise<T> {
  const { data, error } = await builder;
  if (error) {
    if (!opts?.silent) handleSupabaseError(error, opts?.fallbackMsg);
    throw error;
  }
  return data as T;
}

/**
 * Versão para telas de listagem: nunca lança. Retorna `{ data, error }`.
 * Já mostra toast em erro e captura sessão expirada. Ideal para popular
 * estado + habilitar botão "Tentar novamente".
 */
export async function loadQuery<T = any>(
  builder: PromiseLike<{ data: T | null; error: any }>,
  opts?: { silent?: boolean; fallbackMsg?: string }
): Promise<{ data: T | null; error: any | null }> {
  const { data, error } = await builder;
  if (error && !opts?.silent) handleSupabaseError(error, opts?.fallbackMsg);
  return { data: (data ?? null) as T | null, error: error ?? null };
}