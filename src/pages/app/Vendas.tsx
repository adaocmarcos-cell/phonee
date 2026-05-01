import { useEffect, useMemo, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canRegisterSale } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { brl } from "@/lib/format";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

type LineItem = { product_id: string; name: string; quantity: number; unit_price: number };

export default function Vendas() {
  const { store, role, user } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [items, setItems] = useState<LineItem[]>([]);
  const [pickProduct, setPickProduct] = useState("");
  const [customer, setCustomer] = useState("");
  const [doc, setDoc] = useState("");
  const [pay, setPay] = useState("dinheiro");
  const [discount, setDiscount] = useState(0);

  const load = async () => {
    if (!store) return;
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from("sales").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("products").select("id, name, sale_price, stock_current").eq("store_id", store.id).gt("stock_current", 0),
    ]);
    setSales(s ?? []);
    setProducts(p ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unit_price, 0), [items]);
  const total = Math.max(0, subtotal - discount);

  const addItem = () => {
    const p = products.find((x) => x.id === pickProduct);
    if (!p) return;
    setItems((arr) => {
      const existing = arr.find((i) => i.product_id === p.id);
      if (existing) return arr.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...arr, { product_id: p.id, name: p.name, quantity: 1, unit_price: Number(p.sale_price) }];
    });
    setPickProduct("");
  };

  const reset = () => {
    setItems([]); setCustomer(""); setDoc(""); setPay("dinheiro"); setDiscount(0);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!store || !user) return;
    if (items.length === 0) return toast.error("Adicione ao menos um item");
    setBusy(true);
    const { data: sale, error } = await supabase
      .from("sales")
      .insert({
        store_id: store.id, seller_id: user.id,
        customer_name: customer || null, customer_doc: doc || null,
        payment_method: pay as any, discount, subtotal, total,
      })
      .select("id")
      .single();
    if (error || !sale) { setBusy(false); return toast.error(error?.message ?? "Erro"); }

    const { error: e2 } = await supabase.from("sale_items").insert(
      items.map((i) => ({
        sale_id: sale.id, product_id: i.product_id,
        quantity: i.quantity, unit_price: i.unit_price, total: i.quantity * i.unit_price,
      }))
    );
    if (e2) { setBusy(false); return toast.error(e2.message); }

    // Decrement stock + last_sold_at
    for (const i of items) {
      const cur = products.find((p) => p.id === i.product_id);
      if (cur) {
        await supabase
          .from("products")
          .update({ stock_current: Math.max(0, cur.stock_current - i.quantity), last_sold_at: new Date().toISOString() })
          .eq("id", i.product_id);
      }
    }

    setBusy(false);
    setOpen(false);
    reset();
    toast.success("Venda registrada!");
    load();
  };

  return (
    <div>
      <PageHeader
        title="Vendas"
        description="Histórico de vendas e PDV rápido."
        actions={
          canRegisterSale(role) && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary shadow-glow"><Plus className="h-4 w-4 mr-1" />Nova venda</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Registrar venda</DialogTitle></DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">Cliente (opcional)</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">CPF</Label><Input value={doc} onChange={(e) => setDoc(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Adicionar produto</Label>
                    <div className="flex gap-2">
                      <Select value={pickProduct} onValueChange={setPickProduct}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione um produto…" /></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name} · {brl(Number(p.sale_price))} · est. {p.stock_current}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" onClick={addItem} disabled={!pickProduct}>Adicionar</Button>
                    </div>
                  </div>
                  <div className="border border-border rounded-md divide-y divide-border max-h-56 overflow-auto">
                    {items.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted-foreground">Nenhum item ainda</div>
                    ) : items.map((i) => (
                      <div key={i.product_id} className="flex items-center gap-2 p-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{i.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{brl(i.unit_price)} × {i.quantity}</div>
                        </div>
                        <Input type="number" min={1} value={i.quantity}
                          onChange={(e) => setItems((arr) => arr.map((x) => x.product_id === i.product_id ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x))}
                          className="w-16 h-8" />
                        <div className="metric w-20 text-right text-sm font-semibold">{brl(i.quantity * i.unit_price)}</div>
                        <Button type="button" size="icon" variant="ghost" onClick={() => setItems((arr) => arr.filter((x) => x.product_id !== i.product_id))}>
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Pagamento</Label>
                      <Select value={pay} onValueChange={setPay}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="debito">Débito</SelectItem>
                          <SelectItem value="credito">Crédito</SelectItem>
                          <SelectItem value="crediario">Crediário</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label className="text-xs">Desconto (R$)</Label><Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Total</Label>
                      <div className="metric h-10 px-3 flex items-center rounded-md bg-primary/10 text-primary font-bold">{brl(total)}</div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={busy} className="bg-gradient-primary shadow-glow">{busy ? "Registrando…" : "Confirmar venda"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <Card className="bg-card border-border shadow-card overflow-hidden">
        {sales.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Pagamento</th>
                <th className="text-right px-4 py-3 font-medium">Desconto</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-surface-elevated/40">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3">{s.customer_name || <span className="text-muted-foreground">Avulso</span>}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="capitalize text-xs">{s.payment_method}</Badge></td>
                  <td className="px-4 py-3 text-right metric text-muted-foreground">{brl(Number(s.discount))}</td>
                  <td className="px-4 py-3 text-right metric font-semibold">{brl(Number(s.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}