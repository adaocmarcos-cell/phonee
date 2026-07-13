import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";

type Row = {
  trade_in_id: string;
  model: string;
  customer_name: string;
  status: string;
  entry_value: number;
  repair_costs: number;
  product_id: string | null;
  product_cost_price: number | null;
  product_status: string | null;
  sold_at: string | null;
  sale_id: string | null;
  sold_price: number | null;
  sold_cmv: number | null;
  cash_received: number | null; // parte monetária da venda que consumiu este trade-in
  trade_amount: number | null;  // parte "troca" recebida em outra venda usando este trade-in como pagamento
};

/**
 * Tela de reconciliação — cruza trade_ins com products (custo/CMV) e sales (receita/caixa)
 * para achar rapidamente inconsistências de valor:
 *  - trade-in convertido em produto com custo divergente de entry_value + repair_costs
 *  - trade-in usado como meio de pagamento sem sale_payment "troca" correspondente
 *  - trade-in vendido com CMV zero ou negativo
 */
export default function TradeInReconciliacao() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      // Carrega trade-ins + produto vinculado + item de venda (se vendido)
      const { data: tis } = await supabase
        .from("trade_ins")
        .select("id, model, customer_name, status, entry_value, repair_costs, product_id, received_in_sale_id")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(500);

      const trades = tis ?? [];
      const productIds = trades.map((t: any) => t.product_id).filter(Boolean) as string[];
      const { data: prods } = productIds.length
        ? await supabase.from("products").select("id, cost_price, status").in("id", productIds)
        : { data: [] as any[] };
      const prodMap = new Map((prods ?? []).map((p: any) => [p.id, p]));

      // Vendas onde o produto do trade-in foi vendido (CMV)
      const { data: soldItems } = productIds.length
        ? await supabase
            .from("sale_items")
            .select("product_id, quantity, unit_price, total, sale_id, sales!inner(id, created_at, store_id)")
            .in("product_id", productIds)
        : { data: [] as any[] };

      // Pagamentos com trade_in_id (aparelho usado como parte do pagamento em outra venda)
      const tradeIds = trades.map((t: any) => t.id);
      const { data: tradePays } = tradeIds.length
        ? await supabase
            .from("sale_payments")
            .select("trade_in_id, amount, sale_id")
            .in("trade_in_id", tradeIds)
        : { data: [] as any[] };

      const tradePayMap = new Map<string, number>();
      (tradePays ?? []).forEach((p: any) => {
        tradePayMap.set(p.trade_in_id, (tradePayMap.get(p.trade_in_id) ?? 0) + Number(p.amount || 0));
      });

      const soldMap = new Map<string, any>();
      (soldItems ?? []).forEach((it: any) => {
        soldMap.set(it.product_id, it);
      });

      const out: Row[] = trades.map((t: any) => {
        const p = t.product_id ? prodMap.get(t.product_id) : null;
        const sold = t.product_id ? soldMap.get(t.product_id) : null;
        return {
          trade_in_id: t.id,
          model: t.model,
          customer_name: t.customer_name,
          status: t.status,
          entry_value: Number(t.entry_value || 0),
          repair_costs: Number(t.repair_costs || 0),
          product_id: t.product_id,
          product_cost_price: p ? Number(p.cost_price || 0) : null,
          product_status: p ? p.status : null,
          sold_at: sold?.sales?.created_at ?? null,
          sale_id: sold?.sale_id ?? null,
          sold_price: sold ? Number(sold.total || 0) : null,
          sold_cmv: sold && p ? Number(sold.quantity || 0) * Number(p.cost_price || 0) : null,
          cash_received: null,
          trade_amount: tradePayMap.get(t.id) ?? null,
        };
      });

      setRows(out);
      setLoading(false);
    })();
  }, [store]);

  const analyzed = useMemo(() => {
    return rows.map((r) => {
      const expectedCost = r.entry_value + r.repair_costs;
      const issues: string[] = [];
      if (r.product_id) {
        if (Math.abs((r.product_cost_price ?? 0) - expectedCost) > 0.01) {
          issues.push(
            `Custo do produto (${brl(r.product_cost_price ?? 0)}) ≠ entry+reparo (${brl(expectedCost)})`
          );
        }
      }
      if (r.sold_price != null && (r.sold_cmv ?? 0) <= 0) {
        issues.push("Vendido com CMV zero — cost_price não estava definido no momento da venda");
      }
      if (r.trade_amount != null && r.trade_amount > 0 && Math.abs(r.trade_amount - r.entry_value) > 0.01) {
        issues.push(
          `Recebido como troca em venda por ${brl(r.trade_amount)} ≠ entry_value ${brl(r.entry_value)}`
        );
      }
      if (r.status === "vendido" && !r.sale_id && !r.trade_amount) {
        issues.push("Marcado vendido mas não encontrei venda associada");
      }
      return { ...r, issues, expectedCost };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return analyzed.filter((r) => {
      if (onlyIssues && r.issues.length === 0) return false;
      if (term && !`${r.model} ${r.customer_name}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [analyzed, q, onlyIssues]);

  const totals = useMemo(() => {
    const invested = analyzed.reduce((s, r) => s + r.entry_value + r.repair_costs, 0);
    const inStock = analyzed
      .filter((r) => r.status === "em_estoque")
      .reduce((s, r) => s + r.expectedCost, 0);
    const cmv = analyzed.reduce((s, r) => s + (r.sold_cmv ?? 0), 0);
    const revenue = analyzed.reduce((s, r) => s + (r.sold_price ?? 0), 0);
    const tradesInSales = analyzed.reduce((s, r) => s + (r.trade_amount ?? 0), 0);
    const issues = analyzed.filter((r) => r.issues.length > 0).length;
    return { invested, inStock, cmv, revenue, tradesInSales, issues };
  }, [analyzed]);

  return (
    <div>
      <PageHeader
        title="Reconciliação · Compra & Troca"
        description="Cruza entradas de trade-in com custo do produto, CMV e caixa recebido. Destaca divergências para auditoria rápida."
        actions={
          <Button variant="ghost" onClick={() => navigate("/painel/troca")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        }
      />

      <div className="grid md:grid-cols-5 gap-3 mb-4">
        <Card className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Investido em C&T</div><div className="metric font-semibold">{brl(totals.invested)}</div></Card>
        <Card className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Em estoque (custo)</div><div className="metric font-semibold">{brl(totals.inStock)}</div></Card>
        <Card className="p-3"><div className="text-[10px] uppercase text-muted-foreground">CMV realizado</div><div className="metric font-semibold">{brl(totals.cmv)}</div></Card>
        <Card className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Receita bruta</div><div className="metric font-semibold">{brl(totals.revenue)}</div></Card>
        <Card className={`p-3 ${totals.issues > 0 ? "border-warning/60" : ""}`}>
          <div className="text-[10px] uppercase text-muted-foreground">Inconsistências</div>
          <div className={`metric font-semibold ${totals.issues > 0 ? "text-warning" : "text-success"}`}>{totals.issues}</div>
        </Card>
      </div>

      <Card className="p-3 mb-4">
        <div className="grid md:grid-cols-[1fr_auto] gap-2 items-center">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por modelo ou cliente…" className="pl-9" />
          </div>
          <Button variant={onlyIssues ? "default" : "outline"} onClick={() => setOnlyIssues((v) => !v)}>
            <AlertTriangle className="h-4 w-4 mr-1" /> Só divergências
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Aparelho</th>
                <th className="text-right px-3 py-2 font-medium">Entrada</th>
                <th className="text-right px-3 py-2 font-medium">Reparo</th>
                <th className="text-right px-3 py-2 font-medium">Custo esperado</th>
                <th className="text-right px-3 py-2 font-medium">Custo produto</th>
                <th className="text-right px-3 py-2 font-medium">CMV venda</th>
                <th className="text-right px-3 py-2 font-medium">Receita venda</th>
                <th className="text-right px-3 py-2 font-medium">Recebido como troca</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-xs font-mono text-muted-foreground">CARREGANDO…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                  {onlyIssues ? "Nenhuma divergência encontrada." : "Sem entradas para reconciliar."}
                </td></tr>
              ) : filtered.map((r) => {
                const bad = r.issues.length > 0;
                return (
                  <tr key={r.trade_in_id}
                      className={`hover:bg-surface-elevated/40 cursor-pointer ${bad ? "bg-warning/5" : ""}`}
                      onClick={() => navigate(`/painel/troca/${r.trade_in_id}/detalhes`)}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.model}</div>
                      <div className="text-[11px] text-muted-foreground">{r.customer_name}</div>
                      {bad && (
                        <ul className="mt-1 space-y-0.5">
                          {r.issues.map((i) => (
                            <li key={i} className="text-[10px] text-warning flex items-start gap-1">
                              <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" /> {i}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right metric">{brl(r.entry_value)}</td>
                    <td className="px-3 py-2 text-right metric">{brl(r.repair_costs)}</td>
                    <td className="px-3 py-2 text-right metric font-semibold">{brl(r.expectedCost)}</td>
                    <td className="px-3 py-2 text-right metric">{r.product_cost_price != null ? brl(r.product_cost_price) : "—"}</td>
                    <td className="px-3 py-2 text-right metric">{r.sold_cmv != null ? brl(r.sold_cmv) : "—"}</td>
                    <td className="px-3 py-2 text-right metric">{r.sold_price != null ? brl(r.sold_price) : "—"}</td>
                    <td className="px-3 py-2 text-right metric">{r.trade_amount ? brl(r.trade_amount) : "—"}</td>
                    <td className="px-3 py-2">
                      {bad ? (
                        <Badge className="bg-warning/15 text-warning border-warning/30"><AlertTriangle className="h-3 w-3 mr-1" />Rever</Badge>
                      ) : (
                        <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>
                      )}
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