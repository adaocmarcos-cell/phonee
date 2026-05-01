import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function Alertas() {
  const { store } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);

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

  return (
    <div>
      <PageHeader
        title="Central de alertas"
        description="Tudo que precisa da sua atenção, em ordem de prioridade."
        actions={
          <>
            <Button variant="outline" onClick={scan} disabled={scanning}><RefreshCw className={`h-4 w-4 mr-1 ${scanning ? "animate-spin" : ""}`} />Verificar agora</Button>
            <Button variant="outline" onClick={markAll}><Check className="h-4 w-4 mr-1" />Marcar tudo como lido</Button>
          </>
        }
      />

      {alerts.length === 0 ? (
        <Card className="p-16 bg-card border-border text-center bg-grid">
          <Bell className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sem alertas. Clique em "Verificar agora" para escanear seu estoque.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id} className={`p-4 bg-card border-border shadow-card flex items-start gap-3 ${a.is_read ? "opacity-60" : ""}`}>
              <Badge className={`${sevColor(a.severity)} mt-0.5`}>{a.severity.toUpperCase()}</Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{a.title}</div>
                {a.message && <div className="text-sm text-muted-foreground mt-0.5">{a.message}</div>}
                <div className="text-[11px] font-mono text-muted-foreground/70 mt-1">{new Date(a.created_at).toLocaleString("pt-BR")}</div>
              </div>
              {!a.is_read && (
                <Button size="sm" variant="ghost" onClick={() => markRead(a.id)}><Check className="h-4 w-4" /></Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}