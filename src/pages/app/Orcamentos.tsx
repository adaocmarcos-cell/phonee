import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/NumberInput";
import { MetricCard } from "@/components/MetricCard";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { brl } from "@/lib/format";
import { printQuote, quoteWhatsappText, type QuoteDoc } from "@/lib/quotePrint";
import { buildWaMeUrl, normalizeWhatsappPhone } from "@/lib/whatsappTemplates";
import { useNavigate } from "react-router-dom";
import {
  FileText, Plus, Printer, MessageCircle, Trash2, CheckCircle2, XCircle, ShoppingCart, Search, Clock,
} from "lucide-react";

type Quote = {
  id: string; quote_number: number | null; customer_name: string | null; customer_phone: string | null;
  status: string; valid_until: string; subtotal: number; discount: number; total: number;
  notes: string | null; created_at: string; sale_id: string | null;
};
type Item = {
  key: string; product_id?: string | null; description: string; quantity: number;
  unit_price: number; discount_amount: number; is_service: boolean;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  aberto: { label: "Aberto", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  aceito: { label: "Aceito", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  recusado: { label: "Recusado", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  expirado: { label: "Expirado", cls: "bg-muted text-muted-foreground" },
  convertido: { label: "Convertido em venda", cls: "bg-primary/10 text-primary border-primary/20" },
};

const newItem = (): Item => ({
  key: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0, discount_amount: 0, is_service: false,
});

export default function Orcamentos() {
  const { store } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("todos");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [validDays, setValidDays] = useState(7);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([newItem()]);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("quotes").select("*").eq("store_id", store.id)
      .order("created_at", { ascending: false }).limit(200);
    setQuotes((data as Quote[]) ?? []);
    setLoading(false);
  }, [store]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!store || search.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from("products").select("id,name,sale_price,sku,stock_current")
        .eq("store_id", store.id).ilike("name", `%${search.trim()}%`).limit(8);
      setResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [search, store]);

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + Math.max(i.quantity * i.unit_price - i.discount_amount, 0), 0),
    [items],
  );
  const total = Math.max(subtotal - discount, 0);

  const filtered = useMemo(
    () => (statusFilter === "todos" ? quotes : quotes.filter((q) => q.status === statusFilter)),
    [quotes, statusFilter],
  );

  const kpis = useMemo(() => {
    const abertos = quotes.filter((q) => q.status === "aberto");
    const aceitos = quotes.filter((q) => q.status === "aceito" || q.status === "convertido");
    const emitidos = quotes.length || 1;
    return {
      abertos: abertos.length,
      valorAberto: abertos.reduce((s, q) => s + Number(q.total), 0),
      convertidos: aceitos.length,
      taxa: Math.round((aceitos.length / emitidos) * 100),
    };
  }, [quotes]);

  const resetForm = () => {
    setCustomerName(""); setCustomerPhone(""); setValidDays(7);
    setDiscount(0); setNotes(""); setItems([newItem()]); setSearch(""); setResults([]);
  };

  const addProduct = (p: any) => {
    setItems((prev) => {
      const base = prev.filter((i) => i.description.trim() !== "" || i.unit_price > 0);
      return [...base, {
        key: crypto.randomUUID(), product_id: p.id, description: p.name,
        quantity: 1, unit_price: Number(p.sale_price) || 0, discount_amount: 0, is_service: false,
      }];
    });
    setSearch(""); setResults([]);
  };

  const save = async () => {
    if (!store) return;
    const clean = items
      .filter((i) => i.description.trim() !== "")
      .map((i) => ({
        product_id: i.product_id ?? null, description: i.description.trim(), is_service: i.is_service,
        quantity: i.quantity, unit_price: i.unit_price, discount_amount: i.discount_amount,
      }));
    if (clean.length === 0) { toast({ title: "Adicione ao menos um item", variant: "destructive" }); return; }
    if (discount > subtotal) { toast({ title: "Desconto maior que o total", variant: "destructive" }); return; }

    setSaving(true);
    const { data, error } = await (supabase as any).rpc("create_quote", {
      _store_id: store.id, _items: clean, _customer_id: null,
      _customer_name: customerName || null, _customer_phone: customerPhone || null,
      _discount: discount, _valid_days: validDays, _notes: notes || null,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Orçamento nº ${(data as any)?.quote_number} criado`, description: brl(Number((data as any)?.total ?? 0)) });
    setOpen(false); resetForm(); load();
  };

  const loadDoc = async (q: Quote): Promise<QuoteDoc | null> => {
    const { data } = await (supabase as any)
      .from("quote_items").select("description,quantity,unit_price,discount_amount,total,is_service")
      .eq("quote_id", q.id).order("created_at");
    if (!data) return null;
    return { ...q, items: data as any };
  };

  const onPrint = async (q: Quote) => {
    const doc = await loadDoc(q);
    if (!doc || !store) return;
    if (!printQuote(doc, store as any)) toast({ title: "Libere pop-ups para imprimir", variant: "destructive" });
  };

  const onWhats = async (q: Quote) => {
    const doc = await loadDoc(q);
    if (!doc || !store) return;
    const phone = normalizeWhatsappPhone(q.customer_phone);
    if (!phone) { toast({ title: "Cliente sem WhatsApp cadastrado", variant: "destructive" }); return; }
    window.open(buildWaMeUrl(phone, quoteWhatsappText(doc, store.name)), "_blank");
  };

  const setStatus = async (q: Quote, status: string) => {
    const { error } = await (supabase as any).rpc("quote_set_status", { _quote_id: q.id, _status: status, _sale_id: null });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, status } : x)));
  };

  const toPdv = async (q: Quote) => {
    const doc = await loadDoc(q);
    if (!doc) return;
    sessionStorage.setItem("pdv_prefill_quote", JSON.stringify({ quote_id: q.id, ...doc }));
    navigate("/painel/vendas/nova?orcamento=" + q.id);
  };

  const remove = async (q: Quote) => {
    const { error } = await (supabase as any).from("quotes").delete().eq("id", q.id);
    if (error) { toast({ title: "Sem permissão para excluir", description: error.message, variant: "destructive" }); return; }
    setQuotes((prev) => prev.filter((x) => x.id !== q.id));
  };

  const isExpired = (q: Quote) => q.status === "aberto" && new Date(q.valid_until) < new Date(new Date().toDateString());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orçamentos"
        description="Monte propostas, envie pelo WhatsApp e converta em venda quando o cliente aprovar."
        actions={<Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo orçamento</Button>}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Em aberto" value={String(kpis.abertos)} delta="Aguardando resposta" icon={Clock} tone="info" />
        <MetricCard label="Valor em negociação" value={brl(kpis.valorAberto)} delta="Somatório dos abertos" icon={FileText} />
        <MetricCard label="Aprovados" value={String(kpis.convertidos)} delta="Aceitos + convertidos" icon={CheckCircle2} tone="success" />
        <MetricCard label="Taxa de aprovação" value={`${kpis.taxa}%`} delta="Sobre todos emitidos" icon={ShoppingCart} tone="success" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {["todos", "aberto", "aceito", "convertido", "recusado", "expirado"].map((s) => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
            {s === "todos" ? "Todos" : STATUS[s].label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Carregando…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">Nenhum orçamento aqui</p>
          <p className="text-sm text-muted-foreground">Crie uma proposta e envie direto no WhatsApp do cliente.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((q) => (
            <Card key={q.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">Nº {q.quote_number ?? "—"}</span>
                    <Badge variant="outline" className={STATUS[q.status]?.cls}>{STATUS[q.status]?.label ?? q.status}</Badge>
                    {isExpired(q) && <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Validade vencida</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 truncate">
                    {q.customer_name || "Consumidor"} · válido até {new Date(q.valid_until).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{brl(Number(q.total))}</p>
                  {Number(q.discount) > 0 && <p className="text-xs text-muted-foreground">desconto {brl(Number(q.discount))}</p>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap mt-3">
                <Button size="sm" variant="outline" onClick={() => onPrint(q)}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>
                <Button size="sm" variant="outline" onClick={() => onWhats(q)}><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</Button>
                {q.status !== "convertido" && (
                  <Button size="sm" onClick={() => toPdv(q)}><ShoppingCart className="h-4 w-4 mr-1" />Converter em venda</Button>
                )}
                {q.status === "aberto" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setStatus(q, "aceito")}><CheckCircle2 className="h-4 w-4 mr-1" />Aceito</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(q, "recusado")}><XCircle className="h-4 w-4 mr-1" />Recusado</Button>
                  </>
                )}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(q)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo orçamento</DialogTitle>
            <DialogDescription>Busque produtos do estoque ou lance itens e serviços manualmente.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Cliente</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <Label>Validade (dias)</Label>
                <NumberInput value={validDays} onValueChange={setValidDays} allowDecimal={false} min={0} />
              </div>
            </div>

            <div>
              <Label>Buscar produto no estoque</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite ao menos 2 letras…" />
              </div>
              {results.length > 0 && (
                <Card className="mt-2 divide-y">
                  {results.map((p) => (
                    <button key={p.id} type="button" onClick={() => addProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between gap-3">
                      <span className="truncate">{p.name}</span>
                      <span className="text-sm text-muted-foreground shrink-0">{brl(Number(p.sale_price))}</span>
                    </button>
                  ))}
                </Card>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Itens</Label>
                <Button size="sm" variant="outline" onClick={() => setItems((p) => [...p, newItem()])}>
                  <Plus className="h-4 w-4 mr-1" />Item manual
                </Button>
              </div>
              {items.map((it, idx) => (
                <Card key={it.key} className="p-3 grid gap-2 sm:grid-cols-12 items-end">
                  <div className="sm:col-span-5">
                    <Label className="text-xs">Descrição</Label>
                    <Input value={it.description}
                      onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))}
                      placeholder="Produto ou serviço" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Qtd</Label>
                    <NumberInput value={it.quantity} allowDecimal={false} min={1}
                      onValueChange={(v) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, quantity: Math.max(v, 1) } : x)))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Unitário</Label>
                    <NumberInput value={it.unit_price} min={0}
                      onValueChange={(v) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, unit_price: v } : x)))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Desconto</Label>
                    <NumberInput value={it.discount_amount} min={0}
                      onValueChange={(v) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, discount_amount: v } : x)))} />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <Button size="icon" variant="ghost" className="text-destructive"
                      onClick={() => setItems((p) => (p.length === 1 ? [newItem()] : p.filter((_, i) => i !== idx)))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Desconto no total</Label>
                <NumberInput value={discount} min={0} onValueChange={setDiscount} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Condições, prazo de entrega…" />
              </div>
            </div>

            <Card className="p-3 flex justify-between items-center bg-muted/40">
              <span className="text-sm text-muted-foreground">Subtotal {brl(subtotal)} · desconto {brl(discount)}</span>
              <span className="text-xl font-bold">{brl(total)}</span>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar orçamento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
