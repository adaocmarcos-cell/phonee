import { useEffect, useState } from "react";
import { useAuth, MyStore } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Check, AlertTriangle, ArrowRightLeft, CalendarClock, Crown, Trash2, Infinity as InfinityIcon, RefreshCw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Plan = { id: string; code: string; name: string; price_cents: number; duration_months: number | null };

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export default function MinhasLojas() {
  const { user, store, stores, switchStore, reloadStores, role } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cycle, setCycle] = useState<"annual" | "lifetime">("annual");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "boleto" | "credit_card">("pix");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("plans").select("id,code,name,price_cents,duration_months").eq("active", true)
      .then(({ data }) => setPlans((data ?? []) as Plan[]));
  }, []);

  const planAnnual = plans.find((p) => p.code === "annual");
  const planLifetime = plans.find((p) => p.code === "lifetime");
  const selectedPlan = cycle === "lifetime" ? planLifetime : planAnnual;

  const canManage = role === "dono";

  const createStoreAndSubscription = async () => {
    if (!user) return;
    if (!name.trim()) { toast.error("Informe o nome da loja"); return; }
    if (!selectedPlan) { toast.error("Plano indisponível"); return; }
    setSaving(true);
    try {
      const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: created, error: e1 } = await (supabase.from("stores") as any)
        .insert({ name: name.trim(), slug, owner_id: user.id })
        .select("id, name, slug")
        .single();
      if (e1 || !created) throw e1 ?? new Error("Falha ao criar loja");
      await supabase.from("user_stores").insert({ user_id: user.id, store_id: created.id });
      await supabase.from("user_roles").insert({ user_id: user.id, store_id: created.id, role: "dono" });

      // Tenta gerar uma cobrança real via Asaas (mesma estrutura do checkout de planos).
      const asaasMethod = paymentMethod === "credit_card" ? "CREDIT_CARD" : "PIX";
      const { data: charge, error: chargeErr } = await supabase.functions.invoke("asaas-create-charge", {
        body: {
          plan_code: cycle,
          customer_name: user.user_metadata?.full_name || user.email || "Cliente",
          customer_email: user.email || "",
          customer_phone: user.user_metadata?.phone || "11999999999",
          customer_doc: user.user_metadata?.doc || "00000000000",
          payment_method: asaasMethod,
          installments: 1,
          store_id: created.id,
          user_id: user.id,
          billing_cycle: cycle,
        },
      });

      if (!chargeErr && (charge as any)?.subscription_id) {
        toast.success("Loja criada — cobrança gerada");
        setOpen(false); setName(""); setCycle("annual");
        await reloadStores();
        navigate(`/comprar/sucesso/${(charge as any).subscription_id}`);
        return;
      }

      // Fallback (Asaas indisponível): cria assinatura pendente direto na base.
      const expiresAt = cycle === "annual" ? new Date(Date.now() + 365 * 86400000).toISOString() : null;
      const { error: e2 } = await (supabase.from("subscriptions") as any).insert({
        user_id: user.id,
        store_id: created.id,
        plan_id: selectedPlan.id,
        billing_cycle: cycle,
        customer_name: user.user_metadata?.full_name || user.email || "Cliente",
        customer_email: user.email || "",
        customer_doc: user.user_metadata?.doc || "",
        payment_method: paymentMethod,
        status: "pending",
        amount_cents: selectedPlan.price_cents,
        installments: 1,
        started_at: new Date().toISOString(),
        expires_at: expiresAt,
      });
      if (e2) throw e2;

      toast.success("Loja criada — finalize o pagamento para ativar");
      setOpen(false); setName(""); setCycle("annual");
      await reloadStores();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar loja");
    } finally {
      setSaving(false);
    }
  };

  const statusInfo = (s: MyStore) => {
    if (s.subscription_status === "ativa" || s.subscription_status === "active" || s.subscription_status === "aprovado")
      return { label: "Ativa", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", icon: <Check className="h-3 w-3" /> };
    if (s.subscription_status === "sem_assinatura")
      return { label: "Sem assinatura", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30", icon: <AlertTriangle className="h-3 w-3" /> };
    if (["atrasada","vencida","overdue"].includes(s.subscription_status))
      return { label: "Vencida", cls: "bg-rose-500/15 text-rose-700 border-rose-500/30", icon: <AlertTriangle className="h-3 w-3" /> };
    return { label: "Pendente", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30", icon: <CalendarClock className="h-3 w-3" /> };
  };

  const isActiveSub = (s: MyStore) =>
    ["ativa", "active", "aprovado"].includes(s.subscription_status);

  const cycleBadge = (s: MyStore) => {
    if (s.billing_cycle === "lifetime") {
      return {
        label: "Vitalício",
        cls: "bg-violet-500/15 text-violet-700 border-violet-500/30",
        icon: <InfinityIcon className="h-3 w-3" />,
      };
    }
    return {
      label: "Anual",
      cls: "bg-sky-500/15 text-sky-700 border-sky-500/30",
      icon: <RefreshCw className="h-3 w-3" />,
    };
  };

  const lifetimeCount = stores.filter((s) => s.billing_cycle === "lifetime" && isActiveSub(s)).length;
  const annualCount = stores.filter((s) => s.billing_cycle !== "lifetime" && isActiveSub(s)).length;

  const deleteStore = async (s: MyStore) => {
    if (!s.is_owner) { toast.error("Apenas o dono pode excluir a loja"); return; }
    if (isActiveSub(s)) { toast.error("Loja com assinatura ativa não pode ser excluída"); return; }
    try {
      await supabase.from("subscriptions").delete().eq("store_id", s.store_id);
      await supabase.from("user_roles").delete().eq("store_id", s.store_id);
      await supabase.from("user_stores").delete().eq("store_id", s.store_id);
      const { error } = await supabase.from("stores").delete().eq("id", s.store_id);
      if (error) throw error;
      toast.success(`Loja "${s.name}" removida`);
      await reloadStores();
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao remover loja");
    }
  };

  return (
    <div>
      <PageHeader
        title="Minhas Lojas"
        description="Gerencie todas as suas lojas, alterne entre elas e adicione novas unidades."
        actions={
          canManage && (
            <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4 mr-1" />Adicionar nova loja
            </Button>
          )
        }
      />

      {stores.length > 0 && (
        <Card className="mb-4 p-4 bg-gradient-to-br from-primary/5 via-background to-info/5 border-primary/20">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <Crown className="h-4 w-4 text-primary" />
              Modalidade do gestor
            </div>
            <Badge variant="outline" className="bg-violet-500/15 text-violet-700 border-violet-500/30 gap-1">
              <InfinityIcon className="h-3 w-3" /> Vitalício · {lifetimeCount}
            </Badge>
            <Badge variant="outline" className="bg-sky-500/15 text-sky-700 border-sky-500/30 gap-1">
              <RefreshCw className="h-3 w-3" /> Anual · {annualCount}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {stores.length} loja(s) cadastrada(s)
            </span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map((s) => {
          const isActive = s.store_id === store?.id;
          const status = statusInfo(s);
          const cycle = cycleBadge(s);
          return (
            <Card key={s.store_id} className={`p-5 transition-all ${isActive ? "border-primary/60 shadow-glow" : "hover:border-primary/30"}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    {s.logo_url ? <img src={s.logo_url} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <Building2 className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="text-base font-semibold leading-tight">{s.name}</div>
                    <div className="text-[11px] font-mono text-muted-foreground mt-0.5 flex items-center gap-2">
                      {s.is_owner && <span className="inline-flex items-center gap-0.5 text-primary"><Crown className="h-3 w-3" />Dono</span>}
                      <span className="capitalize">{s.role ?? "—"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className={`${cycle.cls} gap-1`}>{cycle.icon}{cycle.label}</Badge>
                  {isActive && <Badge className="bg-primary/15 text-primary border-primary/30">Ativa agora</Badge>}
                </div>
              </div>

              <div className="space-y-2 text-sm border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Plano</span>
                  <span className="font-medium flex items-center gap-1.5">
                    {s.plan_name ?? "—"}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${cycle.cls}`}>
                      {cycle.icon}{cycle.label}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cobrança</span>
                  <span className="font-medium">
                    {s.billing_cycle === "lifetime"
                      ? "Pagamento único · acesso vitalício"
                      : "Recorrência anual · renova a cada 12 meses"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className={`${status.cls} gap-1`}>{status.icon}{status.label}</Badge>
                </div>
                {s.expires_at && s.billing_cycle === "annual" && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Renova em</span>
                    <span className="font-mono">{new Date(s.expires_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4">
                <Button
                  size="sm" variant={isActive ? "outline" : "default"}
                  className="flex-1"
                  disabled={isActive}
                  onClick={async () => { await switchStore(s.store_id); toast.success(`Agora você está em ${s.name}`); navigate("/painel"); }}
                >
                  {isActive ? "Em uso" : "Entrar nesta loja"}
                </Button>
                {(status.label !== "Ativa") && s.is_owner && (
                  <Button size="sm" variant="outline" onClick={() => navigate("/planos")}>
                    Pagar
                  </Button>
                )}
                {!isActive && !isActiveSub(s) && s.is_owner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" title="Excluir loja" className="text-danger hover:text-danger hover:bg-danger/10 border-danger/30">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir loja "{s.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação remove permanentemente a loja, seus vínculos de usuários e a assinatura pendente.
                          Disponível apenas para lojas que <strong>não tiveram o pagamento finalizado</strong>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteStore(s)} className="bg-danger text-danger-foreground hover:bg-danger/90">
                          Excluir loja
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {stores.length > 1 && (
        <Card className="mt-6 p-5 bg-gradient-to-br from-primary/5 to-info/5 border-primary/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">Transferência de produtos entre lojas</div>
              <div className="text-sm text-muted-foreground">Movimente estoque entre as lojas que você possui mantendo o histórico.</div>
            </div>
            <Button onClick={() => navigate("/painel/estoque/transferencia")}>Abrir transferência</Button>
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar nova loja</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da loja *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Mobile+ Filial Centro" />
            </div>
            <div>
              <Label>Modalidade de cobrança *</Label>
              <Select value={cycle} onValueChange={(v) => setCycle(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {planAnnual && <SelectItem value="annual">{planAnnual.name} — {brl(planAnnual.price_cents / 100)} / ano</SelectItem>}
                  {planLifetime && <SelectItem value="lifetime">{planLifetime.name} — {brl(planLifetime.price_cents / 100)} (vitalício)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pagamento *</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="credit_card">Cartão de crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">Valor da loja adicional</span>
                <span className="font-semibold metric">{selectedPlan ? brl(selectedPlan.price_cents / 100) : "—"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {cycle === "lifetime"
                  ? "Pagamento único — loja com acesso vitalício."
                  : "Cobrança anual — renovação em 12 meses."}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={createStoreAndSubscription} disabled={saving}>
              {saving ? "Criando…" : "Criar loja e gerar cobrança"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}