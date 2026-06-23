import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeCost, canManageProducts } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Package, AlertTriangle, Edit3, Trash2, ShoppingBag, Tag } from "lucide-react";
import { brl, num, daysAgo } from "@/lib/format";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { VendaRapidaModal } from "@/components/VendaRapidaModal";
import { MarcasModal } from "@/components/MarcasModal";
import { canRegisterSale } from "@/contexts/AuthContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Product = {
  id: string;
  name: string; sku: string | null; brand: string | null;
  category: string; condition: string; status: string;
  cost_price: number; sale_price: number;
  stock_current: number; stock_min: number;
  last_sold_at: string | null;
};

const categoryLabel: Record<string, string> = {
  acessorio: "Acessório", peca: "Peça",
  aparelho_novo: "Aparelho novo", aparelho_seminovo: "Aparelho seminovo",
};

export default function Estoque() {
  const { store, role } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "stalled">("all");
  const [delTarget, setDelTarget] = useState<Product | null>(null);
  const [saleTarget, setSaleTarget] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [marcasOpen, setMarcasOpen] = useState(false);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("id, name, sku, brand, category, condition, status, cost_price, sale_price, stock_current, stock_min, last_sold_at")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (q && !`${p.name} ${p.sku ?? ""} ${p.brand ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (filter === "low" && p.stock_current > p.stock_min) return false;
      if (filter === "stalled") {
        const d = daysAgo(p.last_sold_at);
        if (d !== null && d <= 30) return false;
      }
      return true;
    });
  }, [products, q, filter]);

  const totals = useMemo(() => ({
    count: products.length,
    low: products.filter((p) => p.stock_current <= p.stock_min).length,
    value: products.reduce((s, p) => s + Number(p.sale_price) * p.stock_current, 0),
  }), [products]);

  const handleDelete = async () => {
    if (!delTarget) return;
    const { error } = await supabase.from("products").delete().eq("id", delTarget.id);
    setDelTarget(null);
    if (error) return toast.error(error.message);
    toast.success("Produto removido");
    load();
  };

  const toggleActive = async (p: Product, next: boolean) => {
    const newStatus = next ? "ativo" : "inativo";
    setProducts((arr) => arr.map((x) => (x.id === p.id ? { ...x, status: newStatus } : x)));
    const { error } = await supabase.from("products").update({ status: newStatus }).eq("id", p.id);
    if (error) {
      toast.error(error.message);
      setProducts((arr) => arr.map((x) => (x.id === p.id ? { ...x, status: p.status } : x)));
      return;
    }
    toast.success(next ? "Produto ativado" : "Produto desativado");
  };

  return (
    <div>
      <PageHeader
        title="Estoque"
        description={`${num(totals.count)} produtos · ${brl(totals.value)} em valor de vitrine · ${num(totals.low)} em ponto de pedido`}
        actions={
          canManageProducts(role) && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMarcasOpen(true)}
                title="Marcas que você trabalha"
                aria-label="Marcas"
              >
                <Tag className="h-4 w-4" />
              </Button>
              <Button onClick={() => navigate("/app/estoque/novo")} className="bg-gradient-primary shadow-glow">
                <Plus className="h-4 w-4 mr-1" /> Novo produto
              </Button>
            </div>
          )
        }
      />

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, SKU ou marca…" className="pl-9 h-10 bg-card border-border" />
        </div>
        <div className="flex gap-1 p-1 bg-card border border-border rounded-md">
          {(["all", "low", "stalled"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} onClick={() => setFilter(f)} className={filter === f ? "bg-primary text-primary-foreground" : ""}>
              {f === "all" ? "Todos" : f === "low" ? "Em alerta" : "Encalhados"}
            </Button>
          ))}
        </div>
      </div>

      <Card className="bg-card border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Produto</th>
                <th className="text-left px-4 py-3 font-medium">Categoria</th>
                <th className="text-right px-4 py-3 font-medium">Estoque</th>
                {canSeeCost(role) && <th className="text-right px-4 py-3 font-medium">Custo</th>}
                <th className="text-right px-4 py-3 font-medium">Venda</th>
                {canSeeCost(role) && <th className="text-right px-4 py-3 font-medium">Margem</th>}
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Ativo</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhum produto encontrado.</p>
                  {canManageProducts(role) && (
                    <Button onClick={() => navigate("/app/estoque/novo")} className="bg-gradient-primary">
                      <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro produto
                    </Button>
                  )}
                </td></tr>
              ) : filtered.map((p) => {
                const margin = p.sale_price > 0 ? ((p.sale_price - p.cost_price) / p.sale_price) * 100 : 0;
                const low = p.stock_current <= p.stock_min;
                return (
                  <tr key={p.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{p.sku || "—"}{p.brand ? ` · ${p.brand}` : ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="border-border text-xs">{categoryLabel[p.category] ?? p.category}</Badge>
                      <div className="text-[11px] text-muted-foreground mt-1 capitalize">{p.condition}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`metric font-semibold ${low ? "text-warning" : ""}`}>{p.stock_current}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">min {p.stock_min}</div>
                    </td>
                    {canSeeCost(role) && <td className="px-4 py-3 text-right metric text-muted-foreground">{brl(Number(p.cost_price))}</td>}
                    <td className="px-4 py-3 text-right metric font-semibold">{brl(Number(p.sale_price))}</td>
                    {canSeeCost(role) && <td className="px-4 py-3 text-right">
                      <span className={`metric text-xs ${margin >= 30 ? "text-success" : margin >= 15 ? "text-warning" : "text-danger"}`}>{margin.toFixed(0)}%</span>
                    </td>}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {low && <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/20"><AlertTriangle className="h-3 w-3 mr-1" />Baixo</Badge>}
                        {p.status === "promocao" && <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20">Promo</Badge>}
                        {p.status === "inativo" && <Badge variant="outline">Inativo</Badge>}
                        {!low && p.status === "ativo" && <Badge variant="outline" className="border-border text-muted-foreground">Ativo</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <Switch
                          checked={p.status === "ativo"}
                          onCheckedChange={(v) => toggleActive(p, v)}
                          disabled={!canManageProducts(role)}
                          aria-label={p.status === "ativo" ? "Desativar produto" : "Ativar produto"}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {canRegisterSale(role) && p.stock_current > 0 && (
                          <Button size="icon" variant="ghost" onClick={() => setSaleTarget(p)} title="Registrar venda">
                            <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        )}
                        {canManageProducts(role) && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => navigate(`/app/estoque/${p.id}`)}>
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDelTarget(p)} className="text-danger hover:text-danger">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a remover <strong className="text-foreground">{delTarget?.name}</strong>. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-danger hover:bg-danger/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VendaRapidaModal
        open={!!saleTarget}
        onOpenChange={(o) => !o && setSaleTarget(null)}
        product={saleTarget}
        onDone={() => { setSaleTarget(null); load(); }}
      />

      <MarcasModal open={marcasOpen} onOpenChange={setMarcasOpen} />
    </div>
  );
}