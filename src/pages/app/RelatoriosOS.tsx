import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/MetricCard";
import { NumberInput } from "@/components/NumberInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl } from "@/lib/format";
import { OS_STATUS_LABEL, OS_STATUS_COLOR, OS_STATUS_ORDER, OS_TERMINAL_STATUSES, fmtOS } from "@/lib/osStatus";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { AlertTriangle, Download, Timer, Wrench, CheckCircle2, TrendingUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type OS = any;
type Hist = {
  id: string; os_id: string; from_status: string | null; to_status: string | null;
  changed_at: string; changed_by: string | null;
};

const fmtHours = (h: number) => {
  if (!isFinite(h) || h <= 0) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
};

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#f97316", "#a855f7"];

const FILTERS_KEY = (storeId: string) => `phonee:relatoriosOs:filters:${storeId}`;

const pctDelta = (curr: number, prev: number): { text: string; positive: boolean | null } => {
  if (!isFinite(prev) || prev === 0) {
    if (curr === 0) return { text: "—", positive: null };
    return { text: "novo", positive: null };
  }
  const diff = ((curr - prev) / Math.abs(prev)) * 100;
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${diff.toFixed(1)}% vs anterior`, positive: diff >= 0 };
};

export default function RelatoriosOS() {
  const { store } = useAuth();
  const [rows, setRows] = useState<OS[]>([]);
  const [history, setHistory] = useState<Hist[]>([]);
  const [prevRows, setPrevRows] = useState<OS[]>([]);
  const [prevHistory, setPrevHistory] = useState<Hist[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tech, setTech] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stalledDays, setStalledDays] = useState<number>((store as any)?.os_stalled_days ?? 3);
  const [savingStalled, setSavingStalled] = useState(false);
  const [stageDialog, setStageDialog] = useState<{ status: string; label: string } | null>(null);
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  useEffect(() => { setStalledDays((store as any)?.os_stalled_days ?? 3); }, [(store as any)?.os_stalled_days, store?.id]);

  // Restore saved filters per store
  useEffect(() => {
    if (!store?.id) return;
    try {
      const raw = localStorage.getItem(FILTERS_KEY(store.id));
      if (raw) {
        const f = JSON.parse(raw);
        if (f.from) setFrom(f.from);
        if (f.to) setTo(f.to);
        if (f.tech) setTech(f.tech);
        if (f.statusFilter) setStatusFilter(f.statusFilter);
        if (typeof f.stalledDays === "number") setStalledDays(f.stalledDays);
      }
    } catch {}
    setFiltersHydrated(true);
  }, [store?.id]);

  // Persist filters
  useEffect(() => {
    if (!store?.id || !filtersHydrated) return;
    try {
      localStorage.setItem(
        FILTERS_KEY(store.id),
        JSON.stringify({ from, to, tech, statusFilter, stalledDays }),
      );
    } catch {}
  }, [store?.id, filtersHydrated, from, to, tech, statusFilter, stalledDays]);

  useEffect(() => {
    if (!store) return;
    setLoading(true);
    (async () => {
      const fromIso = new Date(from + "T00:00:00").toISOString();
      const toIso = new Date(to + "T23:59:59").toISOString();
      // Previous window: same span immediately before "from"
      const spanMs = new Date(toIso).getTime() - new Date(fromIso).getTime();
      const prevToIso = new Date(new Date(fromIso).getTime() - 1).toISOString();
      const prevFromIso = new Date(new Date(prevToIso).getTime() - spanMs).toISOString();

      const { data: os } = await (supabase as any)
        .from("service_orders")
        .select("id, os_number, customer_name, technician, technician_id, status, budget_status, parts_value, labor_value, total_value, net_value, created_at, start_date, end_date")
        .eq("store_id", store.id)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false });
      const rowsArr = (os ?? []) as OS[];
      setRows(rowsArr);

      if (rowsArr.length > 0) {
        const ids = rowsArr.map((r) => r.id);
        const { data: hist } = await (supabase as any)
          .from("os_status_history")
          .select("id, os_id, from_status, to_status, changed_at, changed_by")
          .in("os_id", ids)
          .order("changed_at", { ascending: true });
        setHistory((hist ?? []) as Hist[]);
      } else {
        setHistory([]);
      }

      // Previous period fetch (used only for trend comparison)
      const { data: prevOs } = await (supabase as any)
        .from("service_orders")
        .select("id, status, budget_status, parts_value, total_value, net_value, created_at")
        .eq("store_id", store.id)
        .gte("created_at", prevFromIso)
        .lte("created_at", prevToIso);
      const prevArr = (prevOs ?? []) as OS[];
      setPrevRows(prevArr);
      if (prevArr.length > 0) {
        const pids = prevArr.map((r) => r.id);
        const { data: phist } = await (supabase as any)
          .from("os_status_history")
          .select("id, os_id, from_status, to_status, changed_at, changed_by")
          .in("os_id", pids)
          .order("changed_at", { ascending: true });
        setPrevHistory((phist ?? []) as Hist[]);
      } else {
        setPrevHistory([]);
      }

      setLoading(false);
    })();
  }, [store?.id, from, to]);

  const technicians = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => {
      const key = r.technician_id || r.technician;
      if (key) set.set(String(key), r.technician || String(key));
    });
    return Array.from(set.entries()).map(([k, v]) => ({ id: k, name: v }));
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (tech !== "all") {
      const key = String(r.technician_id || r.technician || "");
      if (key !== tech) return false;
    }
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  }), [rows, tech, statusFilter]);

  // Per-OS derivation: segments per status
  type Seg = { os_id: string; status: string; start: number; end: number; hours: number; is_current: boolean };
  const segments = useMemo<Seg[]>(() => {
    const byOs = new Map<string, Hist[]>();
    history.forEach((h) => {
      if (!byOs.has(h.os_id)) byOs.set(h.os_id, []);
      byOs.get(h.os_id)!.push(h);
    });
    const segs: Seg[] = [];
    const now = Date.now();
    filtered.forEach((os) => {
      const hs = (byOs.get(os.id) || []).slice().sort((a, b) => a.changed_at.localeCompare(b.changed_at));
      if (hs.length === 0) return;
      for (let i = 0; i < hs.length; i++) {
        const start = new Date(hs[i].changed_at).getTime();
        const status = hs[i].to_status || hs[i].from_status;
        if (!status) continue;
        const isLast = i === hs.length - 1;
        const end = isLast ? now : new Date(hs[i + 1].changed_at).getTime();
        segs.push({
          os_id: os.id, status,
          start, end,
          hours: Math.max(0, (end - start) / 3_600_000),
          is_current: isLast && !OS_TERMINAL_STATUSES.has(status),
        });
      }
    });
    return segs;
  }, [history, filtered]);

  const avgByStatus = useMemo(() => {
    const acc = new Map<string, { total: number; n: number }>();
    segments.forEach((s) => {
      // Só considera segmentos "fechados" (não o atual) para média
      if (s.is_current) return;
      const a = acc.get(s.status) || { total: 0, n: 0 };
      a.total += s.hours; a.n += 1;
      acc.set(s.status, a);
    });
    return OS_STATUS_ORDER
      .filter((s) => acc.has(s))
      .map((s) => {
        const a = acc.get(s)!;
        return { status: s, label: OS_STATUS_LABEL[s] ?? s, avgHours: a.n ? a.total / a.n : 0, n: a.n };
      });
  }, [segments]);

  const cycle = useMemo(() => {
    const delivered = filtered.filter((r) => r.status === "entregue");
    const times: number[] = [];
    const byOs = new Map<string, Hist[]>();
    history.forEach((h) => {
      if (!byOs.has(h.os_id)) byOs.set(h.os_id, []);
      byOs.get(h.os_id)!.push(h);
    });
    delivered.forEach((os) => {
      const hs = (byOs.get(os.id) || []).sort((a, b) => a.changed_at.localeCompare(b.changed_at));
      if (hs.length < 2) return;
      const start = new Date(hs[0].changed_at).getTime();
      const endEv = hs.find((h) => h.to_status === "entregue");
      const end = endEv ? new Date(endEv.changed_at).getTime() : new Date(hs[hs.length - 1].changed_at).getTime();
      times.push((end - start) / 3_600_000);
    });
    const avgH = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    return { avgHours: avgH, deliveredCount: delivered.length };
  }, [filtered, history]);

  const perTechnician = useMemo(() => {
    const acc = new Map<string, { name: string; delivered: number; totalProfit: number; totalRevenue: number }>();
    filtered.filter((r) => r.status === "entregue").forEach((r) => {
      const key = String(r.technician_id || r.technician || "—");
      const name = r.technician || "Sem técnico";
      const cur = acc.get(key) || { name, delivered: 0, totalProfit: 0, totalRevenue: 0 };
      const rev = Number(r.net_value ?? r.total_value ?? 0);
      const profit = Number(r.total_value ?? 0) - Number(r.parts_value ?? 0);
      cur.delivered += 1; cur.totalProfit += profit; cur.totalRevenue += rev;
      acc.set(key, cur);
    });
    return Array.from(acc.values()).sort((a, b) => b.delivered - a.delivered);
  }, [filtered]);

  const budgetRate = useMemo(() => {
    const decided = filtered.filter((r) => r.budget_status && r.budget_status !== "pendente");
    if (decided.length === 0) return { rate: 0, decided: 0, approved: 0 };
    const approved = decided.filter((r) => r.budget_status === "aprovado").length;
    return { rate: (approved / decided.length) * 100, decided: decided.length, approved };
  }, [filtered]);

  const profitTotal = useMemo(() => {
    return filtered.filter((r) => r.status === "entregue").reduce((acc, r) => {
      const total = Number(r.total_value || 0);
      const parts = Number(r.parts_value || 0);
      const labor = Number(r.labor_value || 0);
      const profit = total - parts;
      acc.revenue += total;
      acc.parts += parts;
      acc.labor += labor;
      acc.profit += profit;
      return acc;
    }, { revenue: 0, parts: 0, labor: 0, profit: 0 });
  }, [filtered]);

  // ---- Previous period metrics (for trend deltas) ----
  const prevMetrics = useMemo(() => {
    const byOs = new Map<string, Hist[]>();
    prevHistory.forEach((h) => {
      if (!byOs.has(h.os_id)) byOs.set(h.os_id, []);
      byOs.get(h.os_id)!.push(h);
    });
    const delivered = prevRows.filter((r) => r.status === "entregue");
    const times: number[] = [];
    delivered.forEach((os) => {
      const hs = (byOs.get(os.id) || []).sort((a, b) => a.changed_at.localeCompare(b.changed_at));
      if (hs.length < 2) return;
      const start = new Date(hs[0].changed_at).getTime();
      const endEv = hs.find((h) => h.to_status === "entregue");
      const end = endEv ? new Date(endEv.changed_at).getTime() : new Date(hs[hs.length - 1].changed_at).getTime();
      times.push((end - start) / 3_600_000);
    });
    const avgCycle = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;

    const decided = prevRows.filter((r) => r.budget_status && r.budget_status !== "pendente");
    const approved = decided.filter((r) => r.budget_status === "aprovado").length;
    const budgetRate = decided.length ? (approved / decided.length) * 100 : 0;

    const profit = delivered.reduce((acc, r) => acc + (Number(r.total_value || 0) - Number(r.parts_value || 0)), 0);

    return { avgCycle, budgetRate, profit };
  }, [prevRows, prevHistory]);

  const cycleDelta = useMemo(() => pctDelta(cycle.avgHours, prevMetrics.avgCycle), [cycle.avgHours, prevMetrics.avgCycle]);
  const budgetDelta = useMemo(() => pctDelta(budgetRate.rate, prevMetrics.budgetRate), [budgetRate.rate, prevMetrics.budgetRate]);
  const profitDelta = useMemo(() => pctDelta(profitTotal.profit, prevMetrics.profit), [profitTotal.profit, prevMetrics.profit]);

  // ---- Detailed OSs for clicked stage ----
  const stageOsList = useMemo(() => {
    if (!stageDialog) return [] as { os: OS; hours: number; segments: number; ongoing: boolean }[];
    const acc = new Map<string, { os: OS; hours: number; segments: number; ongoing: boolean }>();
    const osById = new Map(filtered.map((r) => [r.id, r]));
    segments.forEach((s) => {
      if (s.status !== stageDialog.status) return;
      const os = osById.get(s.os_id);
      if (!os) return;
      const cur = acc.get(s.os_id) || { os, hours: 0, segments: 0, ongoing: false };
      cur.hours += s.hours;
      cur.segments += 1;
      if (s.is_current) cur.ongoing = true;
      acc.set(s.os_id, cur);
    });
    return Array.from(acc.values()).sort((a, b) => b.hours - a.hours);
  }, [stageDialog, segments, filtered]);

  // OS paradas: aberto (não terminal), tempo desde última mudança > stalledDays
  const stalled = useMemo(() => {
    const now = Date.now();
    const lastByOs = new Map<string, Hist>();
    history.forEach((h) => {
      const cur = lastByOs.get(h.os_id);
      if (!cur || cur.changed_at < h.changed_at) lastByOs.set(h.os_id, h);
    });
    return rows
      .filter((r) => !OS_TERMINAL_STATUSES.has(r.status))
      .map((r) => {
        const last = lastByOs.get(r.id);
        const startTs = last ? new Date(last.changed_at).getTime() : new Date(r.created_at).getTime();
        const days = (now - startTs) / 86_400_000;
        return { os: r, days, since: new Date(startTs) };
      })
      .filter((x) => x.days >= stalledDays)
      .sort((a, b) => b.days - a.days);
  }, [rows, history, stalledDays]);

  const saveStalled = async () => {
    if (!store) return;
    setSavingStalled(true);
    const { error } = await (supabase as any).from("stores").update({ os_stalled_days: stalledDays }).eq("id", store.id);
    setSavingStalled(false);
    if (error) return toast.error(error.message);
    toast.success("Limite de OS parada atualizado.");
  };

  const exportCSV = () => {
    const byOs = new Map<string, Hist[]>();
    history.forEach((h) => {
      if (!byOs.has(h.os_id)) byOs.set(h.os_id, []);
      byOs.get(h.os_id)!.push(h);
    });
    const headers = [
      "OS", "Cliente", "Técnico", "Status atual", "Entrada", "Entrega",
      "Total (R$)", "Peças (R$)", "Mão de obra (R$)", "Lucro (R$)", "Lucro (%)",
      "Ciclo (h)", "Etapas percorridas",
    ];
    const escape = (v: any) => {
      const s = String(v ?? "");
      return s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(";")];
    filtered.forEach((r) => {
      const hs = (byOs.get(r.id) || []).sort((a, b) => a.changed_at.localeCompare(b.changed_at));
      const cycleH = hs.length >= 2
        ? (new Date(hs[hs.length - 1].changed_at).getTime() - new Date(hs[0].changed_at).getTime()) / 3_600_000
        : 0;
      const total = Number(r.total_value || 0);
      const parts = Number(r.parts_value || 0);
      const labor = Number(r.labor_value || 0);
      const profit = total - parts;
      const profitPct = total > 0 ? (profit / total) * 100 : 0;
      const stages = hs.map((h) => OS_STATUS_LABEL[h.to_status || ""] || h.to_status).join(" → ");
      lines.push([
        fmtOS(r.os_number), r.customer_name, r.technician || "",
        OS_STATUS_LABEL[r.status] || r.status,
        new Date(r.created_at).toLocaleString("pt-BR"),
        r.end_date ? new Date(r.end_date).toLocaleDateString("pt-BR") : "",
        total.toFixed(2), parts.toFixed(2), labor.toFixed(2),
        profit.toFixed(2), profitPct.toFixed(1),
        cycleH.toFixed(1), stages,
      ].map(escape).join(";"));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-os-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Relatórios de Ordens de Serviço"
        description="Tempo por etapa, produtividade por técnico e lucro por OS"
      />

      {/* Filtros */}
      <Card className="p-4 bg-card border-border shadow-card">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Técnico</Label>
            <Select value={tech} onValueChange={setTech}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {OS_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{OS_STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Alerta se parada há (dias)</Label>
            <div className="flex gap-2">
              <NumberInput allowDecimal={false} min={1} value={stalledDays} onValueChange={setStalledDays} />
              <Button type="button" variant="outline" size="sm" onClick={saveStalled} disabled={savingStalled}>Salvar</Button>
            </div>
          </div>
          <div className="flex md:justify-end">
            <Button onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-2" />Exportar CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Métricas resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="OSs no período" value={String(filtered.length)} icon={Wrench} />
        <MetricCard label="Entregues" value={String(cycle.deliveredCount)} icon={CheckCircle2} />
        <MetricCard label="Ciclo médio" value={fmtHours(cycle.avgHours)} icon={Timer} delta={cycleDelta.text} />
        <MetricCard label="Aprovação de orçamento" value={`${budgetRate.rate.toFixed(0)}%`} icon={TrendingUp} delta={`${budgetRate.approved}/${budgetRate.decided} · ${budgetDelta.text}`} />
        <MetricCard label="Lucro no período" value={brl(profitTotal.profit)} icon={TrendingUp} delta={`Receita ${brl(profitTotal.revenue)} · ${profitDelta.text}`} />
      </div>

      {/* Destaques: OS paradas */}
      <Card className="p-4 bg-card border-border shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">OSs paradas há mais de {stalledDays} {stalledDays === 1 ? "dia" : "dias"}</h3>
            <Badge variant="outline">{stalled.length}</Badge>
          </div>
        </div>
        {stalled.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma OS parada acima do limite. 👏</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">OS</th>
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Técnico</th>
                  <th className="text-right px-3 py-2 font-medium">Parada há</th>
                  <th className="text-right px-3 py-2 font-medium">Desde</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stalled.map(({ os, days, since }) => (
                  <tr key={os.id} className="hover:bg-surface-elevated/40">
                    <td className="px-3 py-2 font-mono text-xs text-primary font-bold">{fmtOS(os.os_number)}</td>
                    <td className="px-3 py-2 truncate max-w-[220px]">{os.customer_name}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={OS_STATUS_COLOR[os.status] ?? ""}>{OS_STATUS_LABEL[os.status] ?? os.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{os.technician || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-warning font-semibold tabular-nums">
                      {days >= 1 ? `${Math.floor(days)}d` : `${Math.round(days * 24)}h`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {since.toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link to={`/painel/ordens/${os.id}`} className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                        Abrir <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 bg-card border-border shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Tempo médio por etapa</h3>
            <span className="text-[10px] text-muted-foreground">Toque na barra para ver as OSs</span>
          </div>
          {avgByStatus.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados suficientes no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={avgByStatus} margin={{ left: 4, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: any) => fmtHours(Number(v))}
                  labelClassName="text-xs"
                />
                <Bar
                  dataKey="avgHours"
                  radius={[4, 4, 0, 0]}
                  className="cursor-pointer"
                  onClick={(d: any) => {
                    if (d?.status) setStageDialog({ status: d.status, label: d.label });
                  }}
                >
                  {avgByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4 bg-card border-border shadow-card">
          <h3 className="text-sm font-semibold mb-3">OSs entregues por técnico</h3>
          {perTechnician.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem entregas no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={perTechnician}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="delivered" name="Entregues" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Detalhamento por OS */}
      <Card className="bg-card border-border shadow-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Detalhamento por OS · lucro e ciclo</h3>
          <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Sem OSs no período/filtro selecionado.</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">OS</th>
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium">Técnico</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                  <th className="text-right px-3 py-2 font-medium">Peças</th>
                  <th className="text-right px-3 py-2 font-medium">Mão de obra</th>
                  <th className="text-right px-3 py-2 font-medium">Lucro</th>
                  <th className="text-right px-3 py-2 font-medium">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  const total = Number(r.total_value || 0);
                  const parts = Number(r.parts_value || 0);
                  const labor = Number(r.labor_value || 0);
                  const profit = total - parts;
                  const pct = total > 0 ? (profit / total) * 100 : 0;
                  return (
                    <tr key={r.id} className="hover:bg-surface-elevated/40">
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link to={`/painel/ordens/${r.id}`} className="text-primary hover:underline">{fmtOS(r.os_number)}</Link>
                      </td>
                      <td className="px-3 py-2 truncate max-w-[200px]">{r.customer_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.technician || "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={OS_STATUS_COLOR[r.status] ?? ""}>{OS_STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{brl(total)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{brl(parts)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{brl(labor)}</td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${profit >= 0 ? "text-emerald-600" : "text-danger"}`}>{brl(profit)}</td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${pct >= 0 ? "text-emerald-600" : "text-danger"}`}>{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Dialog: OSs de uma etapa */}
      <Dialog open={!!stageDialog} onOpenChange={(o) => !o && setStageDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>OSs na etapa · {stageDialog?.label}</DialogTitle>
          </DialogHeader>
          {stageOsList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma OS passou por esta etapa no período.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">OS</th>
                    <th className="text-left px-3 py-2 font-medium">Cliente</th>
                    <th className="text-left px-3 py-2 font-medium">Status atual</th>
                    <th className="text-right px-3 py-2 font-medium">Tempo nesta etapa</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stageOsList.map(({ os, hours, ongoing }) => (
                    <tr key={os.id} className="hover:bg-surface-elevated/40">
                      <td className="px-3 py-2 font-mono text-xs text-primary font-bold">{fmtOS(os.os_number)}</td>
                      <td className="px-3 py-2 truncate max-w-[220px]">{os.customer_name}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={OS_STATUS_COLOR[os.status] ?? ""}>
                          {OS_STATUS_LABEL[os.status] ?? os.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {fmtHours(hours)} {ongoing && <span className="ml-1 text-[10px] text-warning">(em andamento)</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to={`/painel/ordens/${os.id}`}
                          onClick={() => setStageDialog(null)}
                          className="text-primary hover:underline text-xs inline-flex items-center gap-1"
                        >
                          Abrir <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}