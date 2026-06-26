import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeCost } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Info, TrendingUp, TrendingDown, Minus, Trophy, Percent, Wallet, Award, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileDown, Printer, Save, Calculator } from "lucide-react";
import { brl, num, pct, daysAgo } from "@/lib/format";
import { MetricCard } from "@/components/MetricCard";
import { PeriodFilter, resolvePeriod, type PeriodValue, type CustomRange } from "@/components/PeriodFilter";
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

type Period = PeriodValue;
const RANK_OPTIONS: PeriodValue[] = ["7d", "30d", "90d", "6m", "1y", "custom"];
const ABC_OPTIONS: PeriodValue[] = ["30d", "90d", "6m", "1y", "custom"];

function rangeFor(p: Period, custom?: CustomRange) {
  const { from, to } = resolvePeriod(p, custom);
  return { from: from ? from.getTime() : 0, to: (to ?? new Date()).getTime() };
}

function RankingCard({
  title, icon, period, onPeriod, custom, onCustom, items, metric, sub,
}: {
  title: string;
  icon: React.ReactNode;
  period: Period;
  onPeriod: (p: Period) => void;
  custom?: CustomRange;
  onCustom: (c: CustomRange) => void;
  items: { id: string; name: string; qty: number; revenue: number; profit: number; margin: number }[];
  metric: (r: any) => string;
  sub: (r: any) => string;
}) {
  return (
    <Card className="bg-card border-border shadow-card p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <PeriodFilter
          value={period} onChange={onPeriod}
          options={RANK_OPTIONS}
          custom={custom} onCustomChange={onCustom}
          compact showLabel={false}
        />
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Sem dados no período.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 p-2 rounded-md bg-surface-elevated border border-border/60">
              <span className="text-xs font-mono font-bold text-primary w-5 text-center">{i + 1}º</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.name}</div>
                <div className="text-[11px] text-muted-foreground">{sub(r)}</div>
              </div>
              <span className="metric text-sm font-bold">{metric(r)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default function CurvaABC() {
  const { store, role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("90d");
  const [periodCustom, setPeriodCustom] = useState<CustomRange>({});
  const [pSold, setPSold] = useState<Period>("30d");
  const [pSoldCustom, setPSoldCustom] = useState<CustomRange>({});
  const [pMargin, setPMargin] = useState<Period>("30d");
  const [pMarginCustom, setPMarginCustom] = useState<CustomRange>({});
  const [pProfit, setPProfit] = useState<Period>("30d");
  const [pProfitCustom, setPProfitCustom] = useState<CustomRange>({});
  const [allSales, setAllSales] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [openClass, setOpenClass] = useState<"A" | "B" | "C" | null>(null);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [histDays, setHistDays] = useState(90);
  const [projDays, setProjDays] = useState(30);
  const [suggestEdits, setSuggestEdits] = useState<Record<string, number>>({});

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
    const { from, to } = rangeFor(period, periodCustom);
    const agg = new Map<string, { revenue: number; qty: number; cost: number }>();
    const costMap = new Map<string, number>();
    allProducts.forEach((p: any) => costMap.set(p.id, Number(p.cost_price || 0)));
    allSales.forEach((s: any) => {
      const t = new Date(s.created_at).getTime();
      if (t < from || t > to) return;
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
  }, [allProducts, allSales, period, periodCustom]);

  const ranking = (p: Period, custom: CustomRange | undefined, key: "qty" | "margin" | "profit") => {
    const { from, to } = rangeFor(p, custom);
    const costMap = new Map<string, number>();
    allProducts.forEach((pr: any) => costMap.set(pr.id, Number(pr.cost_price || 0)));
    const nameMap = new Map<string, string>();
    allProducts.forEach((pr: any) => nameMap.set(pr.id, pr.name));
    const agg = new Map<string, { qty: number; revenue: number; cost: number }>();
    allSales.forEach((s: any) => {
      const t = new Date(s.created_at).getTime();
      if (t < from || t > to) return;
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

  const topSold = useMemo(() => ranking(pSold, pSoldCustom, "qty"), [pSold, pSoldCustom, allSales, allProducts]);
  const topMargin = useMemo(() => ranking(pMargin, pMarginCustom, "margin"), [pMargin, pMarginCustom, allSales, allProducts]);
  const topProfit = useMemo(() => ranking(pProfit, pProfitCustom, "profit"), [pProfit, pProfitCustom, allSales, allProducts]);

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

  // --- Compra sugerida ---
  const suggestions = useMemo(() => {
    const since = Date.now() - histDays * 86400_000;
    const sold = new Map<string, number>();
    allSales.forEach((s: any) => {
      const t = new Date(s.created_at).getTime();
      if (t < since) return;
      (s.sale_items ?? []).forEach((it: any) => {
        if (!it.product_id) return;
        sold.set(it.product_id, (sold.get(it.product_id) ?? 0) + (Number(it.quantity) || 0));
      });
    });
    const factor = histDays > 0 ? projDays / histDays : 0;
    return allProducts
      .map((p: any) => {
        const qtySold = sold.get(p.id) ?? 0;
        const projected = Math.ceil(qtySold * factor);
        const stock = Number(p.stock_current || 0);
        const baseSuggest = Math.max(0, projected - stock);
        const cost = Number(p.cost_price || 0);
        return {
          id: p.id,
          name: p.name,
          stock,
          qtySold,
          projected,
          suggested: suggestEdits[p.id] ?? baseSuggest,
          baseSuggest,
          cost,
        };
      })
      .filter((r) => r.qtySold > 0 || r.suggested > 0)
      .sort((a, b) => b.suggested - a.suggested || b.qtySold - a.qtySold);
  }, [allProducts, allSales, histDays, projDays, suggestEdits]);

  const suggestTotal = useMemo(
    () => suggestions.reduce((s, r) => s + r.suggested * r.cost, 0),
    [suggestions],
  );

  const buildSuggestHtml = () => {
    const today = new Date().toLocaleDateString("pt-BR");
    const storeName = (store as any)?.trade_name || (store as any)?.name || "Loja";
    const rowsHtml = suggestions.map((r, i) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#64748b">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${escapeHtml(r.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right">${r.qtySold}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right">${r.stock}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right">${r.projected}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#0f172a">${r.suggested}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right">${brl(r.suggested * r.cost)}</td>
      </tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Compra sugerida</title>
      <style>
        @page { size:A4; margin:14mm }
        body { font-family: system-ui, -apple-system, sans-serif; color:#0f172a; margin:0 }
        h1 { font-size:18px; margin:0 0 4px }
        .meta { font-size:11px; color:#64748b; margin-bottom:12px }
        table { width:100%; border-collapse:collapse; font-size:12px }
        th { background:#f1f5f9; text-align:left; padding:8px; border-bottom:1px solid #e2e8f0 }
        tfoot td { padding:8px; font-weight:700; border-top:2px solid #0f172a }
      </style></head><body>
      <h1>Compra sugerida — ${escapeHtml(storeName)}</h1>
      <div class="meta">Base: últimos ${histDays} dias · Projeção: próximos ${projDays} dias · Emitido em ${today}</div>
      <table>
        <thead><tr>
          <th>#</th><th>Produto</th>
          <th style="text-align:right">Vendido (${histDays}d)</th>
          <th style="text-align:right">Estoque</th>
          <th style="text-align:right">Projeção (${projDays}d)</th>
          <th style="text-align:right">Comprar</th>
          <th style="text-align:right">Custo total</th>
        </tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="7" style="padding:24px;text-align:center;color:#64748b">Sem dados.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="6" style="text-align:right">Investimento estimado</td><td style="text-align:right">${brl(suggestTotal)}</td></tr></tfoot>
      </table>
      </body></html>`;
  };

  const handlePrintSuggest = (autoPrint: boolean) => {
    const html = buildSuggestHtml() + (autoPrint ? `<script>window.onload=()=>setTimeout(()=>window.print(),250)</script>` : "");
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para abrir o documento.");
    w.document.write(html);
    w.document.close();
  };

  const handleSaveSuggest = () => {
    try {
      const key = `phonee.suggestList.${(store as any)?.id || "default"}`;
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      prev.unshift({
        savedAt: new Date().toISOString(),
        histDays, projDays,
        total: suggestTotal,
        items: suggestions.map((r) => ({ id: r.id, name: r.name, suggested: r.suggested, cost: r.cost })),
      });
      localStorage.setItem(key, JSON.stringify(prev.slice(0, 20)));
      toast.success("Lista de compra salva.");
    } catch {
      toast.error("Não foi possível salvar a lista.");
    }
  };

  return (
    <div>
      <PageHeader
        title="Curva ABC & Regra 80/20"
        description="Classificação automática dos produtos por faturamento."
        actions={
          <Button onClick={() => setOpenSuggest(true)} className="bg-gradient-primary shadow-glow">
            <ShoppingCart className="h-4 w-4 mr-1" /> Compra sugerida
          </Button>
        }
      />

      <Card className="mb-4 p-3 border-primary/30 bg-primary/[0.04] flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <ShoppingCart className="h-4 w-4" />
        </div>
        <div className="text-sm leading-snug">
          <div className="font-semibold">Sugestão de compra inteligente</div>
          <div className="text-muted-foreground text-xs mt-0.5">
            As quantidades sugeridas são calculadas a partir do seu histórico de vendas no período selecionado — comprando o suficiente para repor o que costuma sair, sem inflar o estoque.
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end mb-4">
        <PeriodFilter
          value={period} onChange={setPeriod}
          options={ABC_OPTIONS}
          custom={periodCustom} onCustomChange={setPeriodCustom}
        />
      </div>

      {/* KPIs no estilo do Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {(["A", "B", "C"] as const).map((cls) => {
          const tone: any = cls === "A" ? "success" : cls === "B" ? "warning" : "danger";
          const c = totals.counts[cls];
          const r = totals.rev[cls];
          const sharePct = totals.totalRevenue ? (r / totals.totalRevenue) * 100 : 0;
          return (
            <button
              key={cls}
              type="button"
              onClick={() => setOpenClass(cls)}
              className="text-left rounded-lg transition-transform hover:-translate-y-0.5 hover:shadow-glow focus:outline-none focus:ring-2 focus:ring-primary/60"
              aria-label={`Ver produtos da Classe ${cls}`}
            >
              <MetricCard
                label={`Classe ${cls}`}
                value={brl(r)}
                delta={`${num(c)} produtos que correspondem a ${pct(sharePct)} do faturamento`}
                icon={cls === "A" ? Trophy : cls === "B" ? Award : Minus}
                tone={tone}
                className="cursor-pointer h-full"
              />
            </button>
          );
        })}
      </div>

      <Dialog open={openClass !== null} onOpenChange={(o) => !o && setOpenClass(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Produtos da Classe {openClass}</DialogTitle>
            <DialogDescription>
              {openClass === "A" && "Top vendedores — sustentam até 80% do faturamento."}
              {openClass === "B" && "Relevância média — próximos 15% do faturamento."}
              {openClass === "C" && "Cauda longa — últimos 5% do faturamento."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {(() => {
              const list = rows.filter((r) => r.class === openClass);
              if (!list.length) return <p className="text-sm text-muted-foreground py-6 text-center">Nenhum produto nesta classe no período.</p>;
              return (
                <table className="w-full text-sm">
                  <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">#</th>
                      <th className="text-left px-3 py-2 font-medium">Produto</th>
                      <th className="text-right px-3 py-2 font-medium">Receita</th>
                      <th className="text-right px-3 py-2 font-medium">% acum.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((r, i) => (
                      <tr key={r.id} className="hover:bg-surface-elevated/40">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-right metric font-semibold">{brl(r.revenue)}</td>
                        <td className="px-3 py-2 text-right metric text-muted-foreground">{pct(r.cum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rankings */}
      {canSeeCost(role) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <RankingCard
            title="Mais vendidos"
            icon={<Trophy className="h-4 w-4 text-primary" />}
            period={pSold} onPeriod={setPSold}
            custom={pSoldCustom} onCustom={setPSoldCustom}
            items={topSold}
            metric={(r) => `${num(r.qty)} un.`}
            sub={(r) => brl(r.revenue)}
          />
          <RankingCard
            title="Maiores margens"
            icon={<Percent className="h-4 w-4 text-emerald-600" />}
            period={pMargin} onPeriod={setPMargin}
            custom={pMarginCustom} onCustom={setPMarginCustom}
            items={topMargin}
            metric={(r) => pct(r.margin)}
            sub={(r) => `Lucro ${brl(r.profit)}`}
          />
          <RankingCard
            title="Maiores lucros"
            icon={<Wallet className="h-4 w-4 text-amber-600" />}
            period={pProfit} onPeriod={setPProfit}
            custom={pProfitCustom} onCustom={setPProfitCustom}
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