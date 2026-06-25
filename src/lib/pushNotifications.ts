import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY =
  "BBiAdvp20dLTB16rhhJuU_dcKYikXnO5hS0ELqlmxWjjq0SoqZx-J5U6xALAeEy7rFi3irCwZJ87NkWr_rnycT8";

const SW_PATH = "/push-sw.js";

export function isPushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registerSW(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  return await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch { return null; }
}

export async function subscribeToPush(storeId?: string | null): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: perm };

  const reg = await registerSW();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const subJson = sub.toJSON();
  const { error } = await supabase.functions.invoke("save-push-subscription", {
    body: { action: "subscribe", subscription: subJson, store_id: storeId ?? null },
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return true;
  const sub = await getCurrentSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch {}
  await supabase.functions.invoke("save-push-subscription", {
    body: { action: "unsubscribe", endpoint },
  });
  return true;
}

export async function sendTestPush(storeId: string): Promise<boolean> {
  const { error } = await supabase.functions.invoke("send-push-notification", {
    body: { event: "test", store_id: storeId },
  });
  return !error;
}