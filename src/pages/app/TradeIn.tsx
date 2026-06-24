import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Smartphone, Search, History, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/format";

type TI = {
  id: string; customer_name: string; model: string; brand: string | null;
  imei: string | null; condition: string; status: string;
  entry_value: number; intended_sale_value: number; created_at: string;
};

const statusBadge: Record<string, string> = {
  em_avaliacao: "bg-warning/15 text-warning border-warning/30",
  aprovado: "bg-primary/15 text-primary border-primary/30",
  em_estoque: "bg-success/15 text-success border-success/30",
  vendido: "bg-muted text-muted-foreground border-border",
  recusado: "bg-danger/15 text-danger border-danger/30",
};
const statusLabel: Record<string, string> = {
  em_avaliacao: "Em avaliação", aprovado: "Aprovado", em_estoque: "Em estoque",
  vendido: "Vendido", recusado: "Recusado",
};

const HISTORIC_STATUSES = new Set(["vendido", "recusado"]);

export default function TradeIn() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TI[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"ativos" | "historico">("ativos");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("todos");
  const [periodo, setPeriodo] = useState<string>("90");

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("trade_ins")
        .select("id, customer_name, model, brand, imei, condition, status, entry_value, intended_sale_value, created_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });
      setRows((data ?? []) as TI[]);
      setLoading(false);
    })();
  }, [store]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const days = parseInt(periodo, 10);
    const cutoff = isNaN(days) ? null : Date.now() - days * 86400_000;
    return rows.filter((r) => {
      const isHist = HISTORIC_STATUSES.has(r.status);
      if (view === "ativos" && isHist) return false;
      if (view === "historico" && !isHist) return false;
      if (status !== "todos" && r.status !== status) return false;
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      if (term) {
        const hay = `${r.customer_name} ${r.model} ${r.brand ?? ""} ${r.imei ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, status, periodo, view]);

  const activeStatuses = view === "historico"
    ? ["vendido", "recusado"]
    : ["em_avaliacao", "aprovado", "em_estoque"];

  return (
    <div>
      <PageHeader
        title="Compra & Troca · Entradas"
        description="Controle de entradas de aparelhos usados. Saídas acontecem sempre por uma Venda."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={view === "historico" ? "default" : "outline"}
              onClick={() => setView(view === "historico" ? "ativos" : "historico")}
            >
              <History className="h-4 w-4 mr-1" /> {view === "historico" ? "Ver ativos" : "Histórico"}
            </Button>
            <Button onClick={() => navigate("/painel/troca/novo")} className="bg-gradient-primary shadow-glow">
              <Plus className="h-4 w-4 mr-1" /> Lançar entrada
            </Button>
          </div>
        }
      />

      {/* Filtros */}
      <Card className="p-3 mb-4 bg-card border-border">
        <div className="grid md:grid-cols-[1fr_180px_180px] gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente, modelo, marca ou IMEI…" className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {activeStatuses.map((s) => (
                <SelectItem key={s} value={s}>{statusLabel[s] ?? s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="365">Último ano</SelectItem>
              <SelectItem value="all">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Aparelho</th>
                <th className="text-left px-4 py-3 font-medium">IMEI</th>
                <th className="text-left px-4 py-3 font-medium">Condição</th>
                <th className="text-right px-4 py-3 font-medium">Entrada</th>
                <th className="text-right px-4 py-3 font-medium">Venda</th>
                <th className="text-right px-4 py-3 font-medium">Margem</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center">
                  {view === "historico" ? (
                    <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  ) : (
                    <Smartphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  )}
                  <p className="text-sm text-muted-foreground mb-3">
                    {rows.length === 0
                      ? "Nenhuma entrada registrada ainda."
                      : "Nenhum resultado para os filtros aplicados."}
                  </p>
                  {rows.length === 0 && (
                    <Button onClick={() => navigate("/painel/troca/novo")} className="bg-gradient-primary">
                      <Plus className="h-4 w-4 mr-1" /> Lançar primeira entrada
                    </Button>
                  )}
                </td></tr>
              ) : filtered.map((r) => {
                const margin = r.intended_sale_value > 0 ? ((r.intended_sale_value - r.entry_value) / r.intended_sale_value) * 100 : 0;
                return (
                  <tr key={r.id} className="hover:bg-surface-elevated/40 cursor-pointer" onClick={() => navigate(`/painel/troca/${r.id}`)}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.customer_name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.model}</div>
                      {r.brand && <div className="text-[11px] text-muted-foreground">{r.brand}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.imei || "—"}</td>
                    <td className="px-4 py-3 capitalize text-xs">{r.condition.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-right metric">{brl(Number(r.entry_value))}</td>
                    <td className="px-4 py-3 text-right metric">{brl(Number(r.intended_sale_value))}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`metric text-xs ${margin >= 25 ? "text-success" : margin >= 10 ? "text-warning" : "text-danger"}`}>{margin.toFixed(0)}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusBadge[r.status] ?? ""}>{statusLabel[r.status] ?? r.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}