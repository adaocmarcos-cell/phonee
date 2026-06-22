import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeCost } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, TrendingUp, TrendingDown, Minus, Filter, Trophy, Percent, Wallet, Award } from "lucide-react";
import { brl, num, pct, daysAgo } from "@/lib/format";
import { MetricCard } from "@/components/MetricCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip as ReTooltip, XAxis, YAxis, Cell,
} from "recharts";

type Row = {
  id: string;
  name: string;
  revenue: number;
  qty: number;
  cost: number;
  profit: number;
  margin: number;
  stock: number;
  last_sold_at: string | null;
  class: "A" | "B" | "C";
  cum: number; // cumulative % of revenue
  share: number; // share %
};

const InfoTip = ({ children }: { children: React.ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors">
        <Info className="h-3.5 w-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
      {children}
    </TooltipContent>
  </Tooltip>
);

function classify(rows: Omit<Row, "class" | "cum" | "share">[]): Row[] {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((s, r) => s + r.revenue, 0) || 1;
  let cum = 0;
  return sorted.map((r) => {
    const share = (r.revenue / total) * 100;
    cum += share;
    const cls: "A" | "B" | "C" = cum <= 80 ? "A" : cum <= 95 ? "B" : "C";
    return { ...r, share, cum, class: cls };
  });
}

type Period = "7d" | "30d" | "90d" | "6m" | "1y";
const PERIODS: { v: Period; label: string; days: number }[] = [
  { v: "7d", label: "7 dias", days: 7 },
  { v: "30d", label: "30 dias", days: 30 },
  { v: "90d", label: "90 dias", days: 90 },
  { v: "6m", label: "6 meses", days: 180 },
  { v: "1y", label: "1 ano", days: 365 },
];
const daysFor = (p: Period) => PERIODS.find((x) => x.v === p)!.days;

function MiniFilter({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Filter className="h-3 w-3 text-muted-foreground" />
      <Select value={value} onValueChange={(v) => onChange(v as Period)}>
        <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function CurvaABC() {
  const { store, role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("90d");
  const [pSold, setPSold] = useState<Period>("30d");
  const [pMargin, setPMargin] = useState<Period>("30d");
  const [pProfit, setPProfit] = useState<Period>("30d");
  const [allSales, setAllSales] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 365 * 86400_000).toISOString();
      const { data: products } = await supabase
        .from("products")
        .select("id, name, stock_current, last_sold_at, cost_price")
        .eq("store_id", store.id);
      const { data: sales } = await supabase
        .from("sales")
        .select("id, created_at, sale_items(product_id, quantity, total, unit_price)")
        .eq("store_id", store.id)
        .gte("created_at", since);
      setAllSales(sales ?? []);
      setAllProducts(products ?? []);
      setLoading(false);
    })();
  }, [store]);

  // Aggregate for the main ABC view, scoped by `period`
  useEffect(() => {
    if (!allProducts.length && !allSales.length) return;
    const cutoff = Date.now() - daysFor(period) * 86400_000;
    const agg = new Map<string, { revenue: number; qty: number; cost: number }>();
    const costMap = new Map<string, number>();
    allProducts.forEach((p: any) => costMap.set(p.id, Number(p.cost_price || 0)));
    allSales.forEach((s: any) => {
      if (new Date(s.created_at).getTime() < cutoff) return;
      (s.sale_items ?? []).forEach((it: any) => {
          if (!it.product_id) return;
        const cur = agg.get(it.product_id) ?? { revenue: 0, qty: 0, cost: 0 };
          cur.revenue += Number(it.total) || 0;
          cur.qty += Number(it.quantity) || 0;
        cur.cost += (costMap.get(it.product_id) || 0) * (Number(it.quantity) || 0);
          agg.set(it.product_id, cur);
      });
    });

    const merged = allProducts.map((p: any) => {
      const a = agg.get(p.id) ?? { revenue: 0, qty: 0, cost: 0 };
      const profit = a.revenue - a.cost;
      return {
        id: p.id,
        name: p.name,
        stock: p.stock_current,
        last_sold_at: p.last_sold_at,
        revenue: a.revenue,
        qty: a.qty,
        cost: a.cost,
        profit,
        margin: a.revenue > 0 ? (profit / a.revenue) * 100 : 0,
      };
    });
    setRows(classify(merged));
  }, [allProducts, allSales, period]);

  const ranking = (p: Period, key: "qty" | "margin" | "profit") => {
    const cutoff = Date.now() - daysFor(p) * 86400_000;
    const costMap = new Map<string, number>();
    allProducts.forEach((pr: any) => costMap.set(pr.id, Number(pr.cost_price || 0)));
    const nameMap = new Map<string, string>();
    allProducts.forEach((pr: any) => nameMap.set(pr.id, pr.name));
    const agg = new Map<string, { qty: number; revenue: number; cost: number }>();
    allSales.forEach((s: any) => {
      if (new Date(s.created_at).getTime() < cutoff) return;
      (s.sale_items ?? []).forEach((it: any) => {
        if (!it.product_id) return;
        const cur = agg.get(it.product_id) ?? { qty: 0, revenue: 0, cost: 0 };
        cur.qty += Number(it.quantity) || 0;
        cur.revenue += Number(it.total) || 0;
        cur.cost += (costMap.get(it.product_id) || 0) * (Number(it.quantity) || 0);
        agg.set(it.product_id, cur);
      });
    });
    const list = Array.from(agg.entries()).map(([id, v]) => {
      const profit = v.revenue - v.cost;
      return {
        id, name: nameMap.get(id) ?? "—",
        qty: v.qty, revenue: v.revenue, profit,
        margin: v.revenue > 0 ? (profit / v.revenue) * 100 : 0,
      };
    });
    if (key === "qty") return list.sort((a, b) => b.qty - a.qty).slice(0, 5);
    if (key === "margin") return list.filter((x) => x.revenue > 0).sort((a, b) => b.margin - a.margin).slice(0, 5);
    return list.sort((a, b) => b.profit - a.profit).slice(0, 5);
  };

  const topSold = useMemo(() => ranking(pSold, "qty"), [pSold, allSales, allProducts]);
  const topMargin = useMemo(() => ranking(pMargin, "margin"), [pMargin, allSales, allProducts]);
  const topProfit = useMemo(() => ranking(pProfit, "profit"), [pProfit, allSales, allProducts]);

  const totals = useMemo(() => {
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const counts = { A: 0, B: 0, C: 0 };
    const rev = { A: 0, B: 0, C: 0 };
    rows.forEach((r) => {
      counts[r.class]++;
      rev[r.class] += r.revenue;
    });
    return { totalRevenue, counts, rev };
  }, [rows]);

  const top20Count = Math.max(1, Math.ceil(rows.length * 0.2));
  const paretoData = rows.slice(0, 20).map((r, i) => ({
    name: r.name.length > 14 ? r.name.slice(0, 12) + "…" : r.name,
    revenue: r.revenue,
    cum: Number(r.cum.toFixed(1)),
    fill: r.class === "A" ? "hsl(var(--success))" : r.class === "B" ? "hsl(var(--warning))" : "hsl(var(--danger))",
  }));

  const giro = (lastSold: string | null) => {
    const d = daysAgo(lastSold);
    if (d === null) return { label: "Sem venda", color: "text-danger", icon: <Minus className="h-3 w-3" /> };
    if (d <= 14) return { label: "Alto", color: "text-success", icon: <TrendingUp className="h-3 w-3" /> };
    if (d <= 45) return { label: "Médio", color: "text-warning", icon: <Minus className="h-3 w-3" /> };
    if (d <= 90) return { label: "Baixo", color: "text-danger", icon: <TrendingDown className="h-3 w-3" /> };
    return { label: "Encalhado", color: "text-danger", icon: <TrendingDown className="h-3 w-3" /> };
  };

  return (
    <div>
      <PageHeader
        title="Curva ABC & Regra 80/20"
        description="Classificação automática dos produtos por faturamento."
      />

      <div className="flex items-center justify-end gap-2 mb-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Período</span>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs no estilo do Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {(["A", "B", "C"] as const).map((cls) => {
          const tone: any = cls === "A" ? "success" : cls === "B" ? "warning" : "danger";
          const c = totals.counts[cls];
          const r = totals.rev[cls];
          const sharePct = totals.totalRevenue ? (r / totals.totalRevenue) * 100 : 0;
          return (
            <MetricCard
              key={cls}
              label={`Classe ${cls} — ${num(c)} itens`}
              value={brl(r)}
              delta={`${pct(sharePct)} do faturamento`}
              icon={cls === "A" ? Trophy : cls === "B" ? Award : Minus}
              tone={tone}
            />
          );
        })}
      </div>

      {/* Rankings */}
      {canSeeCost(role) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <RankingCard
            title="Mais vendidos"
            icon={<Trophy className="h-4 w-4 text-primary" />}
            period={pSold}
            onPeriod={setPSold}
            items={topSold}
            metric={(r) => `${num(r.qty)} un.`}
            sub={(r) => brl(r.revenue)}
          />
          <RankingCard
            title="Maiores margens"
            icon={<Percent className="h-4 w-4 text-emerald-600" />}
            period={pMargin}
            onPeriod={setPMargin}
            items={topMargin}
            metric={(r) => pct(r.margin)}
            sub={(r) => `Lucro ${brl(r.profit)}`}
          />
          <RankingCard
            title="Maiores lucros"
            icon={<Wallet className="h-4 w-4 text-amber-600" />}
            period={pProfit}
            onPeriod={setPProfit}
            items={topProfit}
            metric={(r) => brl(r.profit)}
            sub={(r) => `Receita ${brl(r.revenue)}`}
          />
        </div>
      )}

      {/* Pareto */}
      <Card className="bg-card border-border p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold">Pareto — Top 20 produtos</h3>
          <InfoTip>
            <strong>Regra 80/20:</strong> a linha mostra o acúmulo do faturamento. Onde ela cruza 80%, você vê o seleto grupo que sustenta o caixa da loja.
          </InfoTip>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Barras = receita do produto · Linha = % acumulado</p>
        <div className="h-80">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</div>
          ) : paretoData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem vendas no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={paretoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis yAxisId="left" tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <ReTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, k) => (k === "cum" ? `${v}%` : brl(Number(v)))}
                />
                <Bar yAxisId="left" dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {paretoData.map((d, i) => (<Cell key={i} fill={d.fill} />))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="cum" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Tabela */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Ranking de produtos</h3>
          <span className="text-[11px] font-mono text-muted-foreground tracking-widest">
            TOP 20% = {num(top20Count)} ITENS
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Produto</th>
                <th className="text-left px-4 py-3 font-medium">
                  <span className="inline-flex items-center gap-1">Classe <InfoTip><strong>Curva ABC:</strong> A = 20% dos itens que geram 80% do faturamento. B = relevância média. C = cauda longa.</InfoTip></span>
                </th>
                <th className="text-left px-4 py-3 font-medium">
                  <span className="inline-flex items-center gap-1">Giro <InfoTip><strong>Giro:</strong> velocidade com que o produto sai do estoque, baseado nos dias desde a última venda. Alto ≤14d, Médio ≤45d, Baixo ≤90d, Encalhado &gt;90d.</InfoTip></span>
                </th>
                <th className="text-right px-4 py-3 font-medium">Receita 90d</th>
                <th className="text-right px-4 py-3 font-medium">% acumulado</th>
                <th className="text-right px-4 py-3 font-medium">Estoque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-muted-foreground text-sm">Sem dados para classificar.</td></tr>
              ) : rows.map((r, i) => {
                const g = giro(r.last_sold_at);
                const cls = r.class;
                const isTop20 = i < top20Count;
                return (
                  <tr key={r.id} className={`hover:bg-surface-elevated/40 ${isTop20 ? "bg-primary/[0.03]" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                      {isTop20 && <div className="text-[10px] font-mono text-primary tracking-widest mt-0.5">★ TOP 20%</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cls === "A" ? "bg-success/15 text-success border-success/30" : cls === "B" ? "bg-warning/15 text-warning border-warning/30" : "bg-danger/15 text-danger border-danger/30"}>
                        {cls}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 ${g.color}`}>
                      <span className="inline-flex items-center gap-1 text-xs">{g.icon} {g.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right metric font-semibold">{brl(r.revenue)}</td>
                    <td className="px-4 py-3 text-right metric text-muted-foreground">{pct(r.cum)}</td>
                    <td className="px-4 py-3 text-right metric">{r.stock}</td>
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