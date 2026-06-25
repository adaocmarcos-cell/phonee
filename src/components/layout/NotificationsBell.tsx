import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Trash2, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>(() => loadHistory());
  const [open, setOpen] = useState(false);

  const unread = items.filter((i) => !i.read).length;

  useEffect(() => {
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
    try {
      localStorage.removeItem("phonee:new_notification");
      window.dispatchEvent(new Event("phonee:new_notification"));
    } catch {}
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
    setOpen(false);
    if (item.url) navigate(item.url.startsWith("http") ? "/painel" : item.url);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-[1.15rem] w-[1.15rem]" />
          {unread > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-[16px] text-center ring-2 ring-background"
              aria-label={`${unread} notificações não lidas`}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Notificações</span>
            <span className="text-[11px] text-muted-foreground">
              {unread > 0 ? `${unread} não lida${unread > 1 ? "s" : ""}` : "Tudo em dia"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={markAllRead}
                title="Marcar todas como lidas"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Ler todas
              </Button>
            )}
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-danger"
                onClick={clearAll}
                title="Limpar histórico"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <BellOff className="h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm font-medium text-muted-foreground">
                Nenhuma notificação nova
              </p>
              <p className="text-[11px] text-muted-foreground/70 max-w-[240px]">
                Quando houver novas vendas, alertas de estoque ou avisos, eles aparecem aqui.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(item)}
                    className={`w-full text-left px-3 py-2.5 flex gap-2 items-start transition-colors ${
                      item.read
                        ? "bg-transparent opacity-70 hover:bg-muted/40"
                        : "bg-primary/5 hover:bg-primary/10"
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        item.read ? "bg-muted-foreground/30" : "bg-primary"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`text-sm truncate ${
                            item.read ? "font-normal text-muted-foreground" : "font-semibold text-foreground"
                          }`}
                        >
                          {item.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatTime(item.ts)}
                        </span>
                      </div>
                      {item.body && (
                        <p
                          className={`text-xs mt-0.5 line-clamp-2 ${
                            item.read ? "text-muted-foreground/80" : "text-muted-foreground"
                          }`}
                        >
                          {item.body}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => {
              setOpen(false);
              navigate("/painel/configuracoes?tab=notificacoes");
            }}
          >
            Configurar notificações
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}