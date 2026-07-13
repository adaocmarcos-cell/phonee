import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canManageProducts } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList, Pencil, Trash2, Save, X } from "lucide-react";
import { brl } from "@/lib/format";
import { NumberInput } from "@/components/NumberInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LastEditFooter } from "@/components/audit/LastEditFooter";

type PO = {
  id: string; supplier: string; status: string; total_cost: number;
  created_at: string; sent_at: string | null;
};
type POItem = {
  id?: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
  notes?: string | null;
};
const statusBadge: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground border-border",
  enviado: "bg-primary/15 text-primary border-primary/30",
  recebido: "bg-success/15 text-success border-success/30",
  parcial: "bg-warning/15 text-warning border-warning/30",
  cancelado: "bg-danger/15 text-danger border-danger/30",
};

export default function Pedidos() {
  const { store, role } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<any | null>(null);
  const [editItems, setEditItems] = useState<POItem[]>([]);
  const [editSupplier, setEditSupplier] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editExpected, setEditExpected] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const can = canManageProducts(role);
  const isReceived = editOrder?.status === "recebido";
  const editTotal = useMemo(
    () => editItems.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0),
    [editItems],
  );

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, supplier, status, total_cost, created_at, sent_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });
      setRows((data ?? []) as PO[]);
      setLoading(false);
    })();
  }, [store]);

  const reload = async () => {
    if (!store) return;
    const { data } = await supabase
      .from("purchase_orders")
      .select("id, supplier, status, total_cost, created_at, sent_at")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as PO[]);
  };

  const openEdit = async (o: PO) => {
    const { data: full } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("id", o.id)
      .maybeSingle();
    if (!full) return toast.error("Pedido não encontrado.");
    const { data: its } = await supabase
      .from("purchase_order_items")
      .select("id, product_id, product_name, quantity, unit_cost, notes")
      .eq("order_id", o.id);
    setEditOrder(full);
    setEditSupplier((full as any).supplier ?? "");
    setEditNotes((full as any).notes ?? "");
    setEditExpected(((full as any).expected_delivery_at ?? "").slice(0, 10));
    setEditItems(((its ?? []) as any[]).map((r) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: r.product_name,
      quantity: Number(r.quantity || 0),
      unit_cost: Number(r.unit_cost || 0),
      notes: r.notes,
    })));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editOrder) return;
    setSaving(true);
    if (isReceived) {
      // Só campos informativos
      const { error } = await supabase
        .from("purchase_orders")
        .update({ notes: editNotes || null })
        .eq("id", editOrder.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Observações atualizadas.");
    } else {
      // Pedido não recebido: editável livremente
      const validItems = editItems.filter((i) => (i.product_name || "").trim() && Number(i.quantity) > 0);
      if (validItems.length === 0) {
        setSaving(false);
        return toast.error("Adicione ao menos um item ao pedido.");
      }
      const total = validItems.reduce((s, it) => s + it.quantity * it.unit_cost, 0);
      const { error: uErr } = await supabase
        .from("purchase_orders")
        .update({
          supplier: editSupplier || null,
          notes: editNotes || null,
          expected_delivery_at: editExpected ? new Date(`${editExpected}T12:00:00`).toISOString() : null,
          total_cost: total,
        })
        .eq("id", editOrder.id);
      if (uErr) { setSaving(false); return toast.error(uErr.message); }
      await supabase.from("purchase_order_items").delete().eq("order_id", editOrder.id);
      const rows = validItems.map((it) => ({
        order_id: editOrder.id,
        product_id: it.product_id,
        product_name: it.product_name.trim(),
        quantity: it.quantity,
        unit_cost: it.unit_cost,
        total: it.quantity * it.unit_cost,
        notes: it.notes ?? null,
      }));
      const { error: iErr } = await supabase.from("purchase_order_items").insert(rows);
      setSaving(false);
      if (iErr) return toast.error(iErr.message);
      toast.success("Pedido atualizado.");
    }
    setEditOpen(false);
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Pedidos de compra"
        description="Geração assertiva com base em giro de vendas e ponto de pedido."
        actions={
          <Button onClick={() => navigate("/painel/pedidos/novo")} className="bg-gradient-primary shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> Gerar pedido
          </Button>
        }
      />
      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Fornecedor</th>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-16 text-center">
                  <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhum pedido gerado ainda.</p>
                  <Button onClick={() => navigate("/painel/pedidos/novo")} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" /> Gerar primeiro pedido</Button>
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-elevated/40">
                  <td className="px-4 py-3 font-medium">{r.supplier}</td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 text-right metric font-semibold">{brl(Number(r.total_cost))}</td>
                  <td className="px-4 py-3"><Badge className={statusBadge[r.status] ?? ""}>{r.status}</Badge></td>
                  <td className="px-2 py-3 text-right">
                    {can && (
                      <Button size="icon" variant="ghost" title="Editar pedido" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar pedido de compra</DialogTitle>
            <DialogDescription>
              {isReceived
                ? "Este pedido já gerou entrada no estoque — edite o lançamento de entrada correspondente. Aqui você pode apenas atualizar observações."
                : "Ajuste fornecedor, itens, quantidades e custos. Alterações são registradas na auditoria."}
            </DialogDescription>
          </DialogHeader>

          {editOrder?.id && (
            <LastEditFooter entity="purchase_order" entityId={editOrder.id} className="mb-3" />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Fornecedor</Label>
              <Input value={editSupplier} disabled={isReceived} onChange={(e) => setEditSupplier(e.target.value)} />
            </div>
            <div>
              <Label>Previsão de entrega</Label>
              <Input type="date" value={editExpected} disabled={isReceived} onChange={(e) => setEditExpected(e.target.value)} />
            </div>
          </div>

          {!isReceived && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <Label>Itens</Label>
                <Button size="sm" variant="outline" onClick={() => setEditItems((a) => [...a, { product_id: null, product_name: "", quantity: 0, unit_cost: 0 }])}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar item
                </Button>
              </div>
              <div className="space-y-2">
                {editItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <Input className="col-span-6" placeholder="Produto" value={it.product_name} onChange={(e) => setEditItems((a) => a.map((x, i) => i === idx ? { ...x, product_name: e.target.value } : x))} />
                    <NumberInput className="col-span-2 text-right" allowDecimal={false} min={0} emptyBehavior="zero" value={it.quantity} onValueChange={(n) => setEditItems((a) => a.map((x, i) => i === idx ? { ...x, quantity: n } : x))} />
                    <NumberInput className="col-span-3 text-right" min={0} emptyBehavior="zero" value={it.unit_cost} onValueChange={(n) => setEditItems((a) => a.map((x, i) => i === idx ? { ...x, unit_cost: n } : x))} />
                    <Button size="icon" variant="ghost" className="col-span-1 text-danger" onClick={() => setEditItems((a) => a.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right text-sm">
                Total: <span className="font-mono font-semibold">{brl(editTotal)}</span>
              </div>
            </div>
          )}

          <div className="mt-3">
            <Label>Observações</Label>
            <Textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving} className="bg-primary text-primary-foreground">
              <Save className="h-4 w-4 mr-1" /> Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}