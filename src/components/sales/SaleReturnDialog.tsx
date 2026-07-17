import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/NumberInput";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { RotateCcw, PackageCheck, AlertTriangle, Copy } from "lucide-react";

type SaleItemRow = {
  id: string; product_id: string | null; name: string | null; description: string | null;
  quantity: number; unit_price: number; total: number; is_service: boolean | null;
  discount_amount: number | null; sku: string | null;
};

type PriorMap = Record<string, number>;

type Selection = {
  sale_item_id: string;
  quantity: number;
  restock: boolean;
  defect_note: string;
  selected: boolean;
};

const REFUND_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "cartao_estorno", label: "Estorno cartão" },
  { value: "vale_troca", label: "Gerar vale-troca" },
  { value: "troca_imediata", label: "Troca imediata (sem estorno)" },
];

export function SaleReturnDialog({
  open, onOpenChange, sale, onDone,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  sale: any | null; onDone?: () => void;
}) {
  const [items, setItems] = useState<SaleItemRow[]>([]);
  const [prior, setPrior] = useState<PriorMap>({});
  const [sel, setSel] = useState<Record<string, Selection>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState<string>("vale_troca");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code?: string | null; total: number } | null>(null);

  useEffect(() => {
    if (!open || !sale) return;
    setResult(null); setReason(""); setNotes(""); setRefundMethod("vale_troca");
    (async () => {
      const { data: its } = await supabase.from("sale_items")
        .select("id, product_id, name, description, quantity, unit_price, total, is_service, discount_amount, sku")
        .eq("sale_id", sale.id).order("created_at" as any, { ascending: true } as any);
      const rows = (its as SaleItemRow[]) ?? [];
      setItems(rows);
      const s: Record<string, Selection> = {};
      rows.forEach((r) => {
        s[r.id] = { sale_item_id: r.id, quantity: r.quantity, restock: !r.is_service, defect_note: "", selected: false };
      });
      setSel(s);
      const { data: sr } = await (supabase as any)
        .from("sale_return_items").select("sale_item_id, quantity").in("sale_item_id", rows.map((r) => r.id));
      const map: PriorMap = {};
      (sr as any[] ?? []).forEach((r) => { map[r.sale_item_id] = (map[r.sale_item_id] || 0) + Number(r.quantity || 0); });
      setPrior(map);
    })();
  }, [open, sale?.id]);

  const rowsSelected = useMemo(() => Object.values(sel).filter((x) => x.selected && x.quantity > 0), [sel]);
  const total = useMemo(() => rowsSelected.reduce((acc, r) => {
    const it = items.find((x) => x.id === r.sale_item_id);
    if (!it) return acc;
    const unit = it.quantity > 0 ? Number(it.total) / it.quantity : 0;
    return acc + unit * r.quantity;
  }, 0), [rowsSelected, items]);

  const submit = async () => {
    if (!sale) return;
    if (rowsSelected.length === 0) return toast.error("Selecione ao menos um item para devolver.");
    setBusy(true);
    const payload = rowsSelected.map((r) => {
      const it = items.find((x) => x.id === r.sale_item_id)!;
      const unit = it.quantity > 0 ? Number(it.total) / it.quantity : 0;
      return {
        sale_item_id: r.sale_item_id,
        quantity: r.quantity,
        unit_value: unit,
        restock: r.restock,
        defect_note: r.defect_note || null,
      };
    });
    const { data, error } = await (supabase as any).rpc("create_sale_return", {
      _sale_id: sale.id, _reason: reason || null, _notes: notes || null,
      _refund_method: refundMethod, _items: payload,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data as any;
    setResult({ code: r?.store_credit_code, total: Number(r?.total_returned || 0) });
    toast.success(`Devolução registrada: ${brl(Number(r?.total_returned || 0))}`);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-warning" />
            Devolver/Trocar itens — Venda #{sale?.sale_number ?? "—"}
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="text-sm">Devolução registrada com sucesso.</div>
              <div className="text-xs text-muted-foreground mt-1">Total devolvido: <b>{brl(result.total)}</b></div>
              {result.code && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="text-xs">Código do vale-troca gerado:</div>
                  <code className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-800 font-mono">{result.code}</code>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(result.code!); toast.success("Código copiado"); }}>
                    <Copy className="h-3 w-3 mr-1" />Copiar
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 w-8"></th>
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-right">Vendido</th>
                    <th className="p-2 text-right">Já devolvido</th>
                    <th className="p-2 text-right">Devolver</th>
                    <th className="p-2 text-center">Volta ao estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const s = sel[it.id]; if (!s) return null;
                    const priorQty = prior[it.id] || 0;
                    const maxQty = Math.max(0, it.quantity - priorQty);
                    return (
                      <tr key={it.id} className="border-t border-border align-top">
                        <td className="p-2">
                          <Checkbox
                            checked={s.selected}
                            disabled={maxQty === 0}
                            onCheckedChange={(c) => setSel((prev) => ({ ...prev, [it.id]: { ...prev[it.id], selected: Boolean(c) } }))}
                          />
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{it.name || it.description}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {it.sku && <span>SKU {it.sku} · </span>}
                            Unit {brl(it.quantity > 0 ? Number(it.total) / it.quantity : 0)}
                            {it.is_service && <span className="ml-1 text-warning">· Serviço (não retorna ao estoque)</span>}
                          </div>
                          {s.selected && (
                            <Input
                              className="mt-2 h-8 text-xs"
                              placeholder="Motivo/defeito específico do item (opcional)"
                              value={s.defect_note}
                              onChange={(e) => setSel((prev) => ({ ...prev, [it.id]: { ...prev[it.id], defect_note: e.target.value } }))}
                            />
                          )}
                          {s.selected && !s.restock && !it.is_service && (
                            <div className="mt-1 text-[11px] text-warning flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Item marcado com defeito — não voltará ao estoque.
                              Registre uma OS de garantia manualmente após a devolução.
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono">{it.quantity}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{priorQty}</td>
                        <td className="p-2 text-right">
                          <NumberInput
                            allowDecimal={false} min={0}
                            value={s.quantity}
                            disabled={!s.selected || maxQty === 0}
                            onValueChange={(n) => setSel((prev) => ({ ...prev, [it.id]: { ...prev[it.id], quantity: Math.min(n, maxQty) } }))}
                          />
                          <div className="text-[10px] text-muted-foreground">máx {maxQty}</div>
                        </td>
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={s.restock}
                            disabled={!s.selected || it.is_service}
                            onCheckedChange={(c) => setSel((prev) => ({ ...prev, [it.id]: { ...prev[it.id], restock: Boolean(c) } }))}
                          />
                          <div className="text-[10px] text-muted-foreground">{it.is_service ? "—" : "Bom estado"}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Motivo da devolução</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Arrependimento, defeito, troca por outro modelo…" />
              </div>
              <div>
                <Label className="text-xs">Forma de estorno</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REFUND_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Observações internas</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <div className="text-xs text-muted-foreground">Total a estornar</div>
              <div className="text-lg font-semibold">{brl(total)}</div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={busy || rowsSelected.length === 0}>
                <PackageCheck className="h-4 w-4 mr-2" /> Confirmar devolução
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}