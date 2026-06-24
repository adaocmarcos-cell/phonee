import { supabase } from "@/integrations/supabase/client";

const SID_KEY = "phn_sid";

function sessionId(): string {
  try {
    let s = sessionStorage.getItem(SID_KEY);
    if (!s) {
      s = (crypto as any).randomUUID?.() ?? String(Math.random()).slice(2);
      sessionStorage.setItem(SID_KEY, s!);
    }
    return s!;
  } catch {
    return String(Math.random()).slice(2);
  }
}

/**
 * Registra uma visita de página em public.page_visits.
 * Não bloqueia render — falhas são silenciosas.
 */
export function trackPageVisit(path?: string) {
  if (typeof window === "undefined") return;
  try {
    const p = path ?? window.location.pathname + window.location.search;
    (supabase as any).from("page_visits").insert({
      path: p.slice(0, 500),
      session_id: sessionId(),
      user_agent: navigator.userAgent?.slice(0, 1000) ?? null,
      referrer: document.referrer ? document.referrer.slice(0, 1000) : null,
    }).then(() => { /* noop */ });
  } catch { /* noop */ }
}