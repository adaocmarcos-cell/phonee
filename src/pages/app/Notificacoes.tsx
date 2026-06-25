import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, CheckCheck, Trash2, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

type NotificationItem = {
  id: string;
  title: string;
  body?: string;
  url?: string;
  ts: number;
  read: boolean;
};

const STORAGE_KEY = "phonee:notification_history";
const MAX_ITEMS = 50;

function loadHistory(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items: NotificationItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {}
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d}d`;
  return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Notificacoes() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>(() => loadHistory());
  const unread = items.filter((i) => !i.read).length;

  useEffect(() => {
    try {
      localStorage.removeItem("phonee:new_notification");
      window.dispatchEvent(new Event("phonee:new_notification"));
    } catch {}

    const onSwMessage = (e: MessageEvent) => {
      if (e?.data?.type !== "phonee:new_notification") return;
      const p = e.data.payload || {};
      const entry: NotificationItem = {
        id: `${p.ts ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: p.title || "Notificação",
        body: p.body || "",
        url: p.url || "/painel",
        ts: p.ts || Date.now(),
        read: false,
      };
      setItems((prev) => {
        const next = [entry, ...prev].slice(0, MAX_ITEMS);
        saveHistory(next);
        return next;
      });
    };
    navigator.serviceWorker?.addEventListener?.("message", onSwMessage);
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === STORAGE_KEY) setItems(loadHistory());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      navigator.serviceWorker?.removeEventListener?.("message", onSwMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const markAllRead = () => {
    setItems((prev) => {
      const next = prev.map((i) => ({ ...i, read: true }));
      saveHistory(next);
      return next;
    });
  };

  const clearAll = () => {
    setItems([]);
    saveHistory([]);
  };

  const handleClick = (item: NotificationItem) => {
    setItems((prev) => {
      const next = prev.map((i) => (i.id === item.id ? { ...i, read: true } : i));
      saveHistory(next);
      return next;
    });
    if (item.url) navigate(item.url.startsWith("http") ? "/painel" : item.url);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notificações"
        description={unread > 0 ? `${unread} não lida${unread > 1 ? "s" : ""}` : "Tudo em dia"}
        actions={
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <Button variant="outline" size="sm" onClick={markAllRead}>
                <CheckCheck className="h-4 w-4 mr-1" /> Ler todas
              </Button>
            )}
            {items.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearAll}>
                <Trash2 className="h-4 w-4 mr-1" /> Limpar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate("/painel/configuracoes?tab=notificacoes")}>
              <SettingsIcon className="h-4 w-4 mr-1" /> Configurar
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <BellOff className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-base font-medium text-muted-foreground">Nenhuma notificação nova</p>
            <p className="text-sm text-muted-foreground/70 max-w-md">
              Quando houver vendas, alertas de estoque, contas a vencer ou outros avisos, eles aparecerão aqui.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate("/painel/configuracoes?tab=notificacoes")}>
              <Bell className="h-4 w-4 mr-1" /> Configurar notificações push
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleClick(item)}
                  className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors ${
                    item.read ? "bg-transparent opacity-70 hover:bg-muted/40" : "bg-primary/5 hover:bg-primary/10"
                  }`}
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${item.read ? "bg-muted-foreground/30" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm truncate ${item.read ? "font-normal text-muted-foreground" : "font-semibold text-foreground"}`}>
                        {item.title}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(item.ts)}</span>
                    </div>
                    {item.body && (
                      <p className={`text-sm mt-0.5 ${item.read ? "text-muted-foreground/80" : "text-muted-foreground"}`}>
                        {item.body}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}