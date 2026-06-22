import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Zap, Info, AlertTriangle, Trash2 } from "lucide-react";
import { brl, num } from "@/lib/format";
import { toast } from "sonner";

const COVERAGE_DAYS = 30; // sugerir cobertura de 30 dias
const WINDOW_DAYS = 60;

type Suggestion = {
  product_id: string;
  product_name: string;
  supplier: string;
  stock_current: number;
  stock_min: number;
  cost_price: number;
  daily_velocity: number;
  days_to_rupture: number | null;
  suggested_qty: number;
  unit_cost: number;
  selected: boolean;
};

const InfoTip = ({ children }: { children: React.ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild><button type="button" className="text-muted-foreground hover:text-foreground"><Info className="h-3.5 w-3.5" /></button></TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-xs">{children}</TooltipContent>
  </Tooltip>
);

export default function PedidoNovo() {
  const { store, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
      const [{ data: products }, { data: sales }] = await Promise.all([
        supabase.from("products")
          .select("id, name, supplier, cost_price, stock_current, stock_min, status")
          .eq("store_id", store.id)
          .eq("status", "ativo"),
        supabase.from("sales")
          .select("created_at, sale_items(product_id, quantity)")
          .eq("store_id", store.id)
          .gte("created_at", since),
      ]);

      const sold = new Map<string, number>();
      (sales ?? []).forEach((s: any) =>
        (s.sale_items ?? []).forEach((it: any) => {
          if (!it.product_id) return;
          sold.set(it.product_id, (sold.get(it.product_id) ?? 0) + Number(it.quantity || 0));
        })
      );

      const sugg: Suggestion[] = (products ?? []).flatMap((p: any) => {
        const totalSold = sold.get(p.id) ?? 0;
        const velocity = totalSold / WINDOW_DAYS; // unidades/dia
        const needsBecauseLow = p.stock_current <= p.stock_min;
        // Previsão de ruptura
        const daysToRupture = velocity > 0 ? Math.floor(p.stock_current / velocity) : null;
        const ruptureSoon = daysToRupture !== null && daysToRupture <= 14;
        if (!needsBecauseLow && !ruptureSoon) return [];
        const target = Math.max(p.stock_min + Math.ceil(velocity * COVERAGE_DAYS), Math.ceil(velocity * COVERAGE_DAYS));
        const qty = Math.max(1, target - p.stock_current);
        return [{
          product_id: p.id,
          product_name: p.name,
          supplier: (p.supplier?.trim()) || "Sem fornecedor",
          stock_current: p.stock_current,
          stock_min: p.stock_min,
          cost_price: Number(p.cost_price) || 0,
          daily_velocity: velocity,
          days_to_rupture: daysToRupture,
          suggested_qty: qty,
          unit_cost: Number(p.cost_price) || 0,
          selected: true,
        }];
      });

      // ordena por urgência (ruptura mais próxima primeiro)
      sugg.sort((a, b) => (a.days_to_rupture ?? 999) - (b.days_to_rupture ?? 999));
      setSuggestions(sugg);
      setLoading(false);
    })();
  }, [store]);

  const update = (idx: number, patch: Partial<Suggestion>) =>
    setSuggestions((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const grouped = useMemo(() => {
    const map = new Map<string, { items: Suggestion[]; total: number }>();
    suggestions.filter((s) => s.selected).forEach((s) => {
      const g = map.get(s.supplier) ?? { items: [], total: 0 };
      g.items.push(s);
      g.total += s.suggested_qty * s.unit_cost;
      map.set(s.supplier, g);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [suggestions]);

  const grandTotal = grouped.reduce((sum, [, g]) => sum + g.total, 0);

  const generate = async () => {
    if (!store || !user) return;
    if (grouped.length === 0) return toast.error("Selecione ao menos um item.");
    setSaving(true);
    let created = 0;
    for (const [supplier, g] of grouped) {
      const { data: order, error } = await supabase
        .from("purchase_orders")
        .insert({ store_id: store.id, created_by: user.id, supplier, status: "rascunho", total_cost: g.total })
        .select("id")
        .single();
      if (error) { toast.error(error.message); continue; }
      const items = g.items.map((it) => ({
        order_id: order!.id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.suggested_qty,
        unit_cost: it.unit_cost,
        total: it.suggested_qty * it.unit_cost,
      }));
      await supabase.from("purchase_order_items").insert(items);
      created++;
    }
    setSaving(false);
    toast.success(`${created} pedido(s) criado(s) em rascunho.`);
    navigate("/app/pedidos");
  };

  return (
    <div>
      <PageHeader
        title="Gerador de pedido de reposição"
        description={`Análise dos últimos ${WINDOW_DAYS} dias · cobertura sugerida de ${COVERAGE_DAYS} dias.`}
        actions={<Button variant="ghost" onClick={() => navigate("/app/pedidos")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>}
      />

      <Card className="p-4 bg-primary/5 border-primary/30 mb-6">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-primary mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">Como o SmartStock sugere a quantidade?</p>
            <p className="text-muted-foreground">
              Cruzamos o <strong className="text-foreground">giro médio</strong> dos últimos {WINDOW_DAYS} dias com o <strong className="text-foreground">estoque mínimo</strong> e prevemos a <strong className="text-foreground">ruptura</strong>. A sugestão garante {COVERAGE_DAYS} dias de venda + buffer do ponto de pedido.
            </p>
          </div>
        </div>
      </Card>

      <Card className="bg-card border-border overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Itens sugeridos</h3>
          <span className="text-[11px] font-mono text-muted-foreground tracking-widest">
            {num(suggestions.filter((s) => s.selected).length)} / {num(suggestions.length)} SELECIONADOS
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="px-4 py-3"></th>
                <th className="text-left px-4 py-3 font-medium">Produto</th>
                <th className="text-left px-4 py-3 font-medium">Fornecedor</th>
                <th className="text-right px-4 py-3 font-medium">Estoque</th>
                <th className="text-right px-4 py-3 font-medium"><span className="inline-flex items-center gap-1">Giro/dia <InfoTip>Vendas médias diárias nos últimos {WINDOW_DAYS} dias.</InfoTip></span></th>
                <th className="text-right px-4 py-3 font-medium"><span className="inline-flex items-center gap-1">Ruptura em <InfoTip>Dias estimados para zerar com o giro atual.</InfoTip></span></th>
                <th className="text-right px-4 py-3 font-medium">Qtd sugerida</th>
                <th className="text-right px-4 py-3 font-medium">Custo unit.</th>
                <th className="text-right px-4 py-3 font-medium">Subtotal</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">ANALISANDO ESTOQUE…</td></tr>
              ) : suggestions.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-16 text-center text-sm text-muted-foreground">Nenhum produto em ponto de pedido ou risco de ruptura. Estoque saudável! 🎉</td></tr>
              ) : suggestions.map((s, i) => {
                const urgent = s.days_to_rupture !== null && s.days_to_rupture <= 7;
                return (
                  <tr key={s.product_id} className={`hover:bg-surface-elevated/40 ${!s.selected ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3"><input type="checkbox" checked={s.selected} onChange={(e) => update(i, { selected: e.target.checked })} /></td>
                    <td className="px-4 py-3 font-medium">{s.product_name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{s.supplier}</td>
                    <td className="px-4 py-3 text-right metric">
                      <span className={s.stock_current <= s.stock_min ? "text-warning font-semibold" : ""}>{s.stock_current}</span>
                      <div className="text-[10px] text-muted-foreground font-mono">min {s.stock_min}</div>
                    </td>
                    <td className="px-4 py-3 text-right metric text-muted-foreground">{s.daily_velocity.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {s.days_to_rupture === null ? (
                        <span className="text-xs text-muted-foreground">sem giro</span>
                      ) : urgent ? (
                        <Badge className="bg-danger/15 text-danger border-danger/30"><AlertTriangle className="h-3 w-3 mr-1" />{s.days_to_rupture}d</Badge>
                      ) : (
                        <span className="metric text-xs">{s.days_to_rupture}d</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Input type="number" min={1} value={s.suggested_qty} onChange={(e) => update(i, { suggested_qty: Math.max(1, Number(e.target.value) || 1) })} className="h-8 w-20 ml-auto text-right font-mono" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Input type="number" step="0.01" value={s.unit_cost} onChange={(e) => update(i, { unit_cost: Number(e.target.value) || 0 })} className="h-8 w-24 ml-auto text-right font-mono" />
                    </td>
                    <td className="px-4 py-3 text-right metric font-semibold">{brl(s.suggested_qty * s.unit_cost)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="icon" variant="ghost" onClick={() => setSuggestions((arr) => arr.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5 text-danger" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {grouped.length > 0 && (
        <Card className="p-5 bg-card border-border mb-6">
          <h3 className="font-semibold mb-3">Resumo por fornecedor</h3>
          <div className="space-y-2">
            {grouped.map(([sup, g]) => (
              <div key={sup} className="flex items-center justify-between p-3 rounded-md bg-surface-elevated border border-border">
                <div>
                  <div className="font-medium">{sup}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{g.items.length} item(s)</div>
                </div>
                <div className="metric font-bold">{brl(g.total)}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
            <Label className="text-base">Total geral do pedido</Label>
            <div className="metric text-2xl font-bold text-primary">{brl(grandTotal)}</div>
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate("/app/pedidos")}>Cancelar</Button>
        <Button onClick={generate} disabled={saving || grouped.length === 0} className="bg-gradient-primary shadow-glow">
          {saving ? "Gerando…" : `Gerar ${grouped.length} pedido(s)`}
        </Button>
      </div>
    </div>
  );
}