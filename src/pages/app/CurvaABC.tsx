import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { brl, num, pct, daysAgo } from "@/lib/format";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip as ReTooltip, XAxis, YAxis, Cell,
} from "recharts";

type Row = {
  id: string;
  name: string;
  revenue: number;
  qty: number;
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

function classify(rows: { id: string; name: string; revenue: number; qty: number; stock: number; last_sold_at: string | null }[]): Row[] {
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

export default function CurvaABC() {
  const { store } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 90 * 86400_000).toISOString();
      const { data: products } = await supabase
        .from("products")
        .select("id, name, stock_current, last_sold_at")
        .eq("store_id", store.id);
      const { data: sales } = await supabase
        .from("sales")
        .select("id, created_at, sale_items(product_id, quantity, total)")
        .eq("store_id", store.id)
        .gte("created_at", since);

      const agg = new Map<string, { revenue: number; qty: number }>();
      (sales ?? []).forEach((s: any) =>
        (s.sale_items ?? []).forEach((it: any) => {
          if (!it.product_id) return;
          const cur = agg.get(it.product_id) ?? { revenue: 0, qty: 0 };
          cur.revenue += Number(it.total) || 0;
          cur.qty += Number(it.quantity) || 0;
          agg.set(it.product_id, cur);
        })
      );

      const merged = (products ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        stock: p.stock_current,
        last_sold_at: p.last_sold_at,
        revenue: agg.get(p.id)?.revenue ?? 0,
        qty: agg.get(p.id)?.qty ?? 0,
      }));
      setRows(classify(merged));
      setLoading(false);
    })();
  }, [store]);

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
        description="Classificação automática dos produtos pelo faturamento dos últimos 90 dias."
      />

      {/* KPIs com tooltips */}
      <div className="grid md:grid-cols-3 gap-3 mb-6">
        {(["A", "B", "C"] as const).map((cls) => {
          const cfg = cls === "A"
            ? { tone: "success", title: "Classe A — vitais", desc: "Top 20% que respondem por ~80% do faturamento. Nunca pode faltar." }
            : cls === "B"
            ? { tone: "warning", title: "Classe B — relevantes", desc: "15% do faturamento. Mantenha estoque equilibrado." }
            : { tone: "danger", title: "Classe C — triviais", desc: "Cauda longa. Avalie reduzir compras ou liquidar." };
          const c = totals.counts[cls];
          const r = totals.rev[cls];
          const sharePct = totals.totalRevenue ? (r / totals.totalRevenue) * 100 : 0;
          return (
            <Card key={cls} className="bg-card border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge className={`bg-${cfg.tone}/15 text-${cfg.tone} border-${cfg.tone}/30`}>Classe {cls}</Badge>
                  <InfoTip>{cfg.desc}</InfoTip>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground tracking-widest">{num(c)} ITENS</span>
              </div>
              <div className="metric text-2xl font-bold">{brl(r)}</div>
              <div className="text-xs text-muted-foreground mt-1">{pct(sharePct)} do faturamento</div>
            </Card>
          );
        })}
      </div>

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
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem vendas nos últimos 90 dias.</div>
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