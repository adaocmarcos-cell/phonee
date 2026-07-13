import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
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
    // Venda atômica: cabeçalho + item + pagamento + baixa de estoque
    // acontecem numa única transação no banco (RPC create_sale).
    const headInstallments = method === "crediario" ? installments : 1;
    const discountNumber = Number(discount) || 0;
    const { error } = await (supabase as any).rpc("create_sale", {
      _store_id: store.id,
      _customer_id: null,
      _customer_name: customer || null,
      _customer_doc: null,
      _customer_whatsapp: whatsapp || null,
      _payment_method: method,
      _installments: headInstallments,
      _discount: discountNumber,
      _notes: notes || null,
      _items: [{
        product_id: product.id,
        is_service: false,
        quantity: 1,
        unit_price: Number(price) || 0,
        name: product.name,
        discount_amount: Number(discount) || 0,
      }],
      _payments: [{
        method,
        amount: received,
        installments: headInstallments,
      }],
    });
    if (error) {
      setBusy(false);
      const raw = error.message || "";
      if (/estoque insuficiente/i.test(raw)) {
        return toast.error("Estoque insuficiente para este produto. Recarregue a lista.");
      }
      if (/soma dos pagamentos/i.test(raw)) {
        try {
          await (supabase as any).from("audit_log").insert({
            user_id: user.id,
            store_id: store.id,
            action: "checksum_falha",
            entity: "sale",
            module: "vendas",
            screen: "venda_rapida",
            status: "erro",
            details: {
              origem: "VendaRapidaModal",
              subtotal_bruto: Number(price) || 0,
              desconto_total: discountNumber,
              frete: 0,
              outras_despesas: 0,
              total_esperado: (Number(price) || 0) - discountNumber,
              soma_pagamentos: received,
              divergencia: +(received - ((Number(price) || 0) - discountNumber)).toFixed(2),
              produto: { id: product.id, name: product.name },
              db_error: raw,
            },
          });
        } catch {/* silencia */}
        return toast.error("Valor recebido não fecha com o total da venda.");
      }
      if (/sem acesso a esta loja/i.test(raw)) {
        return toast.error("Você não tem permissão para registrar vendas nesta loja.");
      }
      return toast.error(raw || "Erro ao registrar venda");
    }

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
              <NumberInput value={price} onValueChange={setPrice} />
            </Field>
            <Field label="Desconto (R$)">
              <NumberInput value={discount} onValueChange={setDiscount} />
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
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal bruto:</span><span className="metric">{brl(Number(price))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Descontos:</span><span className="metric text-muted-foreground">− {brl(Number(discount))}</span></div>
            <div className="border-t border-border my-1" />
            <div className="flex justify-between text-base"><span className="font-medium">Total esperado:</span><span className="metric font-semibold">{brl(received)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Valor recebido:</span><span className="metric">{brl(received)}</span></div>
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