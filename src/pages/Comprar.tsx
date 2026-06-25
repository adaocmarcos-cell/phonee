import { useEffect, useMemo, useState, FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Lock, ShieldCheck, ArrowLeft, Gift, Ticket, Check, Flame, Crown, Infinity as InfinityIcon, AlertTriangle, Rocket, Hourglass, Users, Wallet, PiggyBank, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import logoAsset from "@/assets/phonee-logo-white.png.asset.json";
import { trackPageVisit } from "@/lib/trackVisit";

const Schema = z.object({
  customer_name: z.string().trim().min(2, "Informe seu nome").max(120),
  customer_email: z.string().trim().email("E-mail inválido").max(255),
  customer_phone: z.string().trim().min(10, "Informe um WhatsApp válido").max(20),
  customer_doc: z.string().trim().min(11, "Informe CPF ou CNPJ").max(20),
});

type Plan = {
  id: string; code: "trial" | "annual" | "lifetime"; name: string;
  description: string | null; price_cents: number; max_installments: number;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Comprar() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialCodeParam = params.get("plano");
  const initialCode = (initialCodeParam === "lifetime" ? "lifetime" : initialCodeParam === "trial" ? "trial" : "annual") as "trial" | "annual" | "lifetime";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedCode, setSelectedCode] = useState<"trial" | "annual" | "lifetime">(initialCode);
  const [method, setMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [installments, setInstallments] = useState(1);
  const [form, setForm] = useState({ customer_name: "", customer_email: "", customer_phone: "", customer_doc: "" });
  const [busy, setBusy] = useState(false);

  const [refCode, setRefCode] = useState<string>("");
  const [coupon, setCoupon] = useState("");
  const [couponInfo, setCouponInfo] = useState<{ valid: boolean; discount_cents: number; message?: string } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // Elegibilidade da Mensalidade Teste (debounce por e-mail/CPF)
  const [trialEligible, setTrialEligible] = useState<boolean | null>(null);
  const [trialEligibilityMsg, setTrialEligibilityMsg] = useState<string | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);

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
    const plano = params.get("plano") || "annual";
    trackPageVisit(`/comprar?plano=${plano}`);
  }, [params]);

  useEffect(() => {
    supabase.from("plans").select("id,code,name,description,price_cents,max_installments").eq("active", true)
      .then(({ data }) => {
        const order: Record<string, number> = { trial: 0, annual: 1, lifetime: 2 };
        const sorted = ((data ?? []) as Plan[]).slice().sort((a, b) => (order[a.code] ?? 9) - (order[b.code] ?? 9));
        setPlans(sorted);
      });
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

  // Checagem de elegibilidade do trial, em tempo real (debounce 500ms)
  useEffect(() => {
    const email = form.customer_email.trim();
    const doc = form.customer_doc.replace(/\D/g, "");
    if (!email && !doc) { setTrialEligible(null); setTrialEligibilityMsg(null); return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !doc) {
      setTrialEligible(null); setTrialEligibilityMsg(null); return;
    }
    setCheckingEligibility(true);
    const t = setTimeout(async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke("check-trial-eligibility", {
        body: { email, doc, user_id: userRes?.user?.id },
      });
      setCheckingEligibility(false);
      if (error) { setTrialEligible(null); return; }
      const res = (data as any) ?? { eligible: true };
      setTrialEligible(!!res.eligible);
      setTrialEligibilityMsg(res.eligible ? null : (res.message ?? "Mensalidade Teste indisponível para este cadastro."));
      if (!res.eligible && selectedCode === "trial") {
        setSelectedCode("annual");
        toast.warning("Mensalidade Teste já utilizada neste cadastro. Selecionamos o Plano Anual.");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form.customer_email, form.customer_doc, selectedCode]);

  const trialBlocked = trialEligible === false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = Schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!selected) return toast.error("Selecione um plano");
    setBusy(true);
    if (selected.code === "trial" && trialBlocked) {
      setBusy(false);
      return toast.error(trialEligibilityMsg ?? "Mensalidade Teste indisponível para este cadastro.");
    }
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
          <Link to="/" className="flex items-center gap-3 text-white/90 hover:text-white"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
          <div className="rounded-xl px-2 py-1 bg-transparent">
            <img src={logoAsset.url} alt="Phonee" className="h-28 w-auto" />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 py-10 grid lg:grid-cols-[1fr_1.1fr] gap-8 items-stretch">
        <div className="flex flex-col">
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">Garanta seu acesso ao <span className="text-primary">Phonee</span></h1>
          <p className="mt-3 text-white/80">Pagamento seguro via Asaas. Acesso liberado automaticamente após a confirmação.</p>

          <div className="mt-6 flex-1 flex flex-col gap-3">
            {plans.map((p) => {
              const active = selectedCode === p.code;
              const isLifetime = p.code === "lifetime";
              const isTrial = p.code === "trial";
              if (isTrial) {
                const disabled = trialBlocked;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => !disabled && setSelectedCode(p.code)}
                    aria-disabled={disabled}
                    disabled={disabled}
                    title={disabled ? (trialEligibilityMsg ?? "") : undefined}
                    className={`relative w-full text-left rounded-2xl p-[2px] transition overflow-hidden ${
                      disabled
                        ? "bg-white/10 cursor-not-allowed opacity-60"
                        : active
                          ? "bg-gradient-to-br from-primary via-info to-primary shadow-[0_0_40px_-10px_hsl(var(--primary))]"
                          : "bg-gradient-to-br from-primary/60 via-info/40 to-primary/60 hover:from-primary hover:to-primary"
                    }`}
                  >
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 z-10">
                      <div className="bg-gradient-to-r from-primary to-info text-white text-[10px] font-bold tracking-widest uppercase px-4 py-1 rounded-b-xl shadow-lg flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Oportunidade Única
                      </div>
                    </div>
                    <div className="rounded-[14px] bg-[hsl(224_30%_14%)] p-5 pt-7">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-info text-xs font-mono tracking-widest uppercase">
                            <Clock className="h-3.5 w-3.5" /> Mensalidade Teste
                          </div>
                          <h3 className="mt-2 text-lg md:text-xl font-extrabold leading-snug">
                            Teste o Phonee por R$19,90 — apenas uma vez.
                          </h3>
                          <p className="text-xs text-white/70 mt-1">
                            Acesso total por 1 mês. Depois, só Plano Anual ou Vitalício.
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] uppercase text-white/50 tracking-wider">por 30 dias</div>
                          <div className="text-2xl md:text-3xl font-extrabold text-info">{formatBRL(p.price_cents)}</div>
                          <div className="text-[10px] text-white/60">pagamento único</div>
                        </div>
                      </div>
                      <ul className="mt-4 grid sm:grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        {[
                          "Acesso completo ao sistema",
                          "Todos os módulos liberados",
                          "Suporte humano por WhatsApp",
                          "Sem renovação automática",
                          "Ideal para experimentar",
                          "Garantia de 7 dias",
                        ].map((b) => (
                          <li key={b} className="flex items-center gap-1.5 text-white/90">
                            <Check className="h-3.5 w-3.5 text-info shrink-0" /> {b}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 rounded-xl border border-info/30 bg-info/5 p-3 flex gap-2 text-[11px] leading-relaxed text-white/85">
                        <AlertTriangle className="h-4 w-4 text-info shrink-0 mt-0.5" />
                        <span>
                          <b>Apenas uma vez:</b> após o período de 1 mês, a contratação só poderá ser feita nas modalidades <b>Anual</b> ou <b>Vitalício</b>. Aproveite para experimentar antes de um compromisso maior.
                        </span>
                      </div>
                      {disabled && (
                        <div className="mt-3 rounded-xl border-2 border-danger/50 bg-danger/10 p-3 flex gap-2 text-[11px] leading-relaxed text-white">
                          <Lock className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                          <span>
                            <b>Indisponível para este cadastro.</b> {trialEligibilityMsg}
                          </span>
                        </div>
                      )}
                      {checkingEligibility && !disabled && (
                        <div className="mt-2 text-[10px] text-white/50 italic">Verificando elegibilidade…</div>
                      )}
                    </div>
                  </button>
                );
              }
              if (isLifetime) {
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedCode(p.code)}
                    className={`relative w-full text-left rounded-2xl p-[2px] transition overflow-hidden ${
                      active
                        ? "bg-gradient-to-br from-amber-400 via-primary to-amber-500 shadow-[0_0_40px_-10px_hsl(var(--primary))]"
                        : "bg-gradient-to-br from-amber-400/60 via-primary/60 to-amber-500/60 hover:from-amber-400 hover:to-amber-500"
                    }`}
                  >
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 z-10">
                      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold tracking-widest uppercase px-4 py-1 rounded-b-xl shadow-lg flex items-center gap-1">
                        <Flame className="h-3 w-3" /> Oferta de Lançamento
                      </div>
                    </div>
                    <div className="rounded-[14px] bg-[hsl(224_30%_14%)] p-5 pt-7">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-amber-400 text-xs font-mono tracking-widest uppercase">
                            <Crown className="h-3.5 w-3.5" /> Plano Vitalício
                          </div>
                          <h3 className="mt-2 text-lg md:text-xl font-extrabold leading-snug">
                            Garanta acesso vitalício à Phonee por um valor único.
                          </h3>
                          <p className="text-xs text-white/70 mt-1">
                            Pague uma única vez e utilize a plataforma para sempre.
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] uppercase text-white/50 tracking-wider">pagamento único</div>
                          <div className="text-2xl md:text-3xl font-extrabold text-amber-400">{formatBRL(p.price_cents)}</div>
                          <div className="text-[10px] text-white/60">até 12x no cartão</div>
                        </div>
                      </div>
                      <ul className="mt-4 grid sm:grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        {[
                          "Sem mensalidades",
                          "Sem renovações",
                          "Sem reajustes futuros",
                          "Todas as atualizações inclusas",
                          "Suporte contínuo",
                          "Novos recursos sem custo",
                        ].map((b) => (
                          <li key={b} className="flex items-center gap-1.5 text-white/90">
                            <Check className="h-3.5 w-3.5 text-amber-400 shrink-0" /> {b}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-[11px] leading-relaxed text-amber-100/90">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          Valor promocional disponível apenas durante o lançamento da Phonee. Após o encerramento desta fase, o Plano Vitalício poderá ser reajustado sem aviso prévio para novos assinantes.
                        </span>
                      </div>
                    </div>
                  </button>
                );
              }
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedCode(p.code)}
                  className={`flex-1 w-full text-left rounded-2xl border-2 p-5 transition flex flex-col ${
                    active
                      ? "border-primary bg-primary/10 shadow-[0_0_30px_-12px_hsl(var(--primary))]"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-primary text-xs font-mono tracking-widest uppercase">
                        <ShieldCheck className="h-3.5 w-3.5" /> Plano Anual
                      </div>
                      <h3 className="mt-2 text-base md:text-lg font-extrabold leading-snug">
                        Comece com baixo investimento e renove só quando quiser.
                      </h3>
                      <p className="text-xs text-white/70 mt-1">
                        Acesso completo por 12 meses, com flexibilidade de renovação anual.
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase text-white/50 tracking-wider">por 12 meses</div>
                      <div className="text-2xl md:text-3xl font-extrabold">{formatBRL(p.price_cents)}</div>
                      <div className="text-[10px] text-white/60">
                        ou 12x de {formatBRL(Math.round(p.price_cents / 12))}
                      </div>
                    </div>
                  </div>
                  <ul className="mt-4 grid sm:grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    {[
                      "Acesso completo a todos os módulos",
                      "Atualizações inclusas no período",
                      "Suporte humano por WhatsApp",
                      "Sem fidelidade — renove se quiser",
                      "Cancele a qualquer momento",
                      "Garantia de 7 dias — 100% reembolso",
                    ].map((b) => (
                      <li key={b} className="flex items-center gap-1.5 text-white/90">
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" /> {b}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-4">
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex gap-2 text-[11px] leading-relaxed text-white/85">
                    <Rocket className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>
                      Ideal para começar com baixo custo inicial. Você mantém todas as
                      funcionalidades da Phonee e pode migrar para o Plano Vitalício a
                      qualquer momento durante o período de lançamento.
                    </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-2 text-sm text-success">
            <ShieldCheck className="h-4 w-4" /> Garantia de 7 dias — Se não atender suas expectativas reembolsamos 100% do seu dinheiro de volta.
          </div>
        </div>

        <Card className="rounded-2xl p-6 md:p-8 bg-[hsl(224_25%_18%)] border-2 border-primary/30 text-white">
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
                <label className={`flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer ${method === "PIX" ? "border-primary bg-primary/10" : "border-white/15"}`}>
                  <RadioGroupItem value="PIX" /> PIX
                </label>
                <label className={`flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer ${method === "CREDIT_CARD" ? "border-primary bg-primary/10" : "border-white/15"}`}>
                  <RadioGroupItem value="CREDIT_CARD" /> Cartão de crédito
                </label>
              </RadioGroup>
            </div>

            {method === "CREDIT_CARD" && (
              <div className="space-y-2">
                <Label>Parcelamento</Label>
                <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}
                  className="w-full rounded-xl bg-white/5 border border-white/20 px-3 py-2">
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

            {selectedCode === "trial" && (
              <div className="rounded-xl border-2 border-info/40 bg-info/5 p-4 space-y-2">
                <div className="flex items-center gap-2 font-bold text-info">
                  <Sparkles className="h-4 w-4" /> Apenas uma vez: Teste o Phonee por R$19,90
                </div>
                <p className="text-xs text-white/85 leading-relaxed">
                  Acesso total à plataforma por 1 mês. Após o período de teste, a contratação só estará disponível nas modalidades <b>Anual</b> ou <b>Vitalício</b>.
                </p>
              </div>
            )}

            {selectedCode === "lifetime" && (
              <div className="rounded-xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-primary/5 to-amber-500/10 p-4 space-y-3">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <Lock className="h-4 w-4" /> Garantia de Condições Vitalícias
                </div>
                <p className="text-xs text-white/85 leading-relaxed">
                  Ao adquirir o Plano Vitalício durante o lançamento, você garante acesso permanente à plataforma Phonee
                  sem cobranças recorrentes, sem reajustes futuros e com direito a todas as atualizações e melhorias
                  disponibilizadas ao sistema.
                </p>
                <p className="text-xs text-white/70 leading-relaxed">
                  Esta condição é exclusiva para assinantes do Plano Vitalício e poderá não estar disponível futuramente
                  para novos clientes.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[
                    { i: <Hourglass className="h-3 w-3" />, t: "Vagas promocionais limitadas" },
                    { i: <Flame className="h-3 w-3" />, t: "Oferta exclusiva de lançamento" },
                    { i: <InfinityIcon className="h-3 w-3" />, t: "Melhor custo-benefício a longo prazo" },
                    { i: <Crown className="h-3 w-3" />, t: "Economize anos de mensalidades" },
                  ].map((b, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-amber-100/90 bg-black/20 rounded-md px-2 py-1.5">
                      <span className="text-amber-400">{b.i}</span> {b.t}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {refCode && (
              <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 flex items-center gap-2 text-xs">
                <Gift className="h-4 w-4 text-primary" />
                <span>Você foi indicado pelo código <b className="font-mono">{refCode}</b>.</span>
              </div>
            )}

            <div className="rounded-xl bg-white/5 p-4 flex justify-between items-baseline">
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