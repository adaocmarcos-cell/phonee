import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { handleSupabaseError } from "@/lib/supabaseFetch";
import { PackagePlus, ShoppingCart, PackageCheck, Send, Ban, MessageCircle, ArrowRight } from "lucide-react";
import {
  buildWaMeUrl, normalizeWhatsappPhone, renderWhatsappTemplate,
} from "@/lib/whatsappTemplates";

type Status = "aguardando" | "pedido_ao_fornecedor" | "chegou" | "entregue" | "cancelado";

type Row = {
  id: string;
  store_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_whatsapp: string | null;
  product_id: string | null;
  description: string;
  quantity: number;
  agreed_price: number;
  has_deposit: boolean;
  deposit_amount: number | null;
  deposit_method: string | null;
  deposit_consumed: boolean;
  expected_at: string | null;
  status: Status;
  purchase_order_id: string | null;
  sale_id: string | null;
  customer_notified_at: string | null;
  notes: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Status, string> = {
  aguardando: "Aguardando",
  pedido_ao_fornecedor: "Pedido ao fornecedor",
  chegou: "Chegou",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "outline" | "destructive"> = {
  aguardando: "secondary",
  pedido_ao_fornecedor: "outline",
  chegou: "default",
  entregue: "outline",
  cancelado: "destructive",
};

export default function Encomendas() {
  const { store, user } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Status | "todos">((sp.get("tab") as Status) || "aguardando");
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(sp.get("nova") === "1");
  const [openLink, setOpenLink] = useState<Row | null>(null);
  const [openCancel, setOpenCancel] = useState<Row | null>(null);
  const [openMsg, setOpenMsg] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!store?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("customer_orders")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) return handleSupabaseError(error, "Encomendas");
    setRows((data ?? []) as Row[]);
  }, [store?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const next = new URLSearchParams(sp);
    next.set("tab", tab);
    if (!openNew) next.delete("nova");
    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, openNew]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "todos" && r.status !== tab) return false;
      if (!q) return true;
      return (
        r.customer_name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.customer_whatsapp ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, tab, search]);

  const counts = useMemo(() => {
    const c: Record<Status | "todos" | "chegou_novo", number> = {
      todos: rows.length, aguardando: 0, pedido_ao_fornecedor: 0,
      chegou: 0, entregue: 0, cancelado: 0, chegou_novo: 0,
    };
    rows.forEach((r) => {
      c[r.status]++;
      if (r.status === "chegou" && !r.customer_notified_at) c.chegou_novo++;
    });
    return c;
  }, [rows]);

  const overdue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter(
      (r) => r.expected_at && r.expected_at < today &&
        (r.status === "aguardando" || r.status === "pedido_ao_fornecedor"),
    );
  }, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader title="Encomendas" description="Produtos que o cliente encomendou" helpKey="encomendas" />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setOpenNew(true)}>
          <PackagePlus className="h-4 w-4 mr-2" /> Nova encomenda
        </Button>
        <div className="flex-1" />
        <Input
          placeholder="Buscar por cliente, produto ou WhatsApp"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {(counts.chegou_novo > 0 || overdue.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {counts.chegou_novo > 0 && (
            <Card className="p-4 border-primary/40">
              <div className="flex items-center gap-3">
                <PackageCheck className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">{counts.chegou_novo} encomenda(s) chegou e o cliente ainda não foi avisado</div>
                  <div className="text-sm text-muted-foreground">Envie mensagem pelo WhatsApp na aba "Chegou".</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setTab("chegou")}>Ver</Button>
              </div>
            </Card>
          )}
          {overdue.length > 0 && (
            <Card className="p-4 border-destructive/40">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-destructive" />
                <div className="flex-1">
                  <div className="font-medium">{overdue.length} encomenda(s) com prazo vencido</div>
                  <div className="text-sm text-muted-foreground">Confira andamento com o fornecedor.</div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Status | "todos")}>
        <TabsList>
          <TabsTrigger value="aguardando">Aguardando ({counts.aguardando})</TabsTrigger>
          <TabsTrigger value="pedido_ao_fornecedor">Pedido ({counts.pedido_ao_fornecedor})</TabsTrigger>
          <TabsTrigger value="chegou">
            Chegou ({counts.chegou})
            {counts.chegou_novo > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5">{counts.chegou_novo}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="entregue">Entregue ({counts.entregue})</TabsTrigger>
          <TabsTrigger value="cancelado">Cancelado ({counts.cancelado})</TabsTrigger>
          <TabsTrigger value="todos">Todos ({counts.todos})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Sinal</TableHead>
                  <TableHead>Previsão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma encomenda neste status.</TableCell></TableRow>
                ) : filtered.map((r) => {
                  const total = Number(r.agreed_price) * r.quantity;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.customer_name}</div>
                        {r.customer_whatsapp && (
                          <div className="text-xs text-muted-foreground">{r.customer_whatsapp}</div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-sm">{r.description}</TableCell>
                      <TableCell className="text-right">{r.quantity}</TableCell>
                      <TableCell className="text-right">{brl(total)}</TableCell>
                      <TableCell className="text-right">
                        {r.has_deposit ? (
                          <div className="text-xs">
                            <div>{brl(Number(r.deposit_amount ?? 0))}</div>
                            <div className="text-muted-foreground">{r.deposit_method}</div>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{r.expected_at ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        {r.status === "chegou" && !r.customer_notified_at && (
                          <Badge variant="destructive" className="ml-1">avisar</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {(r.status === "aguardando" || r.status === "pedido_ao_fornecedor") && (
                            <Button size="sm" variant="outline" onClick={() => setOpenLink(r)}>
                              <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Pedir
                            </Button>
                          )}
                          {r.status === "chegou" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setOpenMsg(r)}>
                                <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                              </Button>
                              <Button size="sm" onClick={() => convertToSale(r, navigate)}>
                                <ArrowRight className="h-3.5 w-3.5 mr-1" /> Vender
                              </Button>
                            </>
                          )}
                          {r.status !== "entregue" && r.status !== "cancelado" && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOpenCancel(r)}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {openNew && (
        <NewOrderDialog
          storeId={store!.id}
          onClose={() => setOpenNew(false)}
          onCreated={() => { setOpenNew(false); void load(); }}
        />
      )}
      {openLink && (
        <LinkPurchaseDialog
          order={openLink}
          onClose={() => setOpenLink(null)}
          onDone={() => { setOpenLink(null); void load(); }}
        />
      )}
      {openCancel && (
        <CancelDialog
          order={openCancel}
          onClose={() => setOpenCancel(null)}
          onDone={() => { setOpenCancel(null); void load(); }}
        />
      )}
      {openMsg && (
        <NotifyDialog
          order={openMsg}
          storeName={store?.name ?? ""}
          onClose={() => setOpenMsg(null)}
          onSent={() => { setOpenMsg(null); void load(); }}
        />
      )}
    </div>
  );
}

function convertToSale(r: Row, navigate: ReturnType<typeof useNavigate>) {
  const params = new URLSearchParams({ encomenda: r.id });
  navigate(`/painel/vendas/nova?${params.toString()}`);
}

/* ---------- Nova encomenda ---------- */
function NewOrderDialog({ storeId, onClose, onCreated }: {
  storeId: string; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [whats, setWhats] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [hasDeposit, setHasDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositMethod, setDepositMethod] = useState("dinheiro");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !description.trim()) {
      toast.error("Preencha cliente e descrição do produto");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("create_customer_order", {
      _store_id: storeId,
      _customer_id: null,
      _customer_name: name.trim(),
      _customer_whatsapp: whats.trim() || null,
      _product_id: null,
      _description: description.trim(),
      _quantity: qty,
      _agreed_price: price,
      _expected_at: expected || null,
      _notes: notes.trim() || null,
      _has_deposit: hasDeposit,
      _deposit_amount: hasDeposit ? depositAmount : null,
      _deposit_method: hasDeposit ? depositMethod : null,
    });
    setSaving(false);
    if (error) return handleSupabaseError(error, "Criar encomenda");
    toast.success("Encomenda registrada");
    onCreated();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nova encomenda</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Cliente *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>WhatsApp</Label><Input value={whats} onChange={(e) => setWhats(e.target.value)} placeholder="(11) 99999-9999" /></div>
          </div>
          <div><Label>Descrição do produto *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: iPhone 15 Pro 256GB Preto" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Qtd</Label><NumberInput value={qty} onValueChange={(v) => setQty(Math.max(1, Math.floor(v || 1)))} /></div>
            <div><Label>Preço unit.</Label><NumberInput value={price} onValueChange={setPrice} /></div>
            <div><Label>Previsão</Label><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="dep" checked={hasDeposit} onCheckedChange={(v) => setHasDeposit(!!v)} />
            <Label htmlFor="dep" className="cursor-pointer">Cliente deixou sinal/entrada</Label>
          </div>
          {hasDeposit && (
            <div className="grid grid-cols-2 gap-3 pl-6 border-l-2 border-primary/30">
              <div><Label>Valor do sinal</Label><NumberInput value={depositAmount} onValueChange={setDepositAmount} /></div>
              <div>
                <Label>Forma</Label>
                <Select value={depositMethod} onValueChange={setDepositMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="debito">Débito</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {depositMethod === "dinheiro" && (
                <div className="col-span-2 text-xs text-muted-foreground">
                  Sinal em dinheiro será registrado como suprimento na sessão de caixa aberta.
                </div>
              )}
            </div>
          )}
          <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Registrar encomenda"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Vincular a pedido de compra ---------- */
function LinkPurchaseDialog({ order, onClose, onDone }: {
  order: Row; onClose: () => void; onDone: () => void;
}) {
  const [pos, setPos] = useState<{ id: string; supplier: string; status: string; created_at: string }[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, supplier, status, created_at")
        .eq("store_id", order.store_id)
        .in("status", ["rascunho", "enviado", "parcial"])
        .order("created_at", { ascending: false })
        .limit(50);
      setPos((data ?? []) as any);
    })();
  }, [order.store_id]);

  const submit = async () => {
    if (!selected) { toast.error("Selecione um pedido"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("link_customer_order_to_purchase", {
      _order_id: order.id, _purchase_order_id: selected,
    });
    setSaving(false);
    if (error) return handleSupabaseError(error, "Vincular pedido");
    toast.success("Encomenda vinculada");
    onDone();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular a um pedido de compra</DialogTitle>
          <DialogDescription>
            Escolha um pedido existente para {order.description}. Ao receber o pedido, esta encomenda vira "chegou" automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue placeholder="Pedidos em aberto" /></SelectTrigger>
            <SelectContent>
              {pos.length === 0 && <div className="p-2 text-sm text-muted-foreground">Nenhum pedido em aberto.</div>}
              {pos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.supplier} — {p.status} — {new Date(p.created_at).toLocaleDateString("pt-BR")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            Sem pedido em aberto? Crie um em Pedidos de Compra e volte aqui.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !selected}>Vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Cancelar ---------- */
function CancelDialog({ order, onClose, onDone }: {
  order: Row; onClose: () => void; onDone: () => void;
}) {
  const needsRefund = order.has_deposit && !order.deposit_consumed;
  const [mode, setMode] = useState<"devolver" | "vale">("devolver");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { toast.error("Motivo obrigatório"); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("cancel_customer_order", {
      _order_id: order.id,
      _refund_mode: needsRefund ? mode : null,
      _reason: reason.trim(),
    });
    setSaving(false);
    if (error) return handleSupabaseError(error, "Cancelar encomenda");
    if ((data as any)?.store_credit_code) {
      toast.success(`Vale-troca gerado: ${(data as any).store_credit_code}`);
    } else {
      toast.success("Encomenda cancelada");
    }
    onDone();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar encomenda</DialogTitle>
          {needsRefund && (
            <DialogDescription>
              Sinal de {brl(Number(order.deposit_amount ?? 0))} ({order.deposit_method}) precisa ser tratado.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          {needsRefund && (
            <div>
              <Label>O que fazer com o sinal?</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "devolver" | "vale")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="devolver">Devolver ao cliente (saída de caixa)</SelectItem>
                  <SelectItem value="vale">Converter em vale-troca</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Motivo *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>Confirmar cancelamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Avisar cliente por WhatsApp ---------- */
function NotifyDialog({ order, storeName, onClose, onSent }: {
  order: Row; storeName: string; onClose: () => void; onSent: () => void;
}) {
  const [body, setBody] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("body")
        .eq("store_id", order.store_id)
        .eq("event_key", "encomenda_chegou")
        .eq("is_active", true)
        .maybeSingle();
      const template = data?.body ??
        "Olá {cliente}! Sua encomenda chegou na {loja}: {produto}. Valor: {valor}. Sinal pago: {sinal}. Podemos combinar a retirada?";
      setBody(renderWhatsappTemplate(template, {
        cliente: order.customer_name,
        loja: storeName,
        aparelho: order.description,
        valor: brl(Number(order.agreed_price) * order.quantity),
        prazo: order.expected_at ?? "",
        parcela: order.has_deposit ? brl(Number(order.deposit_amount ?? 0)) : "R$ 0,00",
      } as any));
    })();
  }, [order, storeName]);

  const send = async () => {
    const phone = normalizeWhatsappPhone(order.customer_whatsapp);
    if (!phone) { toast.error("Cliente sem WhatsApp"); return; }
    window.open(buildWaMeUrl(phone, body), "_blank");
    await supabase.rpc("notify_customer_order", { _order_id: order.id });
    toast.success("Marcado como avisado");
    onSent();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Avisar cliente — encomenda chegou</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">
            <strong>{order.customer_name}</strong> — {order.customer_whatsapp || "sem número"}
          </div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} />
          <div className="text-xs text-muted-foreground">
            Configure o modelo padrão em Configurações → WhatsApp (evento: encomenda_chegou).
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button onClick={send}><Send className="h-4 w-4 mr-2" /> Abrir WhatsApp</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}