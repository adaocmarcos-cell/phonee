import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { SortableCards } from "@/components/SortableCards";
import { Button } from "@/components/ui/button";
import { useAuth, canSeeCost } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { brl, num, pct } from "@/lib/format";
import { loadProductStockMetrics } from "@/lib/stockMetrics";
import { Boxes, DollarSign, TrendingUp, AlertTriangle, Package, Percent, Wallet, Receipt, ShoppingCart, Wrench, LayoutGrid, Check, Banknote, RefreshCw, Smartphone } from "lucide-react";
import { PeriodFilter, resolvePeriod, type PeriodValue, type CustomRange } from "@/components/PeriodFilter";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

const PAY_COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--danger))", "hsl(var(--muted-foreground))"];

const PAY_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  credito: "Cartão de crédito",
  debito: "Cartão de débito",
  boleto: "Boleto",
  transferencia: "Transferência",
  troca: "Aparelho (troca)",
  vale_troca: "Vale-troca",
  cheque: "Cheque",
  os: "Ordem de serviço",
  outro: "Outro",
};

type DashboardMetrics = {
  faturamento_total: number;
  faturamento_vendas: number;
  faturamento_os: number;
  faturamento_hoje: number;
  recebido_caixa: number;
  recebido_em_troca: number;
  custo: number;
  custo_produtos: number;
  custo_os: number;
  despesas: number;
  lucro: number;
  qtd_vendas: number;
  ticket_medio: number;
  formas_pagamento: { name: string; value: number }[];
  serie_diaria: { day: string; total: number }[];
  top_produtos: { name: string; qty: number; revenue: number }[];
  crediario_a_receber?: number;
  crediario_vencido?: number;
  crediario_recebido_hoje?: number;
  crediario_vencidas_count?: number;
};

