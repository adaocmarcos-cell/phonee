import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, RefreshCw, ExternalLink, Archive, ArchiveRestore, PackagePlus, Wrench, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

type StatusFilter = "abertos" | "arquivados" | "resolvidos" | "todos";

export default function Alertas() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("abertos");

  const counts = useMemo(() => ({
    abertos: alerts.filter((a) => (a.status ?? "open") === "open").length,
    arquivados: alerts.filter((a) => a.status === "archived").length,
    resolvidos: alerts.filter((a) => a.status === "resolved").length,
    todos: alerts.length,
  }), [alerts]);

  const visible = useMemo(() => {
    if (filter === "todos") return alerts;
    const map: Record<StatusFilter, string> = { abertos: "open", arquivados: "archived", resolvidos: "resolved", todos: "" };
    const st = map[filter];
    return alerts.filter((a) => (a.status ?? "open") === st);
  }, [alerts, filter]);

  const load = async () => {
    if (!store) return;
    const { data } = await supabase
      .from("alerts")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });
    setAlerts(data ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  const markRead = async (id: string) => {
    await supabase.from("alerts").update({ is_read: true }).eq("id", id);
    load();
  };

  const markAll = async () => {
    if (!store) return;
    await supabase.from("alerts").update({ is_read: true }).eq("store_id", store.id).eq("is_read", false);
    toast.success("Tudo marcado como lido");
    load();
  };

  const setStatus = async (id: string, status: "open" | "archived" | "resolved") => {
    setBusyId(id);
    const { error } = await (supabase as any).rpc("set_alert_status", { _alert_id: id, _status: status, _note: null });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(status === "archived" ? "Alerta arquivado" : status === "resolved" ? "Alerta resolvido" : "Alerta reaberto");
    load();
  };

  const runAction = async (a: any, action: "create_replenishment_order" | "fix_tradein_cost" | "mark_resolved") => {
    setBusyId(a.id);
    const { data, error } = await (supabase as any).rpc("resolve_alert_action", {
      _alert_id: a.id, _action: action, _params: {},
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    if (action === "create_replenishment_order") toast.success("Pedido de reposição criado em rascunho");
    else if (action === "fix_tradein_cost") toast.success("Custo do produto corrigido");
    else toast.success("Alerta marcado como resolvido");
    load();
    if (data?.link && action === "create_replenishment_order") setTimeout(() => navigate(data.link), 400);
  };

  // Scans products and generates alerts (low stock, stalled)
  const scan = async () => {
    if (!store) return;
    setScanning(true);
    const { data: prods } = await supabase
      .from("products")
      .select("id, name, stock_current, stock_min, last_sold_at")
      .eq("store_id", store.id);

    const newAlerts: any[] = [];
    (prods ?? []).forEach((p) => {
      if (p.stock_current <= p.stock_min) {
        newAlerts.push({
          store_id: store.id, type: "stock_low", severity: p.stock_current === 0 ? "danger" : "warning",
          title: `Estoque baixo: ${p.name}`,
          message: `Restam ${p.stock_current} un. (mínimo ${p.stock_min})`,
        });
      }
      if (p.last_sold_at) {
        const days = Math.floor((Date.now() - new Date(p.last_sold_at).getTime()) / (1000 * 60 * 60 * 24));
        if (days >= 45) {
          newAlerts.push({
            store_id: store.id, type: "stalled", severity: "info",
            title: `Encalhado: ${p.name}`,
            message: `Sem venda há ${days} dias — considere uma promoção.`,
          });
        }
      }
    });

    if (newAlerts.length > 0) {
      await supabase.from("alerts").insert(newAlerts);
      toast.success(`${newAlerts.length} novo(s) alerta(s) gerado(s)`);
    } else {
      toast.info("Nenhum novo alerta — tudo em ordem!");
    }
    setScanning(false);
    load();
  };

  const sevColor = (s: string) =>
    s === "danger" ? "bg-danger/15 text-danger border-danger/30"
    : s === "warning" ? "bg-warning/15 text-warning border-warning/30"
    : "bg-primary/10 text-primary border-primary/30";

  const statusChip = (s: string) => {
    if (s === "archived") return <Badge variant="outline" className="ml-1">Arquivado</Badge>;
    if (s === "resolved") return <Badge variant="outline" className="ml-1 border-emerald-500/30 text-emerald-600">Resolvido</Badge>;
    return null;
  };

  const availableActions = (a: any) => {
    const acts: { key: any; label: string; icon: JSX.Element; variant?: any }[] = [];
    if (a.type === "stock_low" && a.product_id) {
      acts.push({ key: "create_replenishment_order", label: "Criar pedido de reposição", icon: <PackagePlus className="h-3.5 w-3.5 mr-1" /> });
    }
    if (a.type === "tradein_cost_divergence" && a.trade_in_id && a.product_id) {
      acts.push({ key: "fix_tradein_cost", label: "Corrigir custo do item", icon: <Wrench className="h-3.5 w-3.5 mr-1" /> });
    }
    return acts;
  };

  return (
    <div>
      <PageHeader
        title="Central de alertas"
        description={
          unreadCount > 0
            ? `${unreadCount} não lido${unreadCount > 1 ? "s" : ""} · em ordem de prioridade.`
            : "Tudo em dia — nenhum alerta pendente."
        }
        actions={
          <>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setFilter("nao_lidos")}
                className={`px-3 py-1.5 text-xs ${filter === "nao_lidos" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
              >
                Não lidos {unreadCount > 0 && <span className="ml-1 font-mono">({unreadCount})</span>}
              </button>
              <button
                onClick={() => setFilter("todos")}
                className={`px-3 py-1.5 text-xs ${filter === "todos" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
              >
                Todos <span className="ml-1 font-mono">({alerts.length})</span>
              </button>
            </div>
            <Button variant="outline" onClick={scan} disabled={scanning}><RefreshCw className={`h-4 w-4 mr-1 ${scanning ? "animate-spin" : ""}`} />Verificar agora</Button>
            <Button variant="outline" onClick={markAll} disabled={unreadCount === 0}>
              <Check className="h-4 w-4 mr-1" />Marcar tudo como lido
            </Button>
          </>
        }
      />

      {visible.length === 0 ? (
        <Card className="p-16 bg-card border-border text-center bg-grid">
          <Bell className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {alerts.length > 0
              ? "Nada por aqui neste filtro. Alterne para 'Todos' para revisar o histórico."
              : "Sem alertas. Clique em \"Verificar agora\" para escanear seu estoque."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => {
            const status = a.status ?? "open";
            const acts = availableActions(a);
            const meta = a.metadata ?? {};
            const isDiverg = a.type === "tradein_cost_divergence";
            return (
              <Card key={a.id} className={`p-4 bg-card border-border shadow-card ${status !== "open" ? "opacity-70" : ""}`}>
                <div className="flex items-start gap-3">
                  <Badge className={`${sevColor(a.severity)} mt-0.5`}>{String(a.severity).toUpperCase()}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {a.title}
                      {statusChip(status)}
                    </div>
                    {a.message && <div className="text-sm text-muted-foreground mt-0.5">{a.message}</div>}
                    {isDiverg && meta?.expected_cost != null && (
                      <div className="text-[11px] text-muted-foreground mt-1">
                        Esperado {brl(Number(meta.expected_cost))} · Atual {brl(Number(meta.current_cost ?? 0))} · Diff {brl(Number(meta.diff ?? 0))}
                      </div>
                    )}
                    <div className="text-[11px] font-mono text-muted-foreground/70 mt-1 flex flex-wrap gap-x-3">
                      <span>Criado: {new Date(a.created_at).toLocaleString("pt-BR")}</span>
                      {a.first_opened_at && <span>Aberto: {new Date(a.first_opened_at).toLocaleString("pt-BR")}</span>}
                      {a.resolved_at && <span>Resolvido: {new Date(a.resolved_at).toLocaleString("pt-BR")}</span>}
                      {a.archived_at && <span>Arquivado: {new Date(a.archived_at).toLocaleString("pt-BR")}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/60">
                  {a.link && (
                    <Button size="sm" variant="outline"
                      onClick={async () => { if (!a.is_read) await markRead(a.id); navigate(a.link); }}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver detalhe
                    </Button>
                  )}
                  {status === "open" && acts.map((act) => (
                    <Button key={act.key} size="sm" onClick={() => runAction(a, act.key)} disabled={busyId === a.id}>
                      {act.icon}{act.label}
                    </Button>
                  ))}
                  {status === "open" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => runAction(a, "mark_resolved")} disabled={busyId === a.id}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar resolvido
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "archived")} disabled={busyId === a.id}>
                        <Archive className="h-3.5 w-3.5 mr-1" /> Arquivar
                      </Button>
                    </>
                  )}
                  {status !== "open" && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "open")} disabled={busyId === a.id}>
                      <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Reativar
                    </Button>
                  )}
                  {!a.is_read && status === "open" && (
                    <Button size="sm" variant="ghost" onClick={() => markRead(a.id)} title="Marcar como lido" className="ml-auto">
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}