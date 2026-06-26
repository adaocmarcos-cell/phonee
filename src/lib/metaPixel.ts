import { supabase } from "@/integrations/supabase/client";

const CONSENT_KEY = "phn_cookie_consent_v1";
const SESSION_KEY = "phn_pixel_session";

export function getConsent(): "granted" | "denied" | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch { return null; }
}

export function setConsent(v: "granted" | "denied") {
  try {
    localStorage.setItem(CONSENT_KEY, v);
    window.dispatchEvent(new CustomEvent("phn:consent-change", { detail: v }));
  } catch { /* noop */ }
}

export function getTestEventCode(): string | null {
  try { return localStorage.getItem("phn_meta_test_event_code"); } catch { return null; }
}

export function setTestEventCode(code: string | null) {
  try {
    if (code) localStorage.setItem("phn_meta_test_event_code", code);
    else localStorage.removeItem("phn_meta_test_event_code");
  } catch { /* noop */ }
}

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch { return Math.random().toString(36).slice(2); }
}

function getCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, "\\$1") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

export interface TrackOptions {
  value?: number;
  currency?: string;
  email?: string;
  phone?: string;
  custom?: Record<string, unknown>;
  /** força envio mesmo sem consentimento explícito (somente p/ debug). */
  force?: boolean;
}

/**
 * Dispara um evento padrão do Meta: envia tanto pelo browser pixel (se carregado)
 * quanto pelo Conversions API server-side (via edge function). Usa um event_id
 * compartilhado para deduplicação.
 */
export async function trackMetaEvent(event_name: string, opts: TrackOptions = {}) {
  const consent = getConsent();
  if (consent !== "granted" && !opts.force) return;

  const event_id = crypto.randomUUID();
  const event_source_url = typeof window !== "undefined" ? window.location.href : undefined;
  const test_event_code = getTestEventCode();
  const session_id = getSessionId();

  // Browser pixel
  try {
    const fbq = (window as any).fbq;
    if (typeof fbq === "function") {
      const cd: any = { ...(opts.custom || {}) };
      if (typeof opts.value === "number") cd.value = opts.value;
      if (opts.currency) cd.currency = opts.currency;
      fbq("track", event_name, cd, { eventID: event_id });
    }
  } catch { /* noop */ }

  // Server CAPI
  try {
    await supabase.functions.invoke("meta-capi-track", {
      body: {
        event_name,
        event_id,
        event_source_url,
        value: opts.value,
        currency: opts.currency || "BRL",
        email: opts.email,
        phone: opts.phone,
        fbp: getCookie("_fbp"),
        fbc: getCookie("_fbc"),
        custom_data: opts.custom,
        session_id,
        test_event_code: test_event_code || undefined,
        log_browser_echo: true,
      },
    });
  } catch { /* noop */ }

  return event_id;
}