export default function Dashboard() {
  const { store, role } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodValue>("month");
  const [periodCustom, setPeriodCustom] = useState<CustomRange>({});
  const [editingLayout, setEditingLayout] = useState(false);

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [productsTotal, setProductsTotal] = useState(0);
  const [productsLow, setProductsLow] = useState(0);
  const [stalled, setStalled] = useState(0);

  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [recentSales, setRecentSales] = useState<any[]>([]);

  // Único gráfico de evolução, com filtro próprio
  const [evoPeriod, setEvoPeriod] = useState<PeriodValue>("1y");
  const [evoCustom, setEvoCustom] = useState<CustomRange>({});
  const [evoSeries, setEvoSeries] = useState<{ label: string; total: number; count: number }[]>([]);
  const [evoError, setEvoError] = useState<string | null>(null);

  const loadStockMetrics = useCallback(async () => {
    if (!store) return;
    try {
      const m = await loadProductStockMetrics(supabase, store.id);
      setProductsTotal(m.product_count);
      setProductsLow(m.low_count);
      setStalled(m.stalled_count);
    } catch (error) {
      console.error("[Dashboard] falha ao carregar métricas de estoque:", error);
    }
  }, [store]);

  useEffect(() => {
    if (!store) return;
    loadStockMetrics();
    const ch = supabase
      .channel(`dashboard-stock-metrics-${store.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `store_id=eq.${store.id}` }, loadStockMetrics)
      .on("postgres_changes", { event: "*", schema: "public", table: "parts_inventory", filter: `store_id=eq.${store.id}` }, loadStockMetrics)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [store, loadStockMetrics]);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    (async () => {
      const { from, to } = resolvePeriod(period, periodCustom);
      if (period === "custom" && (!from || !to)) return;
      const fromIso = (from ?? new Date(0)).toISOString();
      const toIso   = (to   ?? new Date()).toISOString();

      setMetricsError(null);
      const { data, error } = await (supabase as any).rpc("get_dashboard_metrics", {
        _store_id: store.id, _from: fromIso, _to: toIso,
      });
      if (cancelled) return;
      if (error) {
        console.error("[Dashboard] get_dashboard_metrics falhou:", error);
        setMetrics(null);
        setMetricsError(error.message || "Falha ao carregar métricas");
      } else {
        setMetrics(data as DashboardMetrics);
      }

      const { data: recent, error: recentErr } = await supabase
        .from("sales")
        .select("id, total, net_value, payment_method, created_at, customer_name")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (!cancelled) {
        if (recentErr) console.error("[Dashboard] últimas vendas:", recentErr);
        setRecentSales(recent ?? []);
      }

      const { data: al, error: alErr } = await supabase
        .from("alerts")
        .select("id, title, severity, message, created_at")
        .eq("store_id", store.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!cancelled) {
        if (alErr) {
          console.error("[Dashboard] alertas:", alErr);
          setAlertsError(alErr.message);
        } else {
          setAlertsError(null);
        }
        setAlerts(al ?? []);
      }
    })();
    return () => { cancelled = true; };
  }, [store, role, period, periodCustom, reloadTick]);

  // Evolução unificada
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    (async () => {
      const { from, to } = resolvePeriod(evoPeriod, evoCustom);
      if (!from) { setEvoSeries([]); return; }
      const since = new Date(from); since.setHours(0, 0, 0, 0);
      const until = to ?? new Date();
      const days = Math.max(1, Math.round((until.getTime() - since.getTime()) / 86400_000));
      const { data, error } = await supabase
        .from("sales")
        .select("total, net_value, returned_total, created_at")
        .eq("store_id", store.id)
        .gte("created_at", since.toISOString())
        .lte("created_at", until.toISOString());
      if (cancelled) return;
      if (error) {
        console.error("[Dashboard] evolução vendas:", error);
        setEvoError(error.message);
        setEvoSeries([]);
        return;
      }
      setEvoError(null);
      const groupByMonth = days > 60;
      const buckets: Record<string, { total: number; count: number }> = {};
      (data ?? []).forEach((s: any) => {
        const d = new Date(s.created_at);
        const k = groupByMonth
          ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`
          : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!buckets[k]) buckets[k] = { total: 0, count: 0 };
        const eff = Number(s.net_value ?? s.total ?? 0) - Number(s.returned_total ?? 0);
        buckets[k].total += eff;
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
      setEvoSeries(out);
    })();
    return () => { cancelled = true; };
  }, [store, evoPeriod, evoCustom]);

  const revenueTotal   = metrics?.faturamento_total ?? 0;
  const revenueToday   = metrics?.faturamento_hoje  ?? 0;
  const recebidoCaixa  = metrics?.recebido_caixa    ?? 0;
  const recebidoTroca  = metrics?.recebido_em_troca ?? 0;
  const costMonth      = metrics?.custo             ?? 0;
  const expensesMonth  = metrics?.despesas          ?? 0;
  const lucroMes       = metrics?.lucro             ?? 0;
  const salesCount     = metrics?.qtd_vendas        ?? 0;
  const ticketMedio    = metrics?.ticket_medio      ?? 0;
  const pay            = (metrics?.formas_pagamento ?? []).map((p) => ({ ...p, name: PAY_LABEL[p.name] ?? p.name }));
  const topProducts    = metrics?.top_produtos ?? [];
  const arCrediario    = metrics?.crediario_a_receber ?? 0;
  const arVencido      = metrics?.crediario_vencido ?? 0;
  const arVencidasCount= metrics?.crediario_vencidas_count ?? 0;
  const margin         = revenueTotal > 0 ? ((revenueTotal - costMonth) / revenueTotal) * 100 : 0;
  const itensAlerta    = productsLow + stalled;

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
      />

      {metricsError && (
        <Card className="p-4 mb-4 border-danger/40 bg-danger/5 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-danger">Não foi possível carregar as métricas</div>
              <div className="text-xs text-muted-foreground mt-0.5">{metricsError}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setReloadTick((v) => v + 1)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Tentar novamente
          </Button>
        </Card>
      )}

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
                delta="Vendas + OS entregues"
                icon={DollarSign}
                tone="info"
              />
            ),
          },
          {
            id: "recebido-caixa",
            node: (
              <MetricCard
                label="Recebido em caixa"
                value={brl(recebidoCaixa)}
                delta="Exclui aparelhos em troca"
                icon={Banknote}
                tone="success"
                variant="highlight"
              />
            ),
          },
          {
            id: "faturamento-periodo",
            node: (
              <MetricCard
                label={`Faturamento — ${periodLabel}`}
                value={brl(revenueTotal)}
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
                delta={canSeeCost(role) ? "(Receita − custo) / receita" : `${num(productsTotal)} produtos no estoque`}
                className="h-full"
              />
            ),
          },
        ]}
      />

      {recebidoTroca > 0 && (
        <div className="grid grid-cols-1 gap-4 mb-4">
          <MetricCard
            label="Recebido em aparelhos (troca)"
            value={brl(recebidoTroca)}
            delta="Valor de aparelhos aceitos como pagamento no período — não entra no caixa"
            icon={Smartphone}
            tone="info"
          />
        </div>
      )}

      {arCrediario > 0 && (
        <div className="grid grid-cols-1 gap-4 mb-4">
          <button
            type="button"
            onClick={() => navigate("/painel/crediario")}
            className="text-left"
          >
            <MetricCard
              label="A receber (crediário)"
              value={brl(arCrediario)}
              delta={
                arVencido > 0
                  ? `${brl(arVencido)} vencido · ${num(arVencidasCount)} parcela(s)`
                  : "Parcelas em aberto"
              }
              icon={Wallet}
              tone={arVencido > 0 ? "warning" : "info"}
            />
          </button>
        </div>
      )}

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
            id: "estoque-encalhado",
            node: (
              <MetricCard
                label="Estoque encalhado"
                value={num(stalled)}
                delta={`+30 dias sem venda · ${num(productsTotal)} produtos`}
                trend="down"
                icon={Package}
                tone="danger"
              />
            ),
          },
          {
            id: "itens-alerta",
            node: (
              <MetricCard
                label="Itens em alerta"
                value={num(itensAlerta)}
                delta={`${num(productsLow)} baixo · ${num(stalled)} encalhado · ${num(productsTotal)} total`}
                icon={Wrench}
                tone="danger"
              />
            ),
          },
        ]}
      />

      <div className="-mt-3 mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => setEditingLayout((v) => !v)}
          title={editingLayout ? "Concluir edição" : "Reordenar cards"}
          aria-label={editingLayout ? "Concluir edição do layout" : "Reordenar cards"}
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/40"
        >
          {editingLayout ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Concluir
            </>
          ) : (
            <>
              <LayoutGrid className="h-3.5 w-3.5" />
              Reordenar cards
            </>
          )}
        </button>
      </div>

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
              <p className="text-xs text-muted-foreground">Faturamento e ticket médio no período</p>
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
            {evoError ? (
              <EmptyChart label="ERRO AO CARREGAR" />
            ) : evoSeries.every((p) => p.total === 0) ? (
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
                  <Tooltip content={<TrendTooltip series={evoSeries} />} />
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
          {alertsError ? (
            <p className="text-sm text-danger text-center py-8">Falha ao carregar alertas.</p>
          ) : alerts.length === 0 ? (
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