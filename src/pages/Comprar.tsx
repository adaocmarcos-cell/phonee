import { useEffect, useMemo, useState, FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Lock, ShieldCheck, ArrowLeft, Gift, Ticket, Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import logoAsset from "@/assets/mobileplus-logo.png.asset.json";

const Schema = z.object({
  customer_name: z.string().trim().min(2, "Informe seu nome").max(120),
  customer_email: z.string().trim().email("E-mail inválido").max(255),
  customer_phone: z.string().trim().min(10, "Informe um WhatsApp válido").max(20),
  customer_doc: z.string().trim().min(11, "Informe CPF ou CNPJ").max(20),
});

type Plan = {
  id: string; code: "annual" | "lifetime"; name: string;
  description: string | null; price_cents: number; max_installments: number;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Comprar() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialCode = (params.get("plano") === "lifetime" ? "lifetime" : "annual") as "annual" | "lifetime";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedCode, setSelectedCode] = useState<"annual" | "lifetime">(initialCode);
  const [method, setMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [installments, setInstallments] = useState(1);
  const [form, setForm] = useState({ customer_name: "", customer_email: "", customer_phone: "", customer_doc: "" });
  const [busy, setBusy] = useState(false);

  const [refCode, setRefCode] = useState<string>("");
  const [coupon, setCoupon] = useState("");
  const [couponInfo, setCouponInfo] = useState<{ valid: boolean; discount_cents: number; message?: string } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  useEffect(() => {
    const r = params.get("ref");
    if (r) {
      setRefCode(r.toUpperCase());
      try { localStorage.setItem("phonee_ref", r.toUpperCase()); } catch {}
    } else {
      try {
        const stored = localStorage.getItem("phonee_ref");
        if (stored) setRefCode(stored);
      } catch {}
    }
    const c = params.get("cupom") || params.get("coupon");
    if (c) setCoupon(c.toUpperCase());
  }, [params]);

  useEffect(() => {
    supabase.from("plans").select("id,code,name,description,price_cents,max_installments").eq("active", true)
      .then(({ data }) => setPlans((data ?? []) as Plan[]));
  }, []);

  const selected = useMemo(() => plans.find((p) => p.code === selectedCode), [plans, selectedCode]);
  const maxInst = selected?.max_installments ?? 1;

  const finalCents = useMemo(() => {
    const base = selected?.price_cents ?? 0;
    if (couponInfo?.valid) return Math.max(base - couponInfo.discount_cents, 0);
    return base;
  }, [selected, couponInfo]);

  const validateCoupon = async () => {
    if (!coupon.trim() || !selected) return;
    setValidatingCoupon(true);
    const { data, error } = await supabase.rpc("apply_coupon", {
      _code: coupon.trim().toUpperCase(),
      _amount_cents: selected.price_cents,
    });
    setValidatingCoupon(false);
    if (error) { toast.error(error.message); return; }
    const res = data as any;
    setCouponInfo(res);
    if (res?.valid) toast.success(`Cupom aplicado: -${formatBRL(res.discount_cents)}`);
    else toast.error(res?.message ?? "Cupom inválido");
  };

  useEffect(() => { setCouponInfo(null); }, [selectedCode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = Schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!selected) return toast.error("Selecione um plano");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("asaas-create-charge", {
      body: {
        ...parsed.data,
        plan_code: selected.code,
        payment_method: method,
        installments: method === "CREDIT_CARD" ? installments : 1,
        ref_code: refCode || undefined,
        coupon_code: couponInfo?.valid ? coupon.trim().toUpperCase() : undefined,
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message ?? "Falha ao processar pagamento");
    if ((data as any)?.error) return toast.error(typeof (data as any).error === "string" ? (data as any).error : "Erro ao processar");
    try { localStorage.removeItem("phonee_ref"); } catch {}
    toast.success("Cobrança criada!");
    navigate(`/comprar/sucesso/${(data as any).subscription_id}`);
  };

  return (
    <div className="min-h-screen bg-[hsl(226_50%_15%)] text-white">
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
          <div className="bg-white rounded-xl px-4 py-1.5"><img src={logoAsset.url} alt="Phonee" className="h-8 w-auto" /></div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 py-10 grid lg:grid-cols-[1fr_1.1fr] gap-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">Garanta seu acesso ao <span className="text-primary">Phonee</span></h1>
          <p className="mt-3 text-white/80">Pagamento seguro via Asaas. Acesso liberado automaticamente após a confirmação.</p>

          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            {plans.map((p) => {
              const active = selectedCode === p.code;
              return (
                <button key={p.id} type="button" onClick={() => setSelectedCode(p.code)}
                  className={`text-left rounded-xl border-2 p-4 transition ${active ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono tracking-widest text-white/70 uppercase">{p.code === "annual" ? "Anual" : "Vitalício"}</span>
                    {p.code === "lifetime" && <Badge className="bg-primary/20 text-primary border-primary/40">Recomendado</Badge>}
                  </div>
                  <div className="mt-2 text-2xl font-extrabold">{formatBRL(p.price_cents)}</div>
                  <div className="text-xs text-white/70 mt-1">{p.code === "annual" ? "por 12 meses" : "pague uma vez · até 12x"}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-2 text-sm text-success">
            <ShieldCheck className="h-4 w-4" /> Garantia de 7 dias — 100% do valor de volta
          </div>
        </div>

        <Card className="p-6 md:p-8 bg-[hsl(224_25%_18%)] border-2 border-primary/30 text-white">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="bg-white/5 border-white/20 text-white" />
            </div>
            <div className="space-y-2">
              <Label>CPF ou CNPJ</Label>
              <Input value={form.customer_doc} onChange={(e) => setForm({ ...form, customer_doc: e.target.value })} className="bg-white/5 border-white/20 text-white" placeholder="Somente números" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} className="bg-white/5 border-white/20 text-white" />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className="bg-white/5 border-white/20 text-white" placeholder="DDD + número" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <RadioGroup value={method} onValueChange={(v) => setMethod(v as any)} className="grid grid-cols-2 gap-2">
                <label className={`flex items-center gap-2 rounded-lg border-2 p-3 cursor-pointer ${method === "PIX" ? "border-primary bg-primary/10" : "border-white/15"}`}>
                  <RadioGroupItem value="PIX" /> PIX
                </label>
                <label className={`flex items-center gap-2 rounded-lg border-2 p-3 cursor-pointer ${method === "CREDIT_CARD" ? "border-primary bg-primary/10" : "border-white/15"}`}>
                  <RadioGroupItem value="CREDIT_CARD" /> Cartão de crédito
                </label>
              </RadioGroup>
            </div>

            {method === "CREDIT_CARD" && (
              <div className="space-y-2">
                <Label>Parcelamento</Label>
                <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}
                  className="w-full rounded-md bg-white/5 border border-white/20 px-3 py-2">
                  {Array.from({ length: maxInst }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n} className="text-black">{n}x de {selected ? formatBRL(finalCents / n) : "—"}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Ticket className="h-3.5 w-3.5" /> Cupom de desconto (opcional)</Label>
              <div className="flex gap-2">
                <Input value={coupon}
                  onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponInfo(null); }}
                  placeholder="Ex: BEMVINDO10"
                  className="bg-white/5 border-white/20 text-white font-mono tracking-wider" />
                <Button type="button" variant="outline" onClick={validateCoupon}
                  disabled={!coupon.trim() || validatingCoupon}
                  className="bg-white/5 border-white/20 text-white hover:bg-white/10">
                  {couponInfo?.valid ? <Check className="h-4 w-4" /> : "Aplicar"}
                </Button>
              </div>
              {couponInfo?.valid && (
                <div className="text-xs text-success flex items-center gap-1"><Check className="h-3 w-3" /> Desconto de {formatBRL(couponInfo.discount_cents)} aplicado.</div>
              )}
            </div>

            {refCode && (
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex items-center gap-2 text-xs">
                <Gift className="h-4 w-4 text-primary" />
                <span>Você foi indicado pelo código <b className="font-mono">{refCode}</b>.</span>
              </div>
            )}

            <div className="rounded-lg bg-white/5 p-4 flex justify-between items-baseline">
              <span className="text-white/70 text-sm">Total</span>
              <div className="text-right">
                {couponInfo?.valid && selected && (
                  <div className="text-xs text-white/50 line-through">{formatBRL(selected.price_cents)}</div>
                )}
                <span className="text-2xl font-extrabold text-primary">{selected ? formatBRL(finalCents) : "—"}</span>
              </div>
            </div>

            <Button type="submit" disabled={busy} size="lg" className="w-full bg-gradient-primary shadow-glow h-12 text-base">
              {busy ? "Processando…" : "Pagar agora"}
            </Button>
            <div className="flex items-center justify-center gap-2 text-xs text-white/60"><Lock className="h-3 w-3" /> Pagamento processado pelo Asaas</div>
          </form>
        </Card>
      </div>
    </div>
  );
}