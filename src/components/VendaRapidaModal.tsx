import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { brl } from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";

type Product = {
  id: string;
  name: string;
  sale_price: number;
  cost_price: number;
  stock_current: number;
};

type Props = {
  product: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
};

const METHODS: { value: string; label: string }[] = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "crediario", label: "Parcelado" },
];

const INSTALLMENTS = [2, 3, 6, 10, 12, 18];

export function VendaRapidaModal({ product, open, onOpenChange, onDone }: Props) {
  const { store, user } = useAuth();
  const [price, setPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<string>("pix");
  const [installments, setInstallments] = useState(2);
  const [customer, setCustomer] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (product) {
      setPrice(Number(product.sale_price) || 0);
      setDiscount(0);
      setMethod("pix");
      setInstallments(2);
      setCustomer("");
      setWhatsapp("");
      setNotes("");
    }
  }, [product]);

  const received = useMemo(() => Math.max(0, Number(price) - Number(discount)), [price, discount]);
  const cost = Number(product?.cost_price || 0);
  const profit = received - cost;

  const confirm = async () => {
    if (!product || !store || !user) return;
    if (received <= 0) return toast.error("Valor recebido inválido");
    setBusy(true);
    const { data: sale, error } = await supabase.from("sales").insert({
      store_id: store.id,
      seller_id: user.id,
      customer_name: customer || null,
      customer_whatsapp: whatsapp || null,
      payment_method: method as any,
      installments: method === "crediario" ? installments : 1,
      discount: Number(discount) || 0,
      subtotal: Number(price) || 0,
      total: received,
      notes: notes || null,
    }).select("id").single();
    if (error || !sale) { setBusy(false); return toast.error(error?.message ?? "Erro ao registrar venda"); }

    const { error: e2 } = await supabase.from("sale_items").insert({
      sale_id: sale.id,
      product_id: product.id,
      quantity: 1,
      unit_price: received,
      total: received,
    });
    if (e2) { setBusy(false); return toast.error(e2.message); }

    await supabase.from("products").update({
      stock_current: Math.max(0, Number(product.stock_current) - 1),
      last_sold_at: new Date().toISOString(),
    }).eq("id", product.id);

    setBusy(false);
    toast.success(`Venda registrada! Lucro: ${brl(profit)}`);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar venda — {product?.name}</DialogTitle>
          <DialogDescription>Preencha os dados para fechar esta venda.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço de venda (R$)">
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            </Field>
            <Field label="Desconto (R$)">
              <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </Field>
          </div>

          <div className="text-xs text-muted-foreground">
            Valor recebido: <span className="font-semibold text-foreground">{brl(received)}</span>
          </div>

          <div>
            <Label className="text-xs mb-2 block">Forma de pagamento</Label>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition ${
                    method === m.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-surface-elevated"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {method === "crediario" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {INSTALLMENTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setInstallments(n)}
                    className={`px-2.5 py-1 rounded text-xs border ${
                      installments === n ? "bg-primary text-primary-foreground border-primary" : "border-border"
                    }`}
                  >
                    {n}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome do cliente (opcional)">
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nome do cliente" />
            </Field>
            <Field label="WhatsApp (opcional)">
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(31) 9 9999-9999" />
            </Field>
          </div>

          <Field label="Observações (opcional)">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: cliente pediu nota" />
          </Field>

          <div className="rounded-md border border-border bg-surface-elevated/40 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Preço:</span><span className="metric">{brl(Number(price))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Desconto:</span><span className="metric text-muted-foreground">− {brl(Number(discount))}</span></div>
            <div className="border-t border-border my-1" />
            <div className="flex justify-between text-base"><span className="font-medium">Recebido:</span><span className="metric font-semibold">{brl(received)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Lucro:</span><span className={`metric ${profit > 0 ? "text-success" : profit < 0 ? "text-danger" : ""}`}>{brl(profit)}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={confirm} disabled={busy} className="bg-primary text-primary-foreground shadow-glow">
            {busy ? "Salvando…" : "Confirmar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}