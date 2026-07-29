import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/MetricCard";
import { NumberInput } from "@/components/NumberInput";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { brl } from "@/lib/format";
import { CreditCard, Percent, Plus, Trash2, TrendingDown, Wallet, CheckCircle2 } from "lucide-react";

type Rule = {
  id: string; payment_method: string; installments_from: number; installments_to: number;
  fee_pct: number; fee_fixed_cents: number; receive_days: number; label: string | null;
};
type Report = {
  total_bruto: number; total_taxa: number; total_liquido: number; taxa_media_pct: number;
  a_receber: number; divergencia: number;
  por_metodo: { method: string; bruto: number; taxa: number; liquido: number; qtd: number }[];
};
type Pending = {
  id: string; method: string; amount: number; fee_amount: number; net_amount: number | null;
  installments: number | null; expected_receipt_date: string | null; created_at: string;
  received_at: string | null; received_amount: number | null;
};

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TaxasCartao() {
  const { store } = useAuth();
  const { toast } = useToast();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  const [rules, setRules] = useState<Rule[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);

  const [openRule, setOpenRule] = useState(false);
  const [rule, setRule] = useState({
    payment_method: "credito", installments_from: 1, installments_to: 1,
    fee_pct: 0, fee_fixed_reais: 0, receive_days: 30, label: "",
  });
  const [confirmTarget, setConfirmTarget] = useState<Pending | null>(null);
  const [confirmAmount, setConfirmAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const [{ data: r }, rep, { data: pend }] = await Promise.all([
      (supabase as any).from("card_fee_rules").select("*").eq("store_id", store.id)
        .order("payment_method").order("installments_from"),
      (supabase as any).rpc("card_fees_report", { _store_id: store.id, _from: from, _to: to }),
      (supabase as any).from("sale_payments")
        .select("id,method,amount,fee_amount,net_amount,installments,expected_receipt_date,created_at,received_at,received_amount")
        .eq("store_id", store.id).in("method", ["credito", "debito", "pix"])
        .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59")
        .order("expected_receipt_date", { ascending: true }),
    ]);
    setRules((r as any) ?? []);
    setReport((rep as any)?.data ?? null);
    setPending((pend as any) ?? []);
    setLoading(false);
  }, [store, from, to]);

  useEffect(() => { load(); }, [load]);

  const saveRule = async () => {
    if (!store) return;
    if (rule.installments_to < rule.installments_from) {
      toast({ title: "Faixa de parcelas inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("card_fee_rules").insert({
      store_id: store.id,
      payment_method: rule.payment_method,
      installments_from: rule.installments_from || 1,
      installments_to: rule.installments_to || 1,
      fee_pct: rule.fee_pct,
      fee_fixed_cents: Math.round((rule.fee_fixed_reais || 0) * 100),
      receive_days: rule.receive_days,
      label: rule.label || null,
      created_by: userRes?.user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar taxa", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Taxa cadastrada" });
    setOpenRule(false);
    load();
  };

  const removeRule = async (id: string) => {
    const { error } = await (supabase as any).from("card_fee_rules").delete().eq("id", id);
    if (error) { toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const confirmReceipt = async () => {
    if (!confirmTarget) return;
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("confirm_card_receipt", {
      _payment_id: confirmTarget.id,
      _received_amount: confirmAmount,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro na conciliação", description: error.message, variant: "destructive" }); return; }
    const diff = Number((data as any)?.divergencia ?? 0);
    toast({
      title: "Recebimento confirmado",
      description: Math.abs(diff) < 0.01 ? "Sem divergência." : `Divergência de ${brl(diff)} em relação ao esperado.`,
      variant: Math.abs(diff) < 0.01 ? undefined : "destructive",
    });
    setConfirmTarget(null);
    load();
  };

  const semRegra = useMemo(
    () => pending.filter((p) => Number(p.fee_amount || 0) === 0 && p.method === "credito").length,
    [pending]
  );

  return (
    <div>
      <PageHeader
        title="Taxas de maquininha"
        description="Quanto o cartão realmente custa: taxa por bandeira/parcelamento, líquido esperado e conciliação."
        actions={
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px] mt-1" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px] mt-1" />
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Vendido no cartão/PIX" value={brl(report?.total_bruto ?? 0)} delta="Bruto no período" icon={CreditCard} tone="info" />
        <MetricCard label="Taxas estimadas" value={brl(report?.total_taxa ?? 0)} delta={`Taxa média ${report?.taxa_media_pct ?? 0}%`} icon={Percent} tone="danger" />
        <MetricCard label="Líquido esperado" value={brl(report?.total_liquido ?? 0)} delta="Depois das taxas" icon={Wallet} tone="success" />
        <MetricCard label="A receber da operadora" value={brl(report?.a_receber ?? 0)} delta="Ainda não confirmado" icon={TrendingDown} tone="warning" />
      </div>

      {semRegra > 0 && (
        <Card className="p-3 mb-4 border-warning/40 bg-warning/5 text-xs">
          {semRegra} pagamento(s) no crédito sem regra de taxa cadastrada — o líquido está igual ao bruto. Cadastre as taxas para o DRE e o fluxo de caixa ficarem corretos.
        </Card>
      )}

      <Tabs defaultValue="relatorio">
        <TabsList>
          <TabsTrigger value="relatorio">Relatório</TabsTrigger>
          <TabsTrigger value="conciliacao">Conciliação</TabsTrigger>
          <TabsTrigger value="regras">Regras de taxa</TabsTrigger>
        </TabsList>

        <TabsContent value="relatorio">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Forma</th>
                  <th className="text-right px-4 py-2 font-medium">Qtd</th>
                  <th className="text-right px-4 py-2 font-medium">Bruto</th>
                  <th className="text-right px-4 py-2 font-medium">Taxa</th>
                  <th className="text-right px-4 py-2 font-medium">Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(report?.por_metodo ?? []).map((m) => (
                  <tr key={m.method}>
                    <td className="px-4 py-2 capitalize">{m.method}</td>
                    <td className="px-4 py-2 text-right text-xs">{m.qtd}</td>
                    <td className="px-4 py-2 text-right metric">{brl(Number(m.bruto))}</td>
                    <td className="px-4 py-2 text-right metric text-danger">{brl(Number(m.taxa))}</td>
                    <td className="px-4 py-2 text-right metric font-semibold">{brl(Number(m.liquido))}</td>
                  </tr>
                ))}
                {(report?.por_metodo ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sem recebimentos em cartão/PIX no período.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="conciliacao">
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-widest font-mono text-muted-foreground">
              Marque o que já caiu na conta e confira a divergência
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Venda em</th>
                  <th className="text-left px-4 py-2 font-medium">Forma</th>
                  <th className="text-left px-4 py-2 font-medium">Previsto p/</th>
                  <th className="text-right px-4 py-2 font-medium">Bruto</th>
                  <th className="text-right px-4 py-2 font-medium">Líquido esperado</th>
                  <th className="text-right px-4 py-2 font-medium">Recebido</th>
                  <th className="text-right px-4 py-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-xs font-mono text-muted-foreground">CARREGANDO…</td></tr>
                ) : pending.map((p) => {
                  const esperado = Number(p.net_amount ?? p.amount);
                  const diff = p.received_at ? Number(p.received_amount ?? 0) - esperado : 0;
                  return (
                    <tr key={p.id} className="hover:bg-surface-elevated/40">
                      <td className="px-4 py-2 text-xs font-mono">{new Date(p.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-2 capitalize text-xs">{p.method}{p.installments && p.installments > 1 ? ` ${p.installments}x` : ""}</td>
                      <td className="px-4 py-2 text-xs font-mono">{p.expected_receipt_date ? new Date(p.expected_receipt_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-4 py-2 text-right text-xs">{brl(Number(p.amount))}</td>
                      <td className="px-4 py-2 text-right metric">{brl(esperado)}</td>
                      <td className="px-4 py-2 text-right">
                        {p.received_at ? (
                          <span className={Math.abs(diff) < 0.01 ? "" : "text-danger font-semibold"}>
                            {brl(Number(p.received_amount ?? 0))}
                            {Math.abs(diff) >= 0.01 && <span className="block text-[10px]">dif. {brl(diff)}</span>}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {p.received_at ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />ok</Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7"
                            onClick={() => { setConfirmTarget(p); setConfirmAmount(esperado); }}>
                            Confirmar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!loading && pending.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nada para conciliar no período.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="regras">
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Regras por forma e faixa de parcelas</span>
              <Button size="sm" onClick={() => setOpenRule(true)}><Plus className="h-3.5 w-3.5 mr-1" />Nova regra</Button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Forma</th>
                  <th className="text-left px-4 py-2 font-medium">Parcelas</th>
                  <th className="text-right px-4 py-2 font-medium">Taxa %</th>
                  <th className="text-right px-4 py-2 font-medium">Taxa fixa</th>
                  <th className="text-right px-4 py-2 font-medium">Recebe em</th>
                  <th className="text-right px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-elevated/40">
                    <td className="px-4 py-2 capitalize">{r.payment_method}{r.label ? <span className="text-[11px] text-muted-foreground ml-2">{r.label}</span> : null}</td>
                    <td className="px-4 py-2 text-xs font-mono">{r.installments_from}x — {r.installments_to}x</td>
                    <td className="px-4 py-2 text-right metric">{Number(r.fee_pct).toFixed(2)}%</td>
                    <td className="px-4 py-2 text-right text-xs">{brl(r.fee_fixed_cents / 100)}</td>
                    <td className="px-4 py-2 text-right text-xs">{r.receive_days} dia(s)</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-danger" onClick={() => removeRule(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhuma taxa cadastrada. Enquanto isso, o líquido é igual ao bruto.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openRule} onOpenChange={setOpenRule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova regra de taxa</DialogTitle>
            <DialogDescription>Vale para vendas novas: a taxa e a data prevista são gravadas no momento da venda.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Forma de pagamento</Label>
              <Select value={rule.payment_method} onValueChange={(v) => setRule({ ...rule, payment_method: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>De (parcelas)</Label>
              <NumberInput value={rule.installments_from} onValueChange={(n) => setRule({ ...rule, installments_from: n })} min={1} allowDecimal={false} emptyBehavior="min" className="mt-1" />
            </div>
            <div>
              <Label>Até (parcelas)</Label>
              <NumberInput value={rule.installments_to} onValueChange={(n) => setRule({ ...rule, installments_to: n })} min={1} allowDecimal={false} emptyBehavior="min" className="mt-1" />
            </div>
            <div>
              <Label>Taxa (%)</Label>
              <NumberInput value={rule.fee_pct} onValueChange={(n) => setRule({ ...rule, fee_pct: n })} min={0} className="mt-1" />
            </div>
            <div>
              <Label>Taxa fixa (R$)</Label>
              <NumberInput value={rule.fee_fixed_reais} onValueChange={(n) => setRule({ ...rule, fee_fixed_reais: n })} min={0} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Recebe em (dias)</Label>
              <NumberInput value={rule.receive_days} onValueChange={(n) => setRule({ ...rule, receive_days: n })} min={0} allowDecimal={false} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Apelido (opcional)</Label>
              <Input value={rule.label} onChange={(e) => setRule({ ...rule, label: e.target.value })} className="mt-1" placeholder="Maquininha PagBank" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRule(false)}>Cancelar</Button>
            <Button onClick={saveRule} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar recebimento</DialogTitle>
            <DialogDescription>
              Esperado: {brl(Number(confirmTarget?.net_amount ?? confirmTarget?.amount ?? 0))}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Valor efetivamente recebido</Label>
            <NumberInput value={confirmAmount} onValueChange={setConfirmAmount} min={0} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>Cancelar</Button>
            <Button onClick={confirmReceipt} disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}