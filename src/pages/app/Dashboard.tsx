import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { SortableCards } from "@/components/SortableCards";
import { Button } from "@/components/ui/button";
import { useAuth, canSeeCost } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { brl, num, pct } from "@/lib/format";
import { Boxes, DollarSign, TrendingUp, AlertTriangle, Package, Percent, Wallet, Receipt, ShoppingCart, Users, Wrench, LayoutGrid, Check } from "lucide-react";
import { PeriodFilter, resolvePeriod, type PeriodValue, type CustomRange } from "@/components/PeriodFilter";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

const PAY_COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--danger))", "hsl(var(--muted-foreground))"];

export default function Dashboard() {
  const { store, role } = useAuth();
  const [period, setPeriod] = useState<PeriodValue>("month");
  const [periodCustom, setPeriodCustom] = useState<CustomRange>({});
  const [editingLayout, setEditingLayout] = useState(false);
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueMonth, setRevenueMonth] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [margin, setMargin] = useState(0);
  const [costMonth, setCostMonth] = useState(0);
  const [costToday, setCostToday] = useState(0);
  const [expensesMonth, setExpensesMonth] = useState(0);
  const [productsLow, setProductsLow] = useState(0);
  const [stalled, setStalled] = useState(0);
  const [series, setSeries] = useState<{ day: string; total: number }[]>([]);
  const [pay, setPay] = useState<{ name: string; value: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [evoPeriod, setEvoPeriod] = useState<PeriodValue>("1y");
  const [evoCustom, setEvoCustom] = useState<CustomRange>({});
  const [evoSeries, setEvoSeries] = useState<{ label: string; total: number }[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<PeriodValue>("1y");
  const [trendSeries, setTrendSeries] = useState<{ label: string; total: number; count: number }[]>([]);

  useEffect(() => {
    if (!store) return;
    (async () => {
      const todayISO = new Date(); todayISO.setHours(0, 0, 0, 0);
      const { from, to } = resolvePeriod(period, periodCustom);
      if (period === "custom" && (!from || !to)) return;
      const monthISO = from ?? new Date(0);

      const { data: sales } = await supabase
        .from("sales")
        .select("id, total, net_value, payment_method, created_at, customer_name")
        .eq("store_id", store.id)
        .gte("created_at", monthISO.toISOString())
        .lte("created_at", (to ?? new Date()).toISOString())
        .order("created_at", { ascending: false });

      const safeSales = sales ?? [];
      const eff = (x: any) => Number(x?.net_value ?? x?.total ?? 0);
      setSalesCount(safeSales.length);
      setRevenueMonth(safeSales.reduce((s, x) => s + eff(x), 0));
      setRevenueToday(
        safeSales
          .filter((s) => new Date(s.created_at) >= todayISO)
          .reduce((s, x) => s + eff(x), 0)
      );

      // Daily series for the month
      const buckets: Record<string, number> = {};
      safeSales.forEach((s) => {
        const d = new Date(s.created_at);
        const k = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        buckets[k] = (buckets[k] || 0) + eff(s);
      });
      const sorted = Object.entries(buckets)
        .map(([day, total]) => ({ day, total }))
        .reverse();
      setSeries(sorted);

      // Payment pie
      const payMap: Record<string, number> = {};
      safeSales.forEach((s) => {
        payMap[s.payment_method] = (payMap[s.payment_method] || 0) + eff(s);
      });
      setPay(Object.entries(payMap).map(([name, value]) => ({ name, value })));

      setRecentSales(safeSales.slice(0, 6));

      // Margin (approx, owner only) — load items + product cost
      if (canSeeCost(role) && safeSales.length > 0) {
        const { data: items } = await supabase
          .from("sale_items")
          .select("quantity, unit_price, product_id, sale_id, products(cost_price, name)")
          .in("sale_id", safeSales.map((s) => s.id));
        let rev = 0, cost = 0, costT = 0;
        const todaySalesIds = new Set(
          safeSales.filter((s) => new Date(s.created_at) >= todayISO).map((s) => s.id)
        );
        const prodMap: Record<string, { name: string; qty: number; revenue: number }> = {};
        (items ?? []).forEach((it: any) => {
          const r = Number(it.unit_price) * Number(it.quantity);
          const c = Number(it.products?.cost_price ?? 0) * Number(it.quantity);
          rev += r; cost += c;
          if (todaySalesIds.has(it.sale_id)) costT += c;
          const pid = it.product_id;
          if (!prodMap[pid]) prodMap[pid] = { name: it.products?.name ?? "—", qty: 0, revenue: 0 };
          prodMap[pid].qty += it.quantity;
          prodMap[pid].revenue += r;
        });
        setMargin(rev > 0 ? ((rev - cost) / rev) * 100 : 0);
        setCostMonth(cost);
        setCostToday(costT);
        setTopProducts(Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5));
      }

      // Despesas do mês
      const { data: exps } = await (supabase as any)
        .from("expenses")
        .select("amount")
        .eq("store_id", store.id)
        .gte("expense_date", monthISO.toISOString().slice(0, 10));
      setExpensesMonth((exps ?? []).reduce((s: number, x: any) => s + Number(x.amount || 0), 0));

      // Ordens de serviço (sincroniza faturamento e custo de assistência técnica)
      const { data: osList } = await (supabase as any)
        .from("service_orders")
        .select("total_value, parts_value, status, created_at, delivered_at")
        .eq("store_id", store.id)
        .gte("created_at", monthISO.toISOString())
        .lte("created_at", (to ?? new Date()).toISOString());
      const osRevenue = (osList ?? [])
        .filter((o: any) => ["entregue", "pronto", "em_execucao", "concluido"].includes(String(o.status)))
        .reduce((s: number, o: any) => s + Number(o.total_value || 0), 0);
      const osCost = (osList ?? []).reduce((s: number, o: any) => s + Number(o.parts_value || 0), 0);
      if (osRevenue > 0) {
        setRevenueMonth((v) => v + osRevenue);
      }
      if (osCost > 0 && canSeeCost(role)) {
        setCostMonth((v) => v + osCost);
      }

      const { data: prods } = await supabase
        .from("products")
        .select("id, name, stock_current, stock_min, last_sold_at")
        .eq("store_id", store.id);
      setProductsLow((prods ?? []).filter((p) => p.stock_current <= p.stock_min).length);
      setStalled(
        (prods ?? []).filter((p) => {
          if (!p.last_sold_at) return true;
          const d = (Date.now() - new Date(p.last_sold_at).getTime()) / (1000 * 60 * 60 * 24);
          return d > 30;
        }).length
      );

      const { data: al } = await supabase
        .from("alerts")
        .select("id, title, severity, message, created_at")
        .eq("store_id", store.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(5);
      setAlerts(al ?? []);
    })();
  }, [store, role, period, periodCustom]);

  // Evolução das vendas (gráfico independente)
  useEffect(() => {
    if (!store) return;
    (async () => {
      const { from, to } = resolvePeriod(evoPeriod, evoCustom);
      if (!from) return;
      const since = new Date(from); since.setHours(0, 0, 0, 0);
      const until = to ?? new Date();
      const days = Math.max(1, Math.round((until.getTime() - since.getTime()) / 86400_000));
      const { data } = await supabase
        .from("sales")
        .select("total, created_at")
        .eq("store_id", store.id)
        .gte("created_at", since.toISOString())
        .lte("created_at", until.toISOString());
      const groupByMonth = days > 60;
      const buckets: Record<string, number> = {};
      (data ?? []).forEach((s: any) => {
        const d = new Date(s.created_at);
        const k = groupByMonth
          ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`
          : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        buckets[k] = (buckets[k] || 0) + Number(s.total || 0);
      });
      // Build ordered timeline
      const out: { label: string; total: number }[] = [];
      const cursor = new Date(since);
      const end = new Date(until);
      if (groupByMonth) {
        cursor.setDate(1);
        while (cursor <= end) {
          const k = `${String(cursor.getMonth() + 1).padStart(2, "0")}/${String(cursor.getFullYear()).slice(2)}`;
          out.push({ label: k, total: buckets[k] || 0 });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        while (cursor <= end) {
          const k = `${String(cursor.getDate()).padStart(2, "0")}/${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          out.push({ label: k, total: buckets[k] || 0 });
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      setEvoSeries(out);
    })();
  }, [store, evoPeriod, evoCustom]);

  // Mini gráfico de evolução (abaixo dos cards de destaque)
  useEffect(() => {
    if (!store) return;
    (async () => {
      const { from, to } = resolvePeriod(trendPeriod, {});
      if (!from) return;
      const since = new Date(from); since.setHours(0, 0, 0, 0);
      const until = to ?? new Date();
      const days = Math.max(1, Math.round((until.getTime() - since.getTime()) / 86400_000));
      const { data } = await supabase
        .from("sales")
        .select("total, created_at")
        .eq("store_id", store.id)
        .gte("created_at", since.toISOString())
        .lte("created_at", until.toISOString());
      const groupByMonth = days > 60;
      const buckets: Record<string, { total: number; count: number }> = {};
      (data ?? []).forEach((s: any) => {
        const d = new Date(s.created_at);
        const k = groupByMonth
          ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`
          : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!buckets[k]) buckets[k] = { total: 0, count: 0 };
        buckets[k].total += Number(s.total || 0);
        buckets[k].count += 1;
      });
      const out: { label: string; total: number; count: number }[] = [];
      const cursor = new Date(since);
      const end = new Date(until);
      if (groupByMonth) {
        cursor.setDate(1);
        while (cursor <= end) {
          const k = `${String(cursor.getMonth() + 1).padStart(2, "0")}/${String(cursor.getFullYear()).slice(2)}`;
          out.push({ label: k, total: buckets[k]?.total || 0, count: buckets[k]?.count || 0 });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        while (cursor <= end) {
          const k = `${String(cursor.getDate()).padStart(2, "0")}/${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          out.push({ label: k, total: buckets[k]?.total || 0, count: buckets[k]?.count || 0 });
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      setTrendSeries(out);
    })();
  }, [store, trendPeriod]);

  const lucroMes = revenueMonth - costMonth - expensesMonth;
  const lucroBrutoHoje = revenueToday - costToday;
  const ticketMedio = salesCount > 0 ? revenueMonth / salesCount : 0;
  const itensAlerta = productsLow + stalled;
  const periodLabel =
    period === "today" ? "hoje" :
    period === "7d" ? "últimos 7 dias" :
    period === "30d" ? "últimos 30 dias" :
    period === "month" ? "mês atual" :
    period === "year" ? "ano atual" :
    period === "custom" ? "período personalizado" : "período";

  return (
    <div className="text-[15px] leading-relaxed">
      <PageHeader
        title="Visão geral"
        description="Tudo que importa na sua loja, em um só lugar."
        actions={
          <Button
            variant={editingLayout ? "default" : "outline"}
            size="sm"
            onClick={() => setEditingLayout((v) => !v)}
            title={editingLayout ? "Concluir edição" : "Reordenar cards"}
            aria-label={editingLayout ? "Concluir edição do layout" : "Reordenar cards"}
          >
            {editingLayout ? (
              <>
                <Check className="h-4 w-4 mr-1.5" />
                Concluir
              </>
            ) : (
              <>
                <LayoutGrid className="h-4 w-4 mr-1.5" />
                Reordenar
              </>
            )}
          </Button>
        }
      />

      <SortableCards
        storageKey="dashboard.kpis.top"
        editing={editingLayout}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4"
        items={[
          {
            id: "faturamento-hoje",
            node: (
              <MetricCard
                label="Faturamento hoje"
                value={brl(revenueToday)}
                delta={canSeeCost(role) ? `Lucro bruto hoje: ${brl(lucroBrutoHoje)}` : undefined}
                icon={DollarSign}
                tone="info"
              />
            ),
          },
          {
            id: "faturamento-periodo",
            node: (
              <MetricCard
                label={`Faturamento — ${periodLabel}`}
                value={brl(revenueMonth)}
                delta={`${num(salesCount)} vendas`}
                icon={TrendingUp}
                tone="primary"
              />
            ),
          },
          {
            id: "margem-ou-baixo",
            node: (
              <MetricCard
                label={canSeeCost(role) ? "Margem média" : "Estoque baixo"}
                value={canSeeCost(role) ? pct(margin) : num(productsLow)}
                icon={canSeeCost(role) ? Percent : AlertTriangle}
                tone={canSeeCost(role) ? "violet" : "warning"}
              />
            ),
          },
          {
            id: "estoque-encalhado",
            node: (
              <MetricCard
                label="Estoque encalhado"
                value={num(stalled)}
                delta="+30 dias sem venda"
                trend="down"
                icon={Package}
                tone="danger"
              />
            ),
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 mb-6">
        {canSeeCost(role) ? (
          <MetricCard
            label="Lucro líquido do período"
            value={brl(lucroMes)}
            delta={`Receita − custo − despesas (${brl(expensesMonth)} desp.)`}
            icon={Wallet}
            variant="highlight"
            tone="success"
            trend={lucroMes >= 0 ? "up" : "down"}
          />
        ) : (
          <MetricCard label="Itens em alerta" value={num(productsLow)} icon={AlertTriangle} tone="warning" />
        )}
      </div>

      <SortableCards
        storageKey="dashboard.kpis.secondary"
        editing={editingLayout}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        items={[
          {
            id: "ticket-medio",
            node: (
              <MetricCard
                label="Ticket médio"
                value={brl(ticketMedio)}
                delta={`${num(salesCount)} vendas no período`}
                icon={ShoppingCart}
                tone="primary"
              />
            ),
          },
          {
            id: "despesas-periodo",
            node: (
              <MetricCard
                label="Despesas do período"
                value={brl(expensesMonth)}
                delta="Custos operacionais"
                icon={Receipt}
                tone="warning"
              />
            ),
          },
          {
            id: "custo-ou-baixo",
            node: canSeeCost(role) ? (
              <MetricCard
                label="Custo de produtos"
                value={brl(costMonth)}
                delta="CMV + peças O.S."
                icon={Boxes}
                tone="violet"
              />
            ) : (
              <MetricCard
                label="Estoque baixo"
                value={num(productsLow)}
                delta="Itens abaixo do mínimo"
                icon={AlertTriangle}
                tone="warning"
              />
            ),
          },
          {
            id: "itens-alerta",
            node: (
              <MetricCard
                label="Itens em alerta"
                value={num(itensAlerta)}
                delta={`${num(productsLow)} baixo · ${num(stalled)} encalhado`}
                icon={Wrench}
                tone="danger"
              />
            ),
          },
        ]}
      />

      <Card className="p-5 mb-6 bg-card border-border shadow-card">
        <div className="mb-3">
          <h3 className="font-semibold">Evolução das vendas</h3>
          <p className="text-xs text-muted-foreground">Faturamento no período selecionado</p>
        </div>
        <div className="h-56">
          {trendSeries.every((p) => p.total === 0) ? (
            <EmptyChart label="Sem vendas no período" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendSeries}>
                <defs>
                  <linearGradient id="trendRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                <Tooltip content={<TrendTooltip series={trendSeries} />} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#trendRev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-2 flex items-center justify-center gap-1 text-[11px]">
          {([
            { v: "30d", l: "30 dias" },
            { v: "3m", l: "3 meses" },
            { v: "6m", l: "6 meses" },
            { v: "1y", l: "12 meses" },
          ] as { v: PeriodValue; l: string }[]).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setTrendPeriod(opt.v)}
              className={`px-2.5 py-1 rounded-md transition ${
                trendPeriod === opt.v
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-end mb-6">
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          options={["today", "7d", "30d", "month", "year", "custom"]}
          custom={periodCustom}
          onCustomChange={setPeriodCustom}
          compact
          showLabel={false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 lg:col-span-2 bg-card border-border shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Evolução das vendas</h3>
              <p className="text-xs text-muted-foreground">Faturamento por período</p>
            </div>
            <PeriodFilter
              value={evoPeriod}
              onChange={setEvoPeriod}
              options={["7d", "30d", "3m", "6m", "1y", "custom"]}
              custom={evoCustom}
              onCustomChange={setEvoCustom}
              compact
              showLabel={false}
            />
          </div>
          <div className="h-64">
            {evoSeries.every((p) => p.total === 0) ? (
              <EmptyChart label="Sem vendas no período" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evoSeries}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => brl(v)}
                  />
                  <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#rev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5 bg-card border-border shadow-card">
          <h3 className="font-semibold mb-4">Formas de pagamento</h3>
          <div className="h-64">
            {pay.length === 0 ? (
              <EmptyChart label="Sem dados" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pay} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {pay.map((_, i) => <Cell key={i} fill={PAY_COLORS[i % PAY_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => brl(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 bg-card border-border shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Alertas prioritários</h3>
            <Badge variant="outline" className="text-[10px] font-mono">{alerts.length}</Badge>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum alerta — tudo em ordem.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-3 p-3 rounded-md bg-surface-elevated border border-border/60">
                  <div className={`h-2 w-2 rounded-full mt-2 ${a.severity === "danger" ? "bg-danger" : a.severity === "warning" ? "bg-warning" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    {a.message && <div className="text-xs text-muted-foreground line-clamp-2">{a.message}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 bg-card border-border shadow-card">
          <h3 className="font-semibold mb-4">Últimas vendas</h3>
          {recentSales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma venda registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentSales.map((s) => (
                <li key={s.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.customer_name || "Cliente avulso"}</div>
                    <div className="text-[11px] font-mono text-muted-foreground uppercase">{s.payment_method}</div>
                  </div>
                  <div className="metric font-semibold">{brl(Number(s.total))}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canSeeCost(role) && topProducts.length > 0 && (
        <Card className="p-5 mt-6 bg-card border-border shadow-card">
          <h3 className="font-semibold mb-4">Top 5 produtos por receita</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={140} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => brl(v)} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-full bg-grid rounded-md flex items-center justify-center">
      <span className="text-xs text-muted-foreground font-mono tracking-widest">{label.toUpperCase()}</span>
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  series: { label: string; total: number; count: number }[];
}) {
  if (!active || !payload?.length) return null;
  const idx = series.findIndex((p) => p.label === label);
  const curr = series[idx];
  if (!curr) return null;
  const prev = idx > 0 ? series[idx - 1] : null;
  const diff = prev ? curr.total - prev.total : 0;
  const pctVar = prev && prev.total > 0 ? (diff / prev.total) * 100 : null;
  const ticket = curr.count > 0 ? curr.total / curr.count : 0;
  const up = diff >= 0;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md min-w-[180px]">
      <div className="font-medium text-foreground mb-1.5">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Total</span>
        <span className="metric font-semibold text-foreground">{brl(curr.total)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">vs período anterior</span>
        <span className={`metric font-semibold ${prev ? (up ? "text-success" : "text-danger") : "text-muted-foreground"}`}>
          {prev
            ? `${up ? "+" : ""}${brl(diff)}${pctVar !== null ? ` (${up ? "+" : ""}${pctVar.toFixed(1)}%)` : ""}`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Ticket médio</span>
        <span className="metric font-semibold text-foreground">
          {curr.count > 0 ? `${brl(ticket)} · ${curr.count} venda${curr.count > 1 ? "s" : ""}` : "—"}
        </span>
      </div>
    </div>
  );
}