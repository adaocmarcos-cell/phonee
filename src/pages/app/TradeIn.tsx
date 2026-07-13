import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Smartphone, Search, ArrowLeft, CheckCircle2, CircleOff, HelpCircle, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toSimpleStatus, reasonSubtext, SIMPLE_STATUS_TOOLTIP } from "@/lib/tradeInStatus";
import { evaluateCompleteness } from "@/lib/tradeInCompleteness";

type TI = {
  id: string; customer_name: string; model: string; brand: string | null;
  imei: string | null; condition: string; status: string;
  entry_value: number; intended_sale_value: number; created_at: string;
  checklist?: any; photos_in?: string[] | null;
};

export default function TradeIn() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TI[]>([]);
  const [loading, setLoading] = useState(true);
  // Persistent filters (survive navigation between list and form)
  const FK = "tradein.filters.v1";
  const saved = (() => {
    try { return JSON.parse(sessionStorage.getItem(FK) || "{}"); } catch { return {}; }
  })();
  const [q, setQ] = useState<string>(saved.q ?? "");
  // simple filter: "todos" | "em_estoque" | "desativado"
  const [status, setStatus] = useState<string>(saved.status ?? "todos");
  const [periodo, setPeriodo] = useState<string>(saved.periodo ?? "90");

  useEffect(() => {
    sessionStorage.setItem(FK, JSON.stringify({ q, status, periodo }));
  }, [q, status, periodo]);

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("trade_ins")
        .select("id, customer_name, model, brand, imei, condition, status, entry_value, intended_sale_value, created_at, checklist, photos_in")
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
      const simple = toSimpleStatus(r.status);
      if (status !== "todos" && simple !== status) return false;
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      if (term) {
        const hay = `${r.customer_name} ${r.model} ${r.brand ?? ""} ${r.imei ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, status, periodo]);

  return (
    <TooltipProvider>
    <div>
      <PageHeader
        title="Compra & Troca · Entradas"
        description="Controle de entradas de aparelhos usados. Saídas acontecem sempre por uma Venda."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/painel/estoque")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao estoque
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
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="em_estoque">Em estoque</SelectItem>
              <SelectItem value="desativado">Desativado</SelectItem>
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
                  <Smartphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
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
                const simple = toSimpleStatus(r.status);
                const reason = reasonSubtext(r.status);
                return (
                  <tr key={r.id} className="hover:bg-surface-elevated/40 cursor-pointer" onClick={() => navigate(`/painel/troca/${r.id}/detalhes`)}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.customer_name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.model}</div>
                      {r.brand && <div className="text-[11px] text-muted-foreground">{r.brand}</div>}
                      {(() => {
                        const c = evaluateCompleteness(r);
                        if (c.complete) return null;
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-warning">
                                <AlertTriangle className="h-3 w-3" /> ficha incompleta
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {c.missing.join(" · ")}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.imei || "—"}</td>
                    <td className="px-4 py-3 capitalize text-xs">{r.condition.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-right metric">{brl(Number(r.entry_value))}</td>
                    <td className="px-4 py-3 text-right metric">{brl(Number(r.intended_sale_value))}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`metric text-xs ${margin >= 25 ? "text-success" : margin >= 10 ? "text-warning" : "text-danger"}`}>{margin.toFixed(0)}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-0.5">
                        <div className="flex items-center gap-1">
                          <Badge className={simple === "em_estoque"
                            ? "bg-success/15 text-success border-success/30"
                            : "bg-muted text-muted-foreground border-border"}>
                            {simple === "em_estoque"
                              ? <CheckCircle2 className="h-3 w-3 mr-1" />
                              : <CircleOff className="h-3 w-3 mr-1" />}
                            {simple === "em_estoque" ? "Em estoque" : "Desativado"}
                          </Badge>
                          <Tooltip>
                            <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
                            </TooltipTrigger>
                            <TooltipContent>{SIMPLE_STATUS_TOOLTIP[simple]}</TooltipContent>
                          </Tooltip>
                        </div>
                        {reason && <span className="text-[10px] text-muted-foreground">{reason}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
    </TooltipProvider>
  );
}