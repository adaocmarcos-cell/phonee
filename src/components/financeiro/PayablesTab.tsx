import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/NumberInput";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { brl } from "@/lib/format";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Plus, Repeat, Trash2 } from "lucide-react";

export type PayableRow = {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: "aberto" | "pago" | "vencido" | "cancelado";
  recurrence: "none" | "weekly" | "monthly" | "yearly";
  payment_method: string | null;
  category_id: string | null;
  supplier_id: string | null;
  purchase_order_id: string | null;
  installment_number: number | null;
  total_installments: number | null;
  notes: string | null;
};

type Option = { id: string; label: string };

const BUCKETS = [
  { key: "vencidas", label: "Vencidas", icon: AlertTriangle, tone: "text-danger" },
  { key: "hoje", label: "Vence hoje", icon: Clock, tone: "text-warning" },
  { key: "d7", label: "Próximos 7 dias", icon: CalendarClock, tone: "text-foreground" },
  { key: "d30", label: "Próximos 30 dias", icon: CalendarClock, tone: "text-muted-foreground" },
] as const;

const RECURRENCE_LABEL: Record<string, string> = {
  none: "Única", weekly: "Semanal", monthly: "Mensal", yearly: "Anual",
};

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export function PayablesTab({ storeId, onChanged }: { storeId: string; onChanged?: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaid, setShowPaid] = useState(false);

  // baixa rápida
  const [payTarget, setPayTarget] = useState<PayableRow | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("pix");
  const [payDate, setPayDate] = useState(isoToday());
  const [saving, setSaving] = useState(false);

  // novo título
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({
    description: "", amount: 0, due_date: isoToday(), category_id: "", supplier_id: "",
    recurrence: "none", installments: 1, payment_method: "pix", notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: c }, { data: s }] = await Promise.all([
      supabase.from("payables").select("*").eq("store_id", storeId).neq("status", "cancelado").order("due_date"),
      supabase.from("expense_categories").select("id,name").eq("store_id", storeId).order("name"),
      supabase.from("suppliers").select("id,company_name").eq("store_id", storeId).order("company_name"),
    ]);
    setRows(((p as any) ?? []).map((r: any) => ({ ...r, amount: Number(r.amount || 0) })));
    setCategories(((c as any) ?? []).map((r: any) => ({ id: r.id, label: r.name })));
    setSuppliers(((s as any) ?? []).map((r: any) => ({ id: r.id, label: r.company_name })));
    setLoading(false);
  }, [storeId]);

  useEffect(() => { if (storeId) load(); }, [storeId, load]);

  const today = isoToday();
  const buckets = useMemo(() => {
    const open = rows.filter((r) => r.status !== "pago");
    return {
      vencidas: open.filter((r) => r.due_date < today),
      hoje: open.filter((r) => r.due_date === today),
      d7: open.filter((r) => r.due_date > today && r.due_date <= addDays(today, 7)),
      d30: open.filter((r) => r.due_date > addDays(today, 7) && r.due_date <= addDays(today, 30)),
      futuro: open.filter((r) => r.due_date > addDays(today, 30)),
      pagas: rows.filter((r) => r.status === "pago"),
    };
  }, [rows, today]);

  const sum = (list: PayableRow[]) => list.reduce((s, r) => s + r.amount, 0);

  const openPay = (r: PayableRow) => {
    setPayTarget(r);
    setPayAmount(r.amount);
    setPayMethod(r.payment_method || "pix");
    setPayDate(isoToday());
  };

  const confirmPay = async () => {
    if (!payTarget) return;
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("pay_payable", {
      _payable_id: payTarget.id,
      _paid_amount: payAmount || payTarget.amount,
      _payment_method: payMethod,
      _paid_at: payDate,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Não foi possível dar baixa", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Conta paga",
      description: (data as any)?.next_payable_id
        ? "Despesa lançada e próxima recorrência criada."
        : "Despesa lançada em Custos & Despesas.",
    });
    setPayTarget(null);
    await load();
    onChanged?.();
  };

  const createPayable = async () => {
    if (!form.description.trim() || form.amount <= 0) {
      toast({ title: "Preencha descrição e valor", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const n = Math.max(1, Math.min(form.installments || 1, 60));
    const each = Number((form.amount / n).toFixed(2));
    const payload = Array.from({ length: n }, (_, i) => ({
      store_id: storeId,
      description: n > 1 ? `${form.description} (${i + 1}/${n})` : form.description,
      amount: i === n - 1 ? Number((form.amount - each * (n - 1)).toFixed(2)) : each,
      due_date: addMonths(form.due_date, i),
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      recurrence: n > 1 ? "none" : form.recurrence,
      installment_number: n > 1 ? i + 1 : null,
      total_installments: n > 1 ? n : null,
      payment_method: form.payment_method,
      notes: form.notes || null,
      created_by: userRes?.user?.id ?? null,
    }));
    const { error } = await (supabase as any).from("payables").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao criar título", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: n > 1 ? `${n} parcelas criadas` : "Conta a pagar criada" });
    setOpenNew(false);
    setForm({ description: "", amount: 0, due_date: isoToday(), category_id: "", supplier_id: "", recurrence: "none", installments: 1, payment_method: "pix", notes: "" });
    await load();
    onChanged?.();
  };

  const removePayable = async (r: PayableRow) => {
    const { error } = await (supabase as any).from("payables").delete().eq("id", r.id);
    if (error) {
      toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Título excluído" });
    await load();
    onChanged?.();
  };

  const Row = ({ r }: { r: PayableRow }) => (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm hover:bg-surface-elevated/40">
      <div className="min-w-0 flex-1">
        <div className="truncate flex items-center gap-2">
          {r.description}
          {r.recurrence !== "none" && (
            <Badge variant="outline" className="text-[10px] gap-1"><Repeat className="h-3 w-3" />{RECURRENCE_LABEL[r.recurrence]}</Badge>
          )}
          {r.purchase_order_id && <Badge variant="outline" className="text-[10px]">compra</Badge>}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono">
          vence {fmtDate(r.due_date)}
          {r.total_installments ? ` · parcela ${r.installment_number}/${r.total_installments}` : ""}
        </div>
      </div>
      <span className="metric font-semibold text-danger whitespace-nowrap">{brl(r.amount)}</span>
      {r.status === "pago" ? (
        <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Pago</Badge>
      ) : (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7" onClick={() => openPay(r)}>Baixar</Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-danger"
            title="Excluir título" onClick={() => removePayable(r)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {BUCKETS.map((b) => {
          const list = (buckets as any)[b.key] as PayableRow[];
          const Icon = b.icon;
          return (
            <Card key={b.key} className="p-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
                <Icon className={`h-3.5 w-3.5 ${b.tone}`} />{b.label}
              </div>
              <div className={`text-lg font-semibold metric mt-1 ${b.key === "vencidas" ? "text-danger" : ""}`}>{brl(sum(list))}</div>
              <div className="text-[11px] text-muted-foreground">{list.length} título(s)</div>
            </Card>
          );
        })}
      </div>

      <Card className="bg-card border-border shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Contas a pagar</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowPaid((v) => !v)}>
              {showPaid ? "Ocultar pagas" : "Ver pagas"}
            </Button>
            <Button size="sm" onClick={() => setOpenNew(true)}><Plus className="h-3.5 w-3.5 mr-1" />Nova conta</Button>
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-12 text-center text-xs text-muted-foreground font-mono">CARREGANDO…</div>
        ) : (
          <div className="divide-y divide-border">
            {[
              ["Vencidas", buckets.vencidas],
              ["Vence hoje", buckets.hoje],
              ["Próximos 7 dias", buckets.d7],
              ["Próximos 30 dias", buckets.d30],
              ["Depois de 30 dias", buckets.futuro],
              ...(showPaid ? ([["Pagas", buckets.pagas]] as [string, PayableRow[]][]) : []),
            ].map(([label, list]) => {
              const items = list as PayableRow[];
              if (items.length === 0) return null;
              return (
                <div key={label as string}>
                  <div className="px-4 py-1.5 bg-surface-elevated text-[10px] uppercase tracking-widest font-mono text-muted-foreground flex justify-between">
                    <span>{label as string}</span><span>{brl(sum(items))}</span>
                  </div>
                  {items.map((r) => <Row key={r.id} r={r} />)}
                </div>
              );
            })}
            {rows.filter((r) => r.status !== "pago").length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma conta em aberto. 🎉</div>
            )}
          </div>
        )}
      </Card>

      {/* Baixa rápida */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar baixa</DialogTitle>
            <DialogDescription>{payTarget?.description} · vence {payTarget ? fmtDate(payTarget.due_date) : ""}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Valor pago</Label>
              <NumberInput value={payAmount} onValueChange={setPayAmount} min={0} className="mt-1" />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Forma</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["dinheiro", "pix", "debito", "credito", "boleto", "transferencia"].map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A baixa lança automaticamente a despesa em Custos & Despesas.
            {payTarget?.recurrence !== "none" && " O próximo vencimento será criado automaticamente."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancelar</Button>
            <Button onClick={confirmPay} disabled={saving}>{saving ? "Salvando…" : "Confirmar pagamento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo título */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova conta a pagar</DialogTitle>
            <DialogDescription>Compromisso futuro. A despesa só é lançada quando você der baixa.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Descrição</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" placeholder="Aluguel da loja" />
            </div>
            <div>
              <Label>Valor total</Label>
              <NumberInput value={form.amount} onValueChange={(n) => setForm({ ...form, amount: n })} min={0} className="mt-1" />
            </div>
            <div>
              <Label>1º vencimento</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor (opcional)</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recorrência</Label>
              <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })} disabled={form.installments > 1}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRENCE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Parcelas</Label>
              <NumberInput value={form.installments} onValueChange={(n) => setForm({ ...form, installments: n })} min={1} allowDecimal={false} emptyBehavior="min" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={createPayable} disabled={saving}>{saving ? "Salvando…" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PayablesTab;