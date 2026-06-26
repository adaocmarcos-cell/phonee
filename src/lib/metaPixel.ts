import { supabase } from "@/integrations/supabase/client";

const CONSENT_KEY = "phn_cookie_consent_v1";
const SESSION_KEY = "phn_pixel_session";
const ATTRIBUTION_KEY = "phn_attribution_v1";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
type UtmKey = typeof UTM_KEYS[number];

export interface AttributionData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landing_path?: string;
  captured_at?: string;
}

/**
 * Captura UTMs/referrer da URL atual e persiste em sessionStorage para
 * acompanhar todos os eventos da sessão (first-touch da sessão).
 */
export function captureAttribution(): AttributionData {
  if (typeof window === "undefined") return {};
  let existing: AttributionData = {};
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (raw) existing = JSON.parse(raw) as AttributionData;
  } catch { /* noop */ }

  try {
    const params = new URLSearchParams(window.location.search);
    const fresh: AttributionData = {};
    let hasUtm = false;
    UTM_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) { (fresh as any)[k] = v.slice(0, 200); hasUtm = true; }
    });
    if (hasUtm || !existing.captured_at) {
      const merged: AttributionData = {
        ...existing,
        ...(hasUtm ? fresh : {}),
        referrer: existing.referrer || (document.referrer ? document.referrer.slice(0, 500) : undefined),
        landing_path: existing.landing_path || window.location.pathname + window.location.search,
        captured_at: existing.captured_at || new Date().toISOString(),
      };
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(merged));
      return merged;
    }
    return existing;
  } catch { return existing; }
}

export function getAttribution(): AttributionData {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    return raw ? (JSON.parse(raw) as AttributionData) : {};
  } catch { return {}; }
}

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
  const attribution = captureAttribution();

  // Browser pixel
  try {
    const fbq = (window as any).fbq;
    if (typeof fbq === "function") {
      const cd: any = { ...(opts.custom || {}), ...attribution };
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
        custom_data: { ...(opts.custom || {}), ...attribution },
        session_id,
        test_event_code: test_event_code || undefined,
        log_browser_echo: true,
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        utm_term: attribution.utm_term,
        utm_content: attribution.utm_content,
        referrer: attribution.referrer,
        landing_path: attribution.landing_path,
      },
    });
  } catch { /* noop */ }

  return event_id;
}