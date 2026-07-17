import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/NumberInput";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { handleSupabaseError } from "@/lib/supabaseFetch";
import { Wallet, LockOpen, Lock, TrendingUp, TrendingDown, FileDown, Printer, RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Session = {
  id: string; store_id: string; opened_by: string; opened_at: string;
  opening_amount: number; closed_by: string | null; closed_at: string | null;
  expected_cash: number | null; counted_cash: number | null; difference: number | null;
  status: "aberto" | "fechado"; notes: string | null;
};

type Movement = {
  id: string; type: "sangria" | "suprimento"; amount: number; reason: string;
  created_at: string; created_by: string; session_id: string;
};

type Summary = {
  session_id: string; status: string; opening_amount: number;
  sales_cash: number; receivables_cash: number;
  suprimentos: number; sangrias: number; expected_cash: number;
  by_method: { method: string; amount: number }[];
};

const DIFF_LIMIT = 5; // R$ threshold requiring reason

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function startOfMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }
function fmtDT(iso: string | null) { return iso ? new Date(iso).toLocaleString("pt-BR") : "—"; }

export default function Caixa() {
  const { store, user } = useAuth();
  const [tab, setTab] = useState<"atual" | "historico" | "consolidado">("atual");

  const [openSession, setOpenSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  // open dialog
  const [openDlg, setOpenDlg] = useState(false);
  const [openingAmount, setOpeningAmount] = useState(0);
  const [openingNotes, setOpeningNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // movement dialog
  const [movDlg, setMovDlg] = useState<null | "sangria" | "suprimento">(null);
  const [movAmount, setMovAmount] = useState(0);
  const [movReason, setMovReason] = useState("");

  // close dialog (blind count)
  const [closeDlg, setCloseDlg] = useState(false);
  const [countedCash, setCountedCash] = useState(0);
  const [closeNotes, setCloseNotes] = useState("");
  const [closeReveal, setCloseReveal] = useState<null | { expected: number; counted: number; diff: number; summary: Summary }>(null);

  // history
  const [histFrom, setHistFrom] = useState(toInputDate(startOfMonth()));
  const [histTo, setHistTo] = useState(toInputDate(new Date()));
  const [histSessions, setHistSessions] = useState<Session[]>([]);

  // consolidated
  const [consolidated, setConsolidated] = useState<any>(null);
  const [operators, setOperators] = useState<Record<string, string>>({});

  const loadOpen = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const { data: s, error } = await (supabase as any)
      .rpc("get_open_cash_session", { _store_id: store.id });
    if (error) { handleSupabaseError(error, "Erro ao buscar caixa"); setLoading(false); return; }
    const sess: Session | null = (Array.isArray(s) && s.length) ? s[0] : null;
    setOpenSession(sess);
    if (sess) {
      const [{ data: sum }, { data: mv }] = await Promise.all([
        (supabase as any).rpc("get_cash_session_summary", { _session_id: sess.id }),
        (supabase as any).from("cash_movements").select("*").eq("session_id", sess.id).order("created_at", { ascending: false }),
      ]);
      setSummary(sum ?? null);
      setMovements((mv as Movement[]) ?? []);
    } else {
      setSummary(null); setMovements([]);
    }
    setLoading(false);
  }, [store]);

  const loadHistory = useCallback(async () => {
    if (!store) return;
    const { data, error } = await (supabase as any)
      .from("cash_sessions").select("*")
      .eq("store_id", store.id)
      .gte("opened_at", `${histFrom}T00:00:00`)
      .lte("opened_at", `${histTo}T23:59:59`)
      .order("opened_at", { ascending: false });
    if (error) return handleSupabaseError(error, "Erro ao buscar histórico");
    setHistSessions((data as Session[]) ?? []);
    // gather operator names
    const ids = Array.from(new Set(((data ?? []) as Session[]).map(s => s.opened_by).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await (supabase as any).from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name || p.email || p.id.slice(0,8); });
      setOperators(map);
    }
  }, [store, histFrom, histTo]);

  const loadConsolidated = useCallback(async () => {
    if (!store) return;
    const { data, error } = await (supabase as any).rpc("get_cash_consolidated", {
      _store_id: store.id, _from: histFrom, _to: histTo,
    });
    if (error) return handleSupabaseError(error, "Erro ao carregar consolidado");
    setConsolidated(data ?? null);
  }, [store, histFrom, histTo]);

  useEffect(() => { loadOpen(); }, [loadOpen]);
  useEffect(() => { if (tab === "historico") loadHistory(); }, [tab, loadHistory]);
  useEffect(() => { if (tab === "consolidado") { loadHistory(); loadConsolidated(); } }, [tab, loadConsolidated, loadHistory]);

  const handleOpen = async () => {
    if (!store) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("open_cash_session", {
      _store_id: store.id, _opening_amount: openingAmount, _notes: openingNotes || null,
    });
    setBusy(false);
    if (error) return handleSupabaseError(error, "Erro ao abrir caixa");
    toast.success("Caixa aberto.");
    setOpenDlg(false); setOpeningAmount(0); setOpeningNotes("");
    await loadOpen();
  };

  const handleMovement = async () => {
    if (!openSession || !movDlg) return;
    if (movAmount <= 0) return toast.error("Informe um valor maior que zero.");
    if (!movReason.trim()) return toast.error("Motivo é obrigatório.");
    setBusy(true);
    const { error } = await (supabase as any).rpc("add_cash_movement", {
      _session_id: openSession.id, _type: movDlg, _amount: movAmount, _reason: movReason.trim(),
    });
    setBusy(false);
    if (error) return handleSupabaseError(error, "Erro ao registrar movimento");
    toast.success(movDlg === "sangria" ? "Sangria registrada." : "Suprimento registrado.");
    setMovDlg(null); setMovAmount(0); setMovReason("");
    await loadOpen();
  };

  const handleCloseSubmit = async () => {
    if (!openSession) return;
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("close_cash_session", {
      _session_id: openSession.id, _counted_cash: countedCash, _notes: closeNotes || null,
    });
    setBusy(false);
    if (error) return handleSupabaseError(error, "Erro ao fechar caixa");
    const d = data as any;
    const diff = Number(d.difference);
    if (Math.abs(diff) > DIFF_LIMIT && !closeNotes.trim()) {
      // require reason on divergence; reopen dialog with reveal but keep session closed?
      // We already closed; ask to append note via update.
      toast.warning(`Diferença de ${brl(diff)}. Justifique o quanto antes.`);
    }
    setCloseReveal({ expected: Number(d.expected_cash), counted: Number(d.counted_cash), diff, summary: d.summary });
    await loadOpen();
  };

  const printReceipt = (sess: Session, sum: Summary, movs: Movement[]) => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Fechamento de caixa — ${store?.name ?? ""}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Abertura: ${fmtDT(sess.opened_at)}`, 14, 24);
    doc.text(`Fechamento: ${fmtDT(sess.closed_at)}`, 14, 30);
    autoTable(doc, {
      startY: 38,
      head: [["Item", "Valor"]],
      body: [
        ["Fundo de troco", brl(Number(sess.opening_amount))],
        ["Vendas em dinheiro", brl(sum.sales_cash)],
        ["Recebimentos em dinheiro", brl(sum.receivables_cash)],
        ["Suprimentos", brl(sum.suprimentos)],
        ["Sangrias", `- ${brl(sum.sangrias)}`],
        ["Esperado", brl(Number(sess.expected_cash ?? sum.expected_cash))],
        ["Contado", brl(Number(sess.counted_cash ?? 0))],
        ["Diferença", brl(Number(sess.difference ?? 0))],
      ],
    });
    if (sum.by_method?.length) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 6,
        head: [["Método", "Total"]],
        body: sum.by_method.map(m => [m.method, brl(Number(m.amount))]),
      });
    }
    if (movs.length) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 6,
        head: [["Movimento", "Valor", "Motivo", "Quando"]],
        body: movs.map(m => [m.type, brl(Number(m.amount)), m.reason, fmtDT(m.created_at)]),
      });
    }
    doc.save(`caixa-${sess.id.slice(0,8)}.pdf`);
  };

  const openHistDetails = async (sess: Session) => {
    const { data: sum } = await (supabase as any).rpc("get_cash_session_summary", { _session_id: sess.id });
    const { data: mv } = await (supabase as any).from("cash_movements").select("*").eq("session_id", sess.id).order("created_at");
    printReceipt(sess, sum as Summary, (mv as Movement[]) ?? []);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Caixa" description="Abertura, movimentações e fechamento diário do caixa." helpKey="financeiro" />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="atual">Caixa atual</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="consolidado">Consolidado</TabsTrigger>
        </TabsList>

        <TabsContent value="atual" className="space-y-4">
          {loading ? (
            <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>
          ) : !openSession ? (
            <Card className="p-6 flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-2"><Lock className="h-4 w-4" /> Caixa fechado</div>
                <div className="text-sm text-muted-foreground">Abra o caixa informando o fundo de troco para começar a operar.</div>
              </div>
              <Button onClick={() => setOpenDlg(true)} className="bg-gradient-primary shadow-glow">
                <LockOpen className="h-4 w-4 mr-1" /> Abrir caixa
              </Button>
            </Card>
          ) : (
            <>
              <Card className="p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Caixa aberto</div>
                    <div className="text-xs text-muted-foreground">
                      Aberto em {fmtDT(openSession.opened_at)} · Fundo de troco {brl(Number(openSession.opening_amount))}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={() => { setMovDlg("suprimento"); setMovAmount(0); setMovReason(""); }}>
                      <TrendingUp className="h-4 w-4 mr-1" /> Suprimento
                    </Button>
                    <Button variant="outline" onClick={() => { setMovDlg("sangria"); setMovAmount(0); setMovReason(""); }}>
                      <TrendingDown className="h-4 w-4 mr-1" /> Sangria
                    </Button>
                    <Button variant="outline" onClick={loadOpen}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
                    <Button onClick={() => { setCountedCash(0); setCloseNotes(""); setCloseReveal(null); setCloseDlg(true); }}>
                      <Lock className="h-4 w-4 mr-1" /> Fechar caixa
                    </Button>
                  </div>
                </div>

                {summary && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
                    <Kpi label="Vendas em dinheiro" value={summary.sales_cash} />
                    <Kpi label="Recebimentos em dinheiro" value={summary.receivables_cash} />
                    <Kpi label="Suprimentos" value={summary.suprimentos} />
                    <Kpi label="Sangrias" value={-Math.abs(summary.sangrias)} />
                  </div>
                )}
                {summary && (
                  <div className="mt-3 p-3 rounded-md bg-muted/40 text-sm">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Esperado em dinheiro</div>
                    <div className="text-2xl font-semibold">{brl(Number(summary.expected_cash))}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Fundo + vendas em dinheiro + recebimentos em dinheiro + suprimentos − sangrias.
                    </div>
                  </div>
                )}
                {summary?.by_method?.length ? (
                  <div className="mt-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Conferência informativa por método</div>
                    <div className="flex flex-wrap gap-2">
                      {summary.by_method.map(m => (
                        <Badge key={m.method} variant="secondary">{m.method}: {brl(Number(m.amount))}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>

              <Card className="p-5">
                <div className="font-semibold mb-2">Movimentações desta sessão</div>
                {movements.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nenhuma sangria ou suprimento nesta sessão.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Quando</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Motivo</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map(m => (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs">{fmtDT(m.created_at)}</TableCell>
                          <TableCell>
                            <Badge variant={m.type === "sangria" ? "destructive" : "default"}>{m.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{brl(Number(m.amount))}</TableCell>
                          <TableCell className="text-sm">{m.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="historico" className="space-y-3">
          <Card className="p-4 flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={loadHistory}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
          </Card>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Abertura</TableHead>
                  <TableHead>Fechamento</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {histSessions.map(s => {
                  const diff = Number(s.difference ?? 0);
                  const diffClass = diff < 0 ? "text-red-600" : diff > 0 ? "text-blue-600" : "";
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{fmtDT(s.opened_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDT(s.closed_at)}</TableCell>
                      <TableCell className="text-xs">{operators[s.opened_by] ?? s.opened_by.slice(0,8)}</TableCell>
                      <TableCell className="text-right">{s.expected_cash != null ? brl(Number(s.expected_cash)) : "—"}</TableCell>
                      <TableCell className="text-right">{s.counted_cash != null ? brl(Number(s.counted_cash)) : "—"}</TableCell>
                      <TableCell className={`text-right font-medium ${diffClass}`}>{s.status === "fechado" ? brl(diff) : "—"}</TableCell>
                      <TableCell><Badge variant={s.status === "aberto" ? "default" : "secondary"}>{s.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {s.status === "fechado" && (
                          <Button size="sm" variant="ghost" onClick={() => openHistDetails(s)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {histSessions.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">Nenhuma sessão no período.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="consolidado" className="space-y-3">
          <Card className="p-4 flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => { loadHistory(); loadConsolidated(); }}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-4">
              <div className="font-semibold mb-2">Por dia</div>
              <Table>
                <TableHeader><TableRow><TableHead>Dia</TableHead><TableHead className="text-right">Sessões</TableHead><TableHead className="text-right">Esperado</TableHead><TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Diferença</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(consolidated?.by_day ?? []).map((r: any) => (
                    <TableRow key={r.d}>
                      <TableCell className="text-xs">{new Date(r.d).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{r.sessions_count}</TableCell>
                      <TableCell className="text-right">{brl(Number(r.expected_sum))}</TableCell>
                      <TableCell className="text-right">{brl(Number(r.counted_sum))}</TableCell>
                      <TableCell className={`text-right ${Number(r.diff_sum) < 0 ? "text-red-600" : Number(r.diff_sum) > 0 ? "text-blue-600" : ""}`}>{brl(Number(r.diff_sum))}</TableCell>
                    </TableRow>
                  ))}
                  {!consolidated?.by_day?.length && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">Sem dados no período.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>

            <Card className="p-4">
              <div className="font-semibold mb-2">Entradas por método</div>
              <Table>
                <TableHeader><TableRow><TableHead>Método</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(consolidated?.by_method ?? []).map((r: any) => (
                    <TableRow key={r.method}>
                      <TableCell>{r.method}</TableCell>
                      <TableCell className="text-right">{brl(Number(r.amount))}</TableCell>
                    </TableRow>
                  ))}
                  {!consolidated?.by_method?.length && <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-4">Sem dados.</TableCell></TableRow>}
                </TableBody>
              </Table>
              <div className="mt-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Suprimentos</span><span>{brl(Number(consolidated?.movements?.suprimentos ?? 0))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sangrias</span><span>{brl(Number(consolidated?.movements?.sangrias ?? 0))}</span></div>
                <div className="flex justify-between font-medium"><span>Soma das diferenças</span><span className={Number(consolidated?.diff_sum ?? 0) < 0 ? "text-red-600" : "text-blue-600"}>{brl(Number(consolidated?.diff_sum ?? 0))}</span></div>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="font-semibold mb-2">Ranking de quebra por operador</div>
            <Table>
              <TableHeader><TableRow><TableHead>Operador</TableHead><TableHead className="text-right">Sessões</TableHead><TableHead className="text-right">Diferença acumulada</TableHead></TableRow></TableHeader>
              <TableBody>
                {(consolidated?.by_operator ?? []).map((r: any) => (
                  <TableRow key={r.user_id}>
                    <TableCell>{operators[r.user_id] ?? String(r.user_id).slice(0,8)}</TableCell>
                    <TableCell className="text-right">{r.sessions_count}</TableCell>
                    <TableCell className={`text-right ${Number(r.diff_sum) < 0 ? "text-red-600" : Number(r.diff_sum) > 0 ? "text-blue-600" : ""}`}>{brl(Number(r.diff_sum))}</TableCell>
                  </TableRow>
                ))}
                {!consolidated?.by_operator?.length && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-4">Sem dados.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Open dialog */}
      <Dialog open={openDlg} onOpenChange={setOpenDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abrir caixa</DialogTitle><DialogDescription>Informe o fundo de troco disponível na gaveta.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Fundo de troco (R$)</Label><NumberInput value={openingAmount} onValueChange={setOpeningAmount} allowDecimal min={0} /></div>
            <div><Label>Observações</Label><Textarea value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} placeholder="Opcional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDlg(false)}>Cancelar</Button>
            <Button onClick={handleOpen} disabled={busy}>{busy ? "Abrindo…" : "Abrir caixa"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement dialog */}
      <Dialog open={!!movDlg} onOpenChange={(o) => !o && setMovDlg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{movDlg === "sangria" ? "Sangria" : "Suprimento"}</DialogTitle>
            <DialogDescription>{movDlg === "sangria" ? "Retirada de dinheiro do caixa." : "Entrada de dinheiro no caixa."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Valor (R$)</Label><NumberInput value={movAmount} onValueChange={setMovAmount} allowDecimal min={0} /></div>
            <div><Label>Motivo *</Label><Textarea value={movReason} onChange={(e) => setMovReason(e.target.value)} placeholder="Ex.: pagamento de fornecedor, reforço vindo da conta bancária…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovDlg(null)}>Cancelar</Button>
            <Button onClick={handleMovement} disabled={busy}>{busy ? "Registrando…" : "Registrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close dialog with blind count */}
      <Dialog open={closeDlg} onOpenChange={(o) => { setCloseDlg(o); if (!o) setCloseReveal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar caixa</DialogTitle>
            <DialogDescription>Conte o dinheiro da gaveta e informe o total. O sistema só revela o esperado depois da confirmação.</DialogDescription>
          </DialogHeader>
          {!closeReveal ? (
            <div className="space-y-3">
              <div><Label>Total contado em dinheiro (R$)</Label><NumberInput value={countedCash} onValueChange={setCountedCash} allowDecimal min={0} /></div>
              <div><Label>Observações</Label><Textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="Opcional agora — obrigatório se houver divergência" /></div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCloseDlg(false)}>Cancelar</Button>
                <Button onClick={handleCloseSubmit} disabled={busy}>{busy ? "Fechando…" : "Confirmar fechamento"}</Button>
              </DialogFooter>
            </div>
          ) : (
            <CloseReveal
              reveal={closeReveal}
              needsReason={Math.abs(closeReveal.diff) > DIFF_LIMIT}
              initialNote={closeNotes}
              sessionId={openSession?.id ?? null}
              onDone={async (note) => {
                if (note && openSession) {
                  await (supabase as any).from("cash_sessions").update({ notes: note }).eq("id", openSession.id);
                }
                setCloseDlg(false);
                setCloseReveal(null);
                toast.success("Caixa fechado.");
                await loadOpen();
                // fetch fresh session for receipt
                const { data } = await (supabase as any).from("cash_sessions").select("*").eq("id", openSession?.id).maybeSingle();
                if (data) printReceipt(data as Session, closeReveal.summary, movements);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${value < 0 ? "text-red-600" : ""}`}>{brl(value)}</div>
    </div>
  );
}

