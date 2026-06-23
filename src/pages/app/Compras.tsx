import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canManageProducts } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, ShoppingCart, Trash2, Package, CheckCircle2, PackagePlus } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";

type Supplier = { id: string; company_name: string; brands: string[]; avg_delivery_days: number | null };
type Item = { id?: string; product_id?: string | null; product_name: string; quantity: number; unit_cost: number; notes?: string | null };
type Order = {
  id: string;
  store_id: string;
  supplier: string | null;
  supplier_id: string | null;
  status: "rascunho" | "enviado" | "recebido" | "parcial" | "cancelado";
  total_cost: number;
  notes: string | null;
  payment_method: string | null;
  expected_delivery_at: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Order["status"], string> = {
  rascunho: "Rascunho", enviado: "Enviado", recebido: "Recebido", parcial: "Parcial", cancelado: "Cancelado",
};
const STATUS_COLOR: Record<Order["status"], string> = {
  rascunho: "bg-muted text-muted-foreground border-border",
  enviado: "bg-primary/15 text-primary border-primary/30",
  recebido: "bg-success/15 text-success border-success/30",
  parcial: "bg-warning/15 text-warning border-warning/30",
  cancelado: "bg-danger/15 text-danger border-danger/30",
};

export default function Compras() {
  const { store, role } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [fSupplier, setFSupplier] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPeriod, setFPeriod] = useState<string>("90");
  const [loading, setLoading] = useState(true);

  // dialog
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Order>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [bulk, setBulk] = useState("");
  const [delTarget, setDelTarget] = useState<Order | null>(null);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const [{ data: o }, { data: s }] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("store_id", store.id).order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, company_name, brands, avg_delivery_days").eq("store_id", store.id).eq("active", true).order("company_name"),
    ]);
    setOrders((o ?? []) as Order[]);
    setSuppliers((s ?? []) as Supplier[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const cutoff = fPeriod === "all" ? 0 : Date.now() - Number(fPeriod) * 24 * 3600 * 1000;
    return orders.filter((o) => {
      if (fSupplier !== "all" && o.supplier_id !== fSupplier) return false;
      if (fStatus !== "all" && o.status !== fStatus) return false;
      if (cutoff && new Date(o.created_at).getTime() < cutoff) return false;
      if (term && !`${o.supplier ?? ""} ${o.notes ?? ""} ${o.payment_method ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [orders, q, fSupplier, fStatus, fPeriod]);

  const totals = useMemo(() => {
    const purchased = filtered.reduce((s, o) => s + Number(o.total_cost ?? 0), 0);
    const lastOrders = [...filtered].slice(0, 5);
    return {
      count: filtered.length,
      purchased,
      activeSuppliers: new Set(filtered.map((o) => o.supplier_id).filter(Boolean)).size,
      lastOrders,
    };
  }, [filtered]);

  const startNew = () => {
    setForm({ status: "rascunho", payment_method: "", expected_delivery_at: "", notes: "", supplier_id: null });
    setItems([{ product_name: "", quantity: 1, unit_cost: 0 }]);
    setBulk("");
    setOpen(true);
  };

  const orderTotal = useMemo(() => items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0), [items]);

  const applyBulk = () => {
    const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed: Item[] = lines.map((l) => {
      // formato: nome;qtd;custo
      const parts = l.split(/[;\t,]/).map((p) => p.trim());
      const name = parts[0] ?? "";
      const qty = Number((parts[1] ?? "1").replace(",", ".")) || 1;
      const cost = Number((parts[2] ?? "0").replace(",", ".")) || 0;
      return { product_name: name, quantity: qty, unit_cost: cost };
    }).filter((i) => i.product_name);
    if (parsed.length === 0) { toast.error("Nenhuma linha válida"); return; }
    setItems((arr) => [...arr.filter((i) => i.product_name), ...parsed]);
    setBulk("");
    toast.success(`${parsed.length} item(s) adicionado(s)`);
  };

  const save = async (markReceived = false) => {
    if (!store) return;
    const validItems = items.filter((i) => i.product_name.trim() && i.quantity > 0);
    if (validItems.length === 0) { toast.error("Adicione ao menos um item"); return; }
    const supplierObj = suppliers.find((s) => s.id === form.supplier_id);
    // Toda compra finalizada já entra no estoque automaticamente.
    const status: Order["status"] = "recebido";
    void markReceived;
    const payload: any = {
      store_id: store.id,
      supplier_id: form.supplier_id || null,
      supplier: supplierObj?.company_name ?? null,
      status,
      total_cost: orderTotal,
      notes: form.notes || null,
      payment_method: form.payment_method || null,
      expected_delivery_at: form.expected_delivery_at || null,
      received_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    };
    const { data: ord, error } = await supabase.from("purchase_orders").insert(payload).select("id").single();
    if (error || !ord) { toast.error(error?.message ?? "Erro ao salvar"); return; }

    toast.info("Registrando entrada de mercadorias…");

    // Sincroniza com o estoque geral: vincula ao produto existente ou cria novo.
    const syncedItems: Item[] = [];
    let created = 0;
    let updated = 0;
    let totalUnits = 0;
    for (const it of validItems) {
      const name = it.product_name.trim();
      let productId = it.product_id || null;
      if (!productId) {
        const { data: found } = await supabase
          .from("products")
          .select("id, stock_current")
          .eq("store_id", store.id)
          .ilike("name", name)
          .limit(1)
          .maybeSingle();
        if (found) {
          productId = found.id;
          await supabase
            .from("products")
            .update({
              stock_current: Number(found.stock_current ?? 0) + Number(it.quantity),
              cost_price: Number(it.unit_cost) || undefined,
            })
            .eq("id", productId);
          updated++;
        } else {
          const { data: np, error: ep } = await supabase
            .from("products")
            .insert({
              store_id: store.id,
              name,
              category: "acessorio",
              condition: "novo",
              status: "ativo",
              cost_price: Number(it.unit_cost) || 0,
              sale_price: Number(it.unit_cost) || 0,
              stock_current: Number(it.quantity),
              stock_min: 0,
            })
            .select("id")
            .single();
          if (!ep && np) {
            productId = np.id;
            created++;
          }
        }
      } else {
        const { data: prod } = await supabase
          .from("products")
          .select("stock_current")
          .eq("id", productId)
          .maybeSingle();
        if (prod) {
          await supabase
            .from("products")
            .update({ stock_current: Number(prod.stock_current ?? 0) + Number(it.quantity) })
            .eq("id", productId);
          updated++;
        }
      }
      totalUnits += Number(it.quantity);
      syncedItems.push({ ...it, product_id: productId });
    }

    const itemsPayload = syncedItems.map((it) => ({
      order_id: ord.id,
      product_id: it.product_id || null,
      product_name: it.product_name.trim(),
      quantity: Number(it.quantity),
      unit_cost: Number(it.unit_cost),
      total: Number(it.quantity) * Number(it.unit_cost),
      notes: it.notes || null,
    }));
    const { error: e2 } = await supabase.from("purchase_order_items").insert(itemsPayload);
    if (e2) { toast.error(e2.message); return; }

    toast.success(`Entrada de mercadorias concluída · ${totalUnits} un. no estoque`);
    if (created > 0) toast.message(`${created} produto(s) novo(s) cadastrado(s) no estoque`);
    if (updated > 0) toast.message(`${updated} produto(s) tiveram saldo atualizado`);
    setOpen(false);
    load();
  };

  const updateStockOnReceive = async (_orderId: string, its: Item[]) => {
    for (const it of its) {
      if (!it.product_id) continue;
      const { data: prod } = await supabase.from("products").select("stock_current").eq("id", it.product_id).maybeSingle();
      if (!prod) continue;
      await supabase.from("products").update({ stock_current: Number(prod.stock_current ?? 0) + Number(it.quantity) }).eq("id", it.product_id);
    }
  };

  const markAsReceived = async (o: Order) => {
    const { data: its } = await supabase.from("purchase_order_items").select("*").eq("order_id", o.id);
    await supabase.from("purchase_orders").update({ status: "recebido", received_at: new Date().toISOString() }).eq("id", o.id);
    if (its) {
      toast.info("Sincronizando entrada de mercadorias com o estoque…");
      await updateStockOnReceive(o.id, its as any);
    }
    toast.success("Compra recebida e estoque atualizado");
    load();
  };

  const remove = async () => {
    if (!delTarget) return;
    await supabase.from("purchase_order_items").delete().eq("order_id", delTarget.id);
    const { error } = await supabase.from("purchase_orders").delete().eq("id", delTarget.id);
    setDelTarget(null);
    if (error) return toast.error(error.message);
    toast.success("Compra removida");
    load();
  };

  const can = canManageProducts(role);

  return (
    <div>
      <PageHeader
        title="Compras"
        actions={can && (
          <Button onClick={startNew} className="bg-gradient-primary shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> Nova compra
          </Button>
        )}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Pedidos</div><div className="text-xl font-semibold mt-1">{totals.count}</div></Card>
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Valor comprado</div><div className="text-xl font-semibold mt-1">{brl(totals.purchased)}</div></Card>
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Fornecedores ativos</div><div className="text-xl font-semibold mt-1">{totals.activeSuppliers}</div></Card>
        <Card className="p-3 bg-card border-border">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Últimas compras</div>
          <div className="mt-1 text-[12px] text-muted-foreground space-y-0.5">
            {totals.lastOrders.length === 0 ? <div>—</div> : totals.lastOrders.slice(0, 3).map((o) => (
              <div key={o.id} className="truncate">{new Date(o.created_at).toLocaleDateString("pt-BR")} · {o.supplier ?? "Sem fornecedor"} · {brl(Number(o.total_cost ?? 0))}</div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar compras…" className="pl-9 h-10 bg-card border-border" />
        </div>
        <Select value={fSupplier} onValueChange={setFSupplier}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os fornecedores</SelectItem>
            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="md:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {(Object.keys(STATUS_LABEL) as Order["status"][]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fPeriod} onValueChange={setFPeriod}>
          <SelectTrigger className="md:w-36"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">3 meses</SelectItem>
            <SelectItem value="180">6 meses</SelectItem>
            <SelectItem value="365">12 meses</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-left px-4 py-3 font-medium">Fornecedor</th>
                <th className="text-left px-4 py-3 font-medium">Pagamento</th>
                <th className="text-left px-4 py-3 font-medium">Previsão</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center">
                  <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhuma compra encontrada.</p>
                  {can && <Button onClick={startNew} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" /> Registrar primeira compra</Button>}
                </td></tr>
              ) : filtered.map((o) => (
                <tr key={o.id} className="hover:bg-surface-elevated/40 transition-colors">
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3"><div className="font-medium">{o.supplier ?? "—"}</div></td>
                  <td className="px-4 py-3 text-[12px]">{o.payment_method ?? "—"}</td>
                  <td className="px-4 py-3 text-[12px]">{o.expected_delivery_at ? new Date(o.expected_delivery_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3 text-right metric font-semibold">{brl(Number(o.total_cost ?? 0))}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {can && o.status !== "recebido" && o.status !== "cancelado" && (
                        <Button size="sm" variant="ghost" onClick={() => markAsReceived(o)} title="Marcar como recebido">
                          <CheckCircle2 className="h-4 w-4 mr-1 text-success" /> Receber
                        </Button>
                      )}
                      {can && (
                        <Button size="icon" variant="ghost" onClick={() => setDelTarget(o)} className="text-danger hover:text-danger">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova compra</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Fornecedor</Label>
              <Select value={form.supplier_id ?? ""} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Input value={form.payment_method ?? ""} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} placeholder="ex.: PIX, 30/60/90, Boleto" />
            </div>
            <div>
              <Label>Previsão de entrega</Label>
              <Input type="date" value={form.expected_delivery_at ?? ""} onChange={(e) => setForm({ ...form, expected_delivery_at: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "rascunho"} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(STATUS_LABEL) as Order["status"][]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label>Itens</Label>
              <Button size="sm" variant="outline" onClick={() => setItems((a) => [...a, { product_name: "", quantity: 1, unit_cost: 0 }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <Input className="col-span-6" placeholder="Produto" value={it.product_name} onChange={(e) => setItems((a) => a.map((x, i) => i === idx ? { ...x, product_name: e.target.value } : x))} />
                  <Input className="col-span-2" type="number" min={1} placeholder="Qtd" value={it.quantity} onChange={(e) => setItems((a) => a.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
                  <Input className="col-span-3" type="number" step="0.01" placeholder="Custo unit." value={it.unit_cost} onChange={(e) => setItems((a) => a.map((x, i) => i === idx ? { ...x, unit_cost: Number(e.target.value) } : x))} />
                  <Button size="icon" variant="ghost" className="col-span-1 text-danger" onClick={() => setItems((a) => a.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>

            <div className="mt-3 border border-dashed border-border rounded-md p-3">
              <Label className="text-[12px] text-muted-foreground">Adicionar em lote (uma linha por item: nome;qtd;custo)</Label>
              <Textarea rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Cabo USB-C;10;15,90\nPelícula iPhone 15;25;3,50"} />
              <Button size="sm" variant="outline" className="mt-2" onClick={applyBulk}><Package className="h-3 w-3 mr-1" /> Adicionar lote</Button>
            </div>

            <div className="mt-3 text-right text-sm">Total: <span className="font-semibold metric">{brl(orderTotal)}</span></div>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[12px] text-muted-foreground bg-success/5 border border-success/20 rounded-md p-2">
            <PackagePlus className="h-4 w-4 text-success mt-0.5 shrink-0" />
            <span>Ao salvar, as quantidades entram automaticamente no estoque geral da loja. Itens novos são cadastrados; itens existentes têm o saldo somado.</span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save(true)} className="bg-gradient-primary">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Salvar compra e dar entrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover compra?</AlertDialogTitle>
            <AlertDialogDescription>Os itens associados também serão removidos. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-danger hover:bg-danger/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}