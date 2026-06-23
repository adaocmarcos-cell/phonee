import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { brl } from "@/lib/format";
import { toast } from "sonner";

type Part = {
  id: string;
  name: string;
  sale_price: number;
  stock_current: number;
};

type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito" | "crediario" | "boleto";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "crediario", label: "Parcelado" },
  { value: "boleto", label: "Boleto" },
];

interface Props {
  part: Part | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function VendaPecaModal({ part, open, onClose, onDone }: Props) {
  const { store, user } = useAuth();
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [installments, setInstallments] = useState(1);
  const [customer, setCustomer] = useState("");
  const [saving, setSaving] = useState(false);

  // initialize on open
  if (part && open && unitPrice === 0 && !saving) {
    setUnitPrice(Number(part.sale_price) || 0);
  }

  const reset = () => {
    setQty(1); setUnitPrice(0); setDiscount(0); setPayment("pix");
    setInstallments(1); setCustomer("");
  };

  const total = Math.max(0, qty * unitPrice - discount);

  const confirm = async () => {
    if (!part || !store) return;
    if (qty < 1 || qty > part.stock_current) { toast.error("Quantidade inválida"); return; }
    setSaving(true);
    const { error: e1 } = await supabase.from("parts_sales").insert({
      store_id: store.id,
      part_id: part.id,
      seller_id: user?.id ?? null,
      qty,
      unit_price: unitPrice,
      discount,
      total,
      payment_method: payment,
      installments: payment === "crediario" ? installments : null,
      customer_name: customer || null,
    });
    if (e1) { setSaving(false); toast.error(e1.message); return; }
    const { error: e2 } = await supabase
      .from("parts_inventory")
      .update({ stock_current: part.stock_current - qty })
      .eq("id", part.id);
    if (e2) { setSaving(false); toast.error(e2.message); return; }
    toast.success("Venda registrada");
    setSaving(false);
    reset();
    onDone();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Venda rápida de peça</DialogTitle>
        </DialogHeader>
        {part && (
          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-medium">{part.name}</div>
              <div className="text-muted-foreground">Em estoque: {part.stock_current}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Qtd</Label>
                <Input type="number" min={1} max={part.stock_current}
                  value={qty} onChange={(e) => setQty(Number(e.target.value))} />
              </div>
              <div>
                <Label>Preço unit.</Label>
                <Input type="number" step="0.01" value={unitPrice}
                  onChange={(e) => setUnitPrice(Number(e.target.value))} />
              </div>
              <div>
                <Label>Desconto (R$)</Label>
                <Input type="number" step="0.01" value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))} />
              </div>
              <div>
                <Label>Total</Label>
                <div className="h-10 px-3 flex items-center rounded-md bg-primary/10 text-primary font-semibold">
                  {brl(total)}
                </div>
              </div>
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {PAYMENT_OPTIONS.map((p) => (
                  <Button key={p.value} type="button" size="sm"
                    variant={payment === p.value ? "default" : "outline"}
                    onClick={() => setPayment(p.value)}>{p.label}</Button>
                ))}
              </div>
            </div>
            {payment === "crediario" && (
              <div>
                <Label>Parcelas</Label>
                <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x de {brl(total / n)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Cliente (opcional)</Label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nome do cliente" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button onClick={confirm} disabled={saving || !part}>Confirmar venda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}