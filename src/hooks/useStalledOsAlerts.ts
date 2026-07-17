import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { OS_TERMINAL_STATUSES, OS_STATUS_LABEL, fmtOS } from "@/lib/osStatus";
import { pushLocalNotification } from "@/components/layout/NotificationsBell";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DAY_MS = 86_400_000;

/** Scans open OSs and emits bell notifications for any past the store's stalled limit. */
export function useStalledOsAlerts() {
  const { store } = useAuth();

  useEffect(() => {
    if (!store?.id) return;
    const stalledDays = Number((store as any)?.os_stalled_days ?? 3);

    let cancelled = false;

    const scan = async () => {
      try {
        const { data: os } = await (supabase as any)
          .from("service_orders")
          .select("id, os_number, customer_name, status, created_at")
          .eq("store_id", store.id);
        if (cancelled || !os?.length) return;

        const open = (os as any[]).filter((r) => !OS_TERMINAL_STATUSES.has(r.status));
        if (open.length === 0) return;

        const ids = open.map((r) => r.id);
        const { data: hist } = await (supabase as any)
          .from("os_status_history")
          .select("os_id, changed_at")
          .in("os_id", ids)
          .order("changed_at", { ascending: false });

        const last = new Map<string, string>();
        (hist || []).forEach((h: any) => {
          if (!last.has(h.os_id)) last.set(h.os_id, h.changed_at);
        });

        const now = Date.now();
        const today = new Date().toISOString().slice(0, 10);
        open.forEach((r) => {
          const lastTs = last.get(r.id) ?? r.created_at;
          const days = (now - new Date(lastTs).getTime()) / DAY_MS;
          if (days < stalledDays) return;
          pushLocalNotification({
            id: `stalled-${r.id}-${today}`,
            title: `OS ${fmtOS(r.os_number)} parada há ${Math.floor(days)}d`,
            body: `${r.customer_name} · ${OS_STATUS_LABEL[r.status] ?? r.status}. Toque para abrir e atualizar o status.`,
            url: `/painel/ordens/${r.id}`,
            ts: Date.now(),
          });
        });
      } catch {
        // silent
      }
    };

    scan();
    const t = setInterval(scan, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [store?.id, (store as any)?.os_stalled_days]);
}