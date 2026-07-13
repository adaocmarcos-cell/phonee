import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canManageProducts } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, RefreshCw, ShoppingCart, FileDown } from "lucide-react";
import { brl, num } from "@/lib/format";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type PartLite = { id: string; name: string; sku: string | null; brand: string | null; stock_current: number; cost_price: number; category: string };
type Purchase = {
  id: string;
  created_at: string;
  item_name: string;
  part_id: string | null;
  qty_change: number;
  prev_stock: number;
  new_stock: number;
  justification: string | null;
};

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PartsPurchaseCenter() {
  const { store, role, user } = useAuth() as any;
  const canManage = canManageProducts(role as any);

  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return toInputDate(d);
  });
  const [to, setTo] = useState(toInputDate(new Date()));
  const [parts, setParts] = useState<PartLite[]>([]);
  const [rows, setRows] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [open, setOpen] = useState(false);
  const [partId, setPartId] = useState<string>("");
  const [qty, setQty] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [supplier, setSupplier] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState<string>(toInputDate(new Date()));
  const [note, setNote] = useState<string>("");

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const fromIso = new Date(from + "T00:00:00").toISOString();
    const toIso = new Date(to + "T23:59:59").toISOString();
    const [{ data: p }, { data: adj }] = await Promise.all([
      supabase.from("parts_inventory").select("id,name,sku,brand,stock_current,cost_price,category").eq("store_id", store.id).order("name"),
      supabase.from("stock_adjustments")
        .select("id,created_at,item_name,part_id,qty_change,prev_stock,new_stock,justification")
        .eq("store_id", store.id)
        .eq("item_kind", "part")
        .eq("reason", "entrada_manual")
        .ilike("justification", "Compra%")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    setParts((p as any) ?? []);
    setRows((adj as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store, from, to]);

  const totals = useMemo(() => {
    const qtyTotal = rows.reduce((s, r) => s + r.qty_change, 0);
    return { entries: rows.length, qty: qtyTotal };
  }, [rows]);

  const openNew = () => {
    setPartId(""); setQty(0); setUnitCost(0); setSupplier(""); setNote("");
    setPurchaseDate(toInputDate(new Date()));
    setOpen(true);
  };

  const save = async () => {
    if (!store) return;
    if (!partId) { toast.error("Selecione a peça"); return; }
    if (qty < 1) { toast.error("Quantidade inválida"); return; }
    const part = parts.find((p) => p.id === partId);
    if (!part) { toast.error("Peça não encontrada"); return; }
    const prev = Number(part.stock_current || 0);
    const next = prev + qty;
    const { error: e1 } = await supabase.from("parts_inventory")
      .update({ stock_current: next, ...(unitCost > 0 ? { cost_price: unitCost } : {}) })
      .eq("id", part.id);
    if (e1) { toast.error(e1.message); return; }
    const justification = `Compra de peças${supplier ? ` — ${supplier}` : ""}${note ? ` · ${note}` : ""} · custo unit. ${brl(unitCost)} · data ${new Date(purchaseDate).toLocaleDateString("pt-BR")}`;
    const { error: e2 } = await supabase.from("stock_adjustments").insert({
      store_id: store.id,
      item_kind: "part",
      part_id: part.id,
      item_name: part.name,
      qty_change: qty,
      prev_stock: prev,
      new_stock: next,
      reason: "entrada_manual",
      justification,
      user_id: user?.id ?? null,
    });
    if (e2) { toast.error(e2.message); return; }
    toast.success("Compra registrada e estoque sincronizado");
    setOpen(false);
    load();
  };

  const sync = async () => {
    setSyncing(true);
    await load();
    setSyncing(false);
    toast.success("Estoque sincronizado");
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Centro de Compras de Peças — ${store?.name ?? ""}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Período: ${new Date(from).toLocaleDateString("pt-BR")} → ${new Date(to).toLocaleDateString("pt-BR")}`, 14, 22);
    autoTable(doc, {
      startY: 28, styles: { fontSize: 8 },
      head: [["Data", "Peça", "Qtd", "Estoque", "Detalhes"]],
      body: rows.map((r) => [
        new Date(r.created_at).toLocaleString("pt-BR"),
        r.item_name,
        String(r.qty_change),
        `${r.prev_stock} → ${r.new_stock}`,
        r.justification ?? "—",
      ]),
    });
    doc.save(`compras-pecas-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-col md:flex-row gap-2 md:items-end">
        <div>
          <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[160px] mt-1" />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[160px] mt-1" />
        </div>
        <div className="flex-1" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={sync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />Sincronizar estoque
          </Button>
          <Button variant="outline" onClick={exportPdf}>
            <FileDown className="h-4 w-4 mr-1" />PDF
          </Button>
          {canManage && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />Nova compra
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Compras no período</div>
          <div className="metric text-2xl font-semibold mt-1">{num(totals.entries)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Peças adquiridas</div>
          <div className="metric text-2xl font-semibold mt-1">{num(totals.qty)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Estoque total de peças</div>
          <div className="metric text-2xl font-semibold mt-1">{num(parts.reduce((s, p) => s + (p.stock_current || 0), 0))}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Histórico de compras de peças</h3>
          <span className="text-[11px] text-muted-foreground font-mono">sincronizado com estoque</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Peça</th>
                <th className="p-3 text-right">Qtd</th>
                <th className="p-3 text-right">Estoque (antes → depois)</th>
                <th className="p-3">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhuma compra registrada no período.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 whitespace-nowrap text-xs font-mono text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3 font-medium">{r.item_name}</td>
                  <td className="p-3 text-right font-semibold">+{r.qty_change}</td>
                  <td className="p-3 text-right font-mono text-xs">{r.prev_stock} → {r.new_stock}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-[420px] truncate" title={r.justification ?? ""}>{r.justification ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar nova compra de peça</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Peça *</Label>
              <Select value={partId} onValueChange={setPartId}>
                <SelectTrigger><SelectValue placeholder="Selecione a peça" /></SelectTrigger>
                <SelectContent>
                  {parts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.sku ? ` · ${p.sku}` : ""} — estoque: {p.stock_current}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade *</Label>
                <NumberInput allowDecimal={false} min={0} emptyBehavior="zero" value={qty} onValueChange={setQty} />
              </div>
              <div>
                <Label>Custo unitário (R$)</Label>
                <NumberInput value={unitCost} onValueChange={setUnitCost} />
              </div>
              <div>
                <Label>Data da compra *</Label>
                <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar e somar ao estoque</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}