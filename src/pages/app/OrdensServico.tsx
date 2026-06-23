import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/MetricCard";
import { brl, num } from "@/lib/format";
import {
  Plus, Wrench, Search, Clock, CheckCircle2, AlertCircle, PackageCheck, Timer, TrendingUp,
  Hammer, Receipt,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  aguardando_orcamento: "Aguard. orçamento",
  aguardando_aprovacao: "Aguard. aprovação",
  aguardando_peca: "Aguard. peça",
  em_reparo: "Em reparo",
  em_testes: "Em testes",
  pronto_retirada: "Pronto p/ retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  recebido: "bg-slate-100 text-slate-700 border-slate-300",
  em_analise: "bg-blue-50 text-blue-700 border-blue-200",
  aguardando_orcamento: "bg-amber-50 text-amber-700 border-amber-200",
  aguardando_aprovacao: "bg-amber-50 text-amber-700 border-amber-200",
  aguardando_peca: "bg-orange-50 text-orange-700 border-orange-200",
  em_reparo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  em_testes: "bg-purple-50 text-purple-700 border-purple-200",
  pronto_retirada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  entregue: "bg-green-50 text-green-700 border-green-200",
  cancelado: "bg-rose-50 text-rose-700 border-rose-200",
};

const fmtOS = (n?: number | null) => `OS #${String(n ?? 0).padStart(4, "0")}`;

export default function OrdensServico() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (!store) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("service_orders")
        .select("*")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(500);
      setRows(data ?? []);
    })();
  }, [store]);

  const stats = useMemo(() => {
    const c = (s: string) => rows.filter((r) => r.status === s).length;
    const open = rows.filter((r) => !["entregue", "cancelado"].includes(r.status));
    const delivered = rows.filter((r) => r.status === "entregue");
    const revenue = delivered.reduce((s, r) => s + Number(r.total_value || 0), 0);
    // Tempo médio reparo (start->end days)
    const withDates = delivered.filter((r) => r.start_date && r.end_date);
    const avgDays = withDates.length
      ? withDates.reduce((s, r) => s + (new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86400_000, 0) / withDates.length
      : 0;
    const budgeted = rows.filter((r) => r.budget_status !== "pendente");
    const approveRate = budgeted.length
      ? (budgeted.filter((r) => r.budget_status === "aprovado").length / budgeted.length) * 100
      : 0;
    // Serviços mais executados
    const reasonsCount: Record<string, number> = {};
    rows.forEach((r) => (r.reasons ?? []).forEach((x: string) => (reasonsCount[x] = (reasonsCount[x] || 0) + 1)));
    const topReasons = Object.entries(reasonsCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      open: open.length,
      em_analise: c("em_analise"),
      aguardando_aprovacao: c("aguardando_aprovacao"),
      em_reparo: c("em_reparo"),
      pronto_retirada: c("pronto_retirada"),
      entregue: delivered.length,
      revenue, avgDays, approveRate, topReasons,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (q) {
        const needle = q.toLowerCase();
        return (
          String(r.customer_name || "").toLowerCase().includes(needle) ||
          String(r.device_model || "").toLowerCase().includes(needle) ||
          String(r.device_imei1 || "").includes(needle) ||
          fmtOS(r.os_number).toLowerCase().includes(needle) ||
          String(r.os_number ?? "").includes(needle.replace(/\D/g, ""))
        );
      }
      return true;
    });
  }, [rows, q, filter]);

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        description="Assistência técnica com rastreabilidade completa."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/app/pecas?tab=pecas")}>
              <Hammer className="h-4 w-4 mr-1" />Peças
            </Button>
            <Button variant="outline" onClick={() => navigate("/app/pecas?tab=ferramentas")}>
              <Wrench className="h-4 w-4 mr-1" />Ferramentas
            </Button>
            <Button variant="outline" onClick={() => navigate("/app/pecas?tab=compras")}>
              <ShoppingCart className="h-4 w-4 mr-1" />Centro de compras
            </Button>
            <Button onClick={() => navigate("/app/os/nova")} className="bg-primary text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4 mr-1" />Nova ordem de serviço
            </Button>
          </div>
        }
      />

      {/* Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="OS abertas" value={num(stats.open)} icon={Clock} tone="info" />
        <MetricCard label="Em reparo" value={num(stats.em_reparo)} icon={Wrench} tone="violet" />
        <MetricCard label="Prontas p/ retirada" value={num(stats.pronto_retirada)} icon={PackageCheck} tone="success" />
        <MetricCard label="Aguard. aprovação" value={num(stats.aguardando_aprovacao)} icon={AlertCircle} tone="warning" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Faturamento (entregues)" value={brl(stats.revenue)} icon={TrendingUp} tone="primary" />
        <MetricCard label="Tempo médio de reparo" value={`${stats.avgDays.toFixed(1)} d`} icon={Timer} tone="info" />
        <MetricCard label="Aprovação de orçamento" value={`${stats.approveRate.toFixed(0)}%`} icon={CheckCircle2} tone="success" />
      </div>

      {stats.topReasons.length > 0 && (
        <Card className="p-4 mb-4 bg-card border-border shadow-card">
          <h3 className="font-semibold text-sm mb-3">Serviços mais executados</h3>
          <div className="flex flex-wrap gap-2">
            {stats.topReasons.map(([r, n]) => (
              <Badge key={r} variant="outline" className="capitalize">{r} · {n}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Filtros */}
      <Card className="bg-card border-border shadow-card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="OS, cliente, modelo ou IMEI" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-8" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["all", "recebido", "em_analise", "aguardando_aprovacao", "em_reparo", "pronto_retirada", "entregue"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                filter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/40"
              }`}
            >{s === "all" ? "Todos" : STATUS_LABEL[s]}</button>
          ))}
        </div>
      </Card>

      {/* Lista */}
      <Card className="bg-card border-border shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma ordem de serviço encontrada.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">OS</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Aparelho</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Entrada</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/app/os/${r.id}`)} className="hover:bg-surface-elevated/40 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-xs text-primary font-bold">{fmtOS(r.os_number)}</td>
                  <td className="px-4 py-3 font-medium">{r.customer_name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {[r.device_brand, r.device_model].filter(Boolean).join(" ")} {r.device_color && `· ${r.device_color}`}
                  </td>
                  <td className="px-4 py-3"><Badge variant="outline" className={STATUS_COLOR[r.status] ?? ""}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 text-right metric font-semibold">{brl(Number(r.total_value || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}