import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/NumberInput";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CreditCard, MessageCircle, RefreshCw, Wallet, AlertTriangle, Calendar } from "lucide-react";
import { handleSupabaseError } from "@/lib/supabaseFetch";
import {
  buildWaMeUrl, normalizeWhatsappPhone, renderWhatsappTemplate,
} from "@/lib/whatsappTemplates";

type Receivable = {
  id: string;
  store_id: string;
  sale_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_whatsapp: string | null;
  installment_number: number;
  total_installments: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: "aberto" | "parcial" | "pago" | "cancelado";
  paid_at: string | null;
};

type Template = { event_key: string; body: string; title: string };

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
};

const daysBetween = (dueISO: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dueISO.split("T")[0].split("-").map(Number);
  const due = new Date(y, m - 1, d);
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
};

type FilterKind = "abertas" | "vence_hoje" | "vencidas" | "pagas" | "todas";

export default function Crediario() {
  const { store } = useAuth();
  const [rows, setRows] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKind>("abertas");
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [storeName, setStoreName] = useState("");

  // dialogs
  const [receiveOpen, setReceiveOpen] = useState<Receivable | null>(null);
  const [receiveAmount, setReceiveAmount] = useState(0);
  const [receiveMethod, setReceiveMethod] = useState<"dinheiro" | "pix" | "cartao" | "transferencia" | "outro">("pix");
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveBusy, setReceiveBusy] = useState(false);

  const [editDueOpen, setEditDueOpen] = useState<Receivable | null>(null);
  const [editDueValue, setEditDueValue] = useState("");

  const [renegOpen, setRenegOpen] = useState<{ ids: string[]; saldo: number; customer: string } | null>(null);
  const [renegQty, setRenegQty] = useState(2);
  const [renegFirstDue, setRenegFirstDue] = useState("");
  const [renegInterval, setRenegInterval] = useState(30);
  const [renegBusy, setRenegBusy] = useState(false);

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sale_receivables")
      .select("*")
      .eq("store_id", store.id)
      .order("due_date", { ascending: true })
      .limit(500);
    if (error) {
      handleSupabaseError(error, "Erro ao carregar parcelas");
      setLoading(false);
      return;
    }
    setRows((data ?? []) as Receivable[]);
    setLoading(false);
  }, [store]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!store) return;
    setStoreName((store as any)?.trade_name || (store as any)?.name || "nossa loja");
    (async () => {
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("event_key, title, body")
        .eq("store_id", store.id)
        .in("event_key", ["cobranca_pendente", "cobranca_vencida"])
        .eq("is_active", true);
      setTemplates((data ?? []) as Template[]);
    })();
  }, [store]);

  const enriched = useMemo(() => {
    return rows.map((r) => {
      const overdue = r.status !== "pago" && r.status !== "cancelado" && new Date(r.due_date) < startOfToday();
      const dueToday = r.status !== "pago" && r.status !== "cancelado" && sameDay(new Date(r.due_date), new Date());
      const remaining = Math.max(0, Number(r.amount) - Number(r.paid_amount));
      return { ...r, overdue, dueToday, remaining, daysLate: overdue ? daysBetween(r.due_date) : 0 };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r) => {
      if (filter === "abertas" && (r.status === "pago" || r.status === "cancelado")) return false;
      if (filter === "pagas" && r.status !== "pago") return false;
      if (filter === "vencidas" && !r.overdue) return false;
      if (filter === "vence_hoje" && !r.dueToday) return false;
      if (q && !(r.customer_name?.toLowerCase().includes(q) || r.customer_whatsapp?.includes(q))) return false;
      return true;
    });
  }, [enriched, filter, search]);

  const totals = useMemo(() => {
    const abertas = enriched.filter((r) => r.status === "aberto" || r.status === "parcial");
    return {
      abertoTotal: abertas.reduce((s, r) => s + r.remaining, 0),
      vencidoTotal: abertas.filter((r) => r.overdue).reduce((s, r) => s + r.remaining, 0),
      vencidoCount: abertas.filter((r) => r.overdue).length,
      hojeCount: abertas.filter((r) => r.dueToday).length,
    };
  }, [enriched]);

  const openReceive = (r: Receivable) => {
    setReceiveOpen(r);
    setReceiveAmount(Math.max(0, Number(r.amount) - Number(r.paid_amount)));
    setReceiveMethod("pix");
    setReceiveNotes("");
  };

  const submitReceive = async () => {
    if (!receiveOpen) return;
    if (receiveAmount <= 0) return toast.error("Informe um valor maior que zero.");
    setReceiveBusy(true);
    const { error } = await (supabase as any).rpc("receive_installment", {
      _receivable_id: receiveOpen.id,
      _amount: receiveAmount,
      _method: receiveMethod,
      _notes: receiveNotes || null,
    });
    setReceiveBusy(false);
    if (error) {
      handleSupabaseError(error, "Não foi possível registrar o recebimento");
      return;
    }
    toast.success("Recebimento registrado.");
    setReceiveOpen(null);
    await load();
  };

  const submitEditDue = async () => {
    if (!editDueOpen || !editDueValue) return;
    const { error } = await supabase
      .from("sale_receivables")
      .update({ due_date: editDueValue })
      .eq("id", editDueOpen.id);
    if (error) {
      handleSupabaseError(error, "Erro ao alterar vencimento");
      return;
    }
    toast.success("Vencimento atualizado.");
    setEditDueOpen(null);
    await load();
  };

  const openReneg = (saleId: string) => {
    const items = enriched.filter((r) => r.sale_id === saleId && (r.status === "aberto" || r.status === "parcial"));
    if (items.length === 0) return toast.error("Sem parcelas abertas para renegociar.");
    const saldo = items.reduce((s, r) => s + r.remaining, 0);
    setRenegOpen({ ids: items.map((r) => r.id), saldo, customer: items[0].customer_name ?? "cliente" });
    setRenegQty(items.length);
    setRenegFirstDue(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    setRenegInterval(30);
  };

  const submitReneg = async () => {
    if (!renegOpen) return;
    setRenegBusy(true);
    const { error } = await (supabase as any).rpc("renegotiate_receivables", {
      _receivable_ids: renegOpen.ids,
      _new_installments: renegQty,
      _first_due: renegFirstDue,
      _interval_days: renegInterval,
      _reason: "renegociação manual",
    });
    setRenegBusy(false);
    if (error) {
      handleSupabaseError(error, "Erro na renegociação");
      return;
    }
    toast.success("Renegociação concluída.");
    setRenegOpen(null);
    await load();
  };

  const sendWhatsapp = async (r: Receivable & { overdue: boolean; daysLate: number; remaining: number }) => {
    if (!r.customer_whatsapp) return toast.error("Este cliente não tem WhatsApp cadastrado.");
    const key = r.overdue ? "cobranca_vencida" : "cobranca_pendente";
    const tpl = templates.find((t) => t.event_key === key);
    const body = tpl?.body ??
      (r.overdue
        ? "Olá {cliente}, aqui é da {loja}. Notamos que a parcela {parcela} de {valor} venceu em {vencimento} (há {dias_atraso} dia(s))."
        : "Olá {cliente}, aqui é da {loja}. Passando para lembrar da parcela {parcela} de {valor} com vencimento em {vencimento}.");
    const text = renderWhatsappTemplate(body, {
      cliente: r.customer_name ?? "cliente",
      loja: storeName,
      valor: brl(r.remaining),
      vencimento: fmtDate(r.due_date),
      dias_atraso: r.daysLate,
      parcela: `${r.installment_number}/${r.total_installments}`,
    });
    const phone = normalizeWhatsappPhone(r.customer_whatsapp);
    // Log envio
    try {
      await (supabase as any).from("whatsapp_messages_log").insert({
        store_id: r.store_id,
        sale_id: r.sale_id,
        event_key: key,
        body: text,
        phone,
      });
    } catch { /* noop */ }
    window.open(buildWaMeUrl(phone, text), "_blank", "noopener");
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <PageHeader
        title="Crediário"
        subtitle="Parcelas em aberto, vencidas e abatimentos"
        icon={CreditCard}
      />

      {/* Totais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">A receber (total)</div>
          <div className="text-2xl font-semibold mt-1">{brl(totals.abertoTotal)}</div>
        </Card>
        <Card className="p-4 border-danger/30">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-danger" />Vencido
          </div>
          <div className="text-2xl font-semibold mt-1 text-danger">{brl(totals.vencidoTotal)}</div>
          <div className="text-xs text-muted-foreground">{totals.vencidoCount} parcela(s)</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />Vence hoje
          </div>
          <div className="text-2xl font-semibold mt-1">{totals.hojeCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5" />Parcelas listadas
          </div>
          <div className="text-2xl font-semibold mt-1">{filtered.length}</div>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        {(["abertas", "vence_hoje", "vencidas", "pagas", "todas"] as FilterKind[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={filter === k ? "default" : "outline"}
            onClick={() => setFilter(k)}
          >
            {k === "abertas" ? "Em aberto"
              : k === "vence_hoje" ? "Vence hoje"
              : k === "vencidas" ? "Vencidas"
              : k === "pagas" ? "Pagas"
              : "Todas"}
          </Button>
        ))}
        <div className="flex-1" />
        <Input
          placeholder="Buscar por cliente ou WhatsApp"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </Card>

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma parcela.</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id} className={r.overdue ? "bg-danger/5" : undefined}>
                  <TableCell>
                    <div className="font-medium">{r.customer_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.customer_whatsapp ?? "sem WhatsApp"}</div>
                  </TableCell>
                  <TableCell>{r.installment_number}/{r.total_installments}</TableCell>
                  <TableCell>
                    <div className={r.overdue ? "text-danger font-medium" : undefined}>{fmtDate(r.due_date)}</div>
                    {r.overdue && <div className="text-[11px] text-danger">{r.daysLate} dia(s) em atraso</div>}
                    {r.dueToday && <div className="text-[11px] text-amber-600">Vence hoje</div>}
                  </TableCell>
                  <TableCell className="text-right">{brl(r.amount)}</TableCell>
                  <TableCell className="text-right">{brl(r.remaining)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "pago" ? "default" : r.overdue ? "destructive" : "secondary"}>
                      {r.status === "pago" ? "Pago" : r.status === "parcial" ? "Parcial" : r.status === "cancelado" ? "Cancelada" : r.overdue ? "Vencida" : "Aberta"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {r.status !== "pago" && r.status !== "cancelado" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openReceive(r)}>Receber</Button>
                          <Button size="sm" variant="ghost" onClick={() => sendWhatsapp(r)} title="Cobrar via WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditDueOpen(r); setEditDueValue(r.due_date.slice(0, 10)); }} title="Editar vencimento">
                            <Calendar className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openReneg(r.sale_id)} title="Renegociar saldo desta venda">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Dialog receber */}
      <Dialog open={!!receiveOpen} onOpenChange={(o) => !o && setReceiveOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber parcela</DialogTitle>
          </DialogHeader>
          {receiveOpen && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {receiveOpen.customer_name} · parcela {receiveOpen.installment_number}/{receiveOpen.total_installments} ·
                saldo <b>{brl(Number(receiveOpen.amount) - Number(receiveOpen.paid_amount))}</b>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Valor recebido</Label>
                  <NumberInput value={receiveAmount} onValueChange={setReceiveAmount} min={0} />
                </div>
                <div>
                  <Label>Forma</Label>
                  <Select value={receiveMethod} onValueChange={(v) => setReceiveMethod(v as typeof receiveMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Observação (opcional)</Label>
                <Input value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} placeholder="Ex.: NSU, banco, etc." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiveOpen(null)}>Cancelar</Button>
            <Button onClick={submitReceive} disabled={receiveBusy}>{receiveBusy ? "Registrando…" : "Registrar recebimento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar vencimento */}
      <Dialog open={!!editDueOpen} onOpenChange={(o) => !o && setEditDueOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Alterar vencimento</DialogTitle></DialogHeader>
          <div>
            <Label>Novo vencimento</Label>
            <Input type="date" value={editDueValue} onChange={(e) => setEditDueValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDueOpen(null)}>Cancelar</Button>
            <Button onClick={submitEditDue}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog renegociar */}
      <Dialog open={!!renegOpen} onOpenChange={(o) => !o && setRenegOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renegociar saldo</DialogTitle></DialogHeader>
          {renegOpen && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Cliente: <b>{renegOpen.customer}</b> · saldo a renegociar: <b>{brl(renegOpen.saldo)}</b>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Novas parcelas</Label>
                  <NumberInput allowDecimal={false} min={1} max={36} value={renegQty} onValueChange={setRenegQty} />
                </div>
                <div>
                  <Label>1º vencimento</Label>
                  <Input type="date" value={renegFirstDue} onChange={(e) => setRenegFirstDue(e.target.value)} />
                </div>
                <div>
                  <Label>Intervalo (dias)</Label>
                  <NumberInput allowDecimal={false} min={1} max={90} value={renegInterval} onValueChange={setRenegInterval} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                As parcelas atuais serão canceladas e novas serão geradas com o saldo.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenegOpen(null)}>Cancelar</Button>
            <Button onClick={submitReneg} disabled={renegBusy}>{renegBusy ? "Renegociando…" : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}