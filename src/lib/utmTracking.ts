/**
 * Captura UTMs da URL atual e persiste em localStorage para atribuir
 * futuros formulários / mensagens de WhatsApp ao anúncio que trouxe o lead.
 */

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmData = Partial<Record<UtmKey, string>>;

const STORAGE_KEY = "phn_utm_v1";

export function captureUtms(): UtmData {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const fresh: UtmData = {};
    let hasNew = false;
    UTM_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) {
        fresh[k] = v.slice(0, 200);
        hasNew = true;
      }
    });
    if (hasNew) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return getUtms();
  } catch {
    return {};
  }
}

export function getUtms(): UtmData {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UtmData) : {};
  } catch {
    return {};
  }
}

export function clearUtms() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}