function CloseReveal({
  reveal, needsReason, initialNote, sessionId, onDone,
}: {
  reveal: { expected: number; counted: number; diff: number; summary: Summary };
  needsReason: boolean;
  initialNote: string;
  sessionId: string | null;
  onDone: (note?: string) => void;
}) {
  const [note, setNote] = useState(initialNote);
  const diff = reveal.diff;
  const diffLabel = diff === 0 ? "Sem diferença" : diff < 0 ? "Falta" : "Sobra";
  const diffClass = diff < 0 ? "text-red-600" : diff > 0 ? "text-blue-600" : "";
  const canFinalize = !needsReason || note.trim().length > 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Kpi label="Esperado" value={reveal.expected} />
        <Kpi label="Contado" value={reveal.counted} />
        <div className="rounded-md border p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{diffLabel}</div>
          <div className={`text-xl font-semibold mt-1 ${diffClass}`}>{brl(diff)}</div>
        </div>
      </div>
      {needsReason && (
        <div>
          <Label>Justificativa da diferença *</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explique a divergência (troco a mais/menos, erro de operador, sangria não registrada…)" />
        </div>
      )}
      <DialogFooter>
        <Button onClick={() => onDone(note.trim() || undefined)} disabled={!canFinalize}>
          <FileDown className="h-4 w-4 mr-1" /> Concluir e gerar comprovante
        </Button>
      </DialogFooter>
    </div>
  );
}