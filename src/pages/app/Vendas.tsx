import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canRegisterSale } from "@/contexts/AuthContext";
import { useHasPermission } from "@/hooks/useHasPermission";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodFilter, resolvePeriod, type PeriodValue, type CustomRange } from "@/components/PeriodFilter";
import { brl } from "@/lib/format";
import { Plus, Receipt, Search, FileDown, FileSpreadsheet, Printer, Activity, MessageCircle, CheckCircle2, Clock, AlertTriangle, Lock, Pencil, Banknote, CreditCard, Smartphone, Smartphone as PixIcon, FileText, Wallet, Users as UsersIcon, Truck, RotateCcw, Sliders, Eye } from "lucide-react";
import { WhatsappSendButton } from "@/components/WhatsappSendButton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MetricCard } from "@/components/MetricCard";
import { exportSalesPDF, exportSalesXLSX, printSaleReceipt } from "@/lib/salesExport";
import { loadWarrantySettings, type WarrantySettings } from "@/lib/warranty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select as Select2, SelectContent as Select2Content, SelectItem as Select2Item, SelectTrigger as Select2Trigger, SelectValue as Select2Value } from "@/components/ui/select";
import { toast } from "sonner";

const fmtNum = (n: number | null | undefined) => `#${String(n ?? 0).padStart(4, "0")}`;

const DEFAULT_REMINDER =
  "Olá {cliente}! Passando para lembrar da sua compra {numero} no valor de {valor} junto à {loja}, com vencimento em {vencimento}. Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem. Qualquer dúvida estamos à disposição.";

const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

const NET_REASONS = [
  "Taxa cartão de crédito",
  "Taxa cartão de débito",
  "Antecipação",
  "Cashback / desconto",
  "Outro",
];

const eff = (s: any) => Number(s?.net_value ?? s?.total ?? 0);

export default function Vendas() {
  const { store, role } = useAuth();
  const { allowed: canDeleteSale } = useHasPermission("vendas", "excluir");
  const navigate = useNavigate();
  const [sales, setSales] = useState<any[]>([]);
  const [trocaSplits, setTrocaSplits] = useState<{ amount: number }[]>([]);
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [periodCustom, setPeriodCustom] = useState<CustomRange>({});
  const [payment, setPayment] = useState<string>("all");
  const [q, setQ] = useState("");
  const [warranty, setWarranty] = useState<WarrantySettings | null>(null);
  const [tab, setTab] = useState<"all" | "receber">("all");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderSale, setReminderSale] = useState<any | null>(null);
  const [reminderText, setReminderText] = useState("");
  const [receiverOpen, setReceiverOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustSale, setAdjustSale] = useState<any | null>(null);
  const [adjustNet, setAdjustNet] = useState<string>("");
  const [adjustReason, setAdjustReason] = useState<string>("Taxa cartão de crédito");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSale, setDetailsSale] = useState<any | null>(null);
  const [detailsItems, setDetailsItems] = useState<any[] | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const openDetails = async (sale: any) => {
    setDetailsSale(sale);
    setDetailsItems(null);
    setDetailsOpen(true);
    setDetailsLoading(true);
    const { data, error } = await supabase
      .from("sale_items")
      .select("quantity, unit_price, total, description, is_service, name, sku, category, brand, model, unit, discount_amount, imei_serial, warranty_days")
      .eq("sale_id", sale.id);
    setDetailsLoading(false);
    if (error) { toast.error(error.message); return; }
    setDetailsItems(data ?? []);
  };
  const tplKey = store ? `phonee.salesReminder.${store.id}` : "phonee.salesReminder";
  const legacyTplKey = store ? `mobileplus.salesReminder.${store.id}` : "mobileplus.salesReminder";
  const getTemplate = () => {
    try {
      const cur = localStorage.getItem(tplKey);
      if (cur) return cur;
      const legacy = localStorage.getItem(legacyTplKey);
      if (legacy) {
        try { localStorage.setItem(tplKey, legacy); localStorage.removeItem(legacyTplKey); } catch {}
        return legacy;
      }
      return DEFAULT_REMINDER;
    } catch { return DEFAULT_REMINDER; }
  };

  useEffect(() => {
    if (!store) return;
    loadWarrantySettings(store.id).then(setWarranty);
  }, [store]);

  const load = async () => {
    if (!store) return;
    let query = supabase.from("sales").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(500);
    const { from, to } = resolvePeriod(period, periodCustom);
    if (period === "custom" && (!from || !to)) { setSales([]); setTrocaSplits([]); return; }
    if (from) query = query.gte("created_at", from.toISOString());
    if (period !== "all" && to) query = query.lte("created_at", to.toISOString());
    const { data: s } = await query;
    setSales(s ?? []);
    // Recebido em aparelhos (troca) — soma de sale_payments.method='troca' no período
    let tq = (supabase as any).from("sale_payments").select("amount,created_at").eq("store_id", store.id).eq("method", "troca");
    if (from) tq = tq.gte("created_at", from.toISOString());
    if (period !== "all" && to) tq = tq.lte("created_at", to.toISOString());
    const { data: tp } = await tq;
    setTrocaSplits(((tp as any[]) ?? []).map((r) => ({ amount: Number(r.amount || 0) })));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store, period, periodCustom]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (payment !== "all" && s.payment_method !== payment) return false;
      if (tab === "receber" && s.payment_status !== "pendente") return false;
      if (q) {
        const needle = q.toLowerCase();
        const num = fmtNum(s.sale_number).toLowerCase();
        if (
          !String(s.customer_name || "").toLowerCase().includes(needle) &&
          !num.includes(needle) &&
          !String(s.sale_number ?? "").includes(needle.replace(/^#?0*/, ""))
        ) return false;
      }
      return true;
    });
  }, [sales, payment, q, tab]);

  const total = filtered.reduce((a, b) => a + Number(b.total || 0), 0);
  const totalLiquido = filtered.reduce((a, b) => a + eff(b), 0);
  const trocaTotal = trocaSplits.reduce((a, b) => a + b.amount, 0);
  const cashTotal = Math.max(0, totalLiquido - trocaTotal);
  const pendingSales = useMemo(() => sales.filter((s) => s.payment_status === "pendente"), [sales]);
  const pendingTotal = pendingSales.reduce((a, b) => a + eff(b), 0);
  const overdueCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return pendingSales.filter((s) => s.due_date && new Date(s.due_date + "T00:00:00") < today).length;
  }, [pendingSales]);

  const paymentBreakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    sales.forEach((s) => {
      const k = s.payment_method || "outro";
      if (!map[k]) map[k] = { count: 0, total: 0 };
      map[k].count += 1;
      map[k].total += eff(s);
    });
    return map;
  }, [sales]);

  const receivablesByCustomer = useMemo(() => {
    const map = new Map<string, { name: string; whatsapp: string | null; count: number; total: number; nextDue: string | null }>();
    pendingSales.forEach((s) => {
      const key = (s.customer_name || "Avulso").toLowerCase();
      const cur = map.get(key) ?? { name: s.customer_name || "Avulso", whatsapp: s.customer_whatsapp || null, count: 0, total: 0, nextDue: null };
      cur.count += 1;
      cur.total += eff(s);
      if (s.due_date && (!cur.nextDue || s.due_date < cur.nextDue)) cur.nextDue = s.due_date;
      if (!cur.whatsapp && s.customer_whatsapp) cur.whatsapp = s.customer_whatsapp;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [pendingSales]);

  const pmLabel: Record<string, string> = {
    dinheiro: "Dinheiro", pix: "PIX", debito: "Débito", credito: "Crédito", boleto: "Boleto", outro: "Outros",
  };
  const pmIcon: Record<string, any> = {
    dinheiro: Banknote, pix: PixIcon, debito: CreditCard, credito: CreditCard, boleto: FileText, outro: Wallet,
  };
  const pmTone: Record<string, "primary" | "success" | "warning" | "info" | "violet"> = {
    dinheiro: "success", pix: "info", debito: "primary", credito: "violet", boleto: "warning", outro: "primary",
  };

  const periodLabel = (() => {
    const map: Record<string, string> = { "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", "90d": "Últimos 90 dias", "1y": "Último ano", "all": "Tudo", "custom": "Personalizado" };
    return map[period] || period;
  })();

  const onExportPDF = () => {
    if (filtered.length === 0) return;
    exportSalesPDF({ storeName: store?.name || "", periodLabel, sales: filtered });
  };
  const onExportXLSX = () => {
    if (filtered.length === 0) return;
    exportSalesXLSX({ periodLabel, sales: filtered });
  };

  const onPrintReceipt = async (sale: any) => {
    const { data: items } = await supabase
      .from("sale_items")
      .select("quantity, unit_price, total, description, is_service, name, sku, category, brand, model, unit, discount_amount, imei_serial, public_notes")
      .eq("sale_id", sale.id);
    if (!items || items.length === 0) {
      toast.error("Esta venda não possui itens registrados.");
      return;
    }
    const list = items.map((it: any) => ({
      name: it.name || it.description || (it.is_service ? "Serviço" : "Item"),
      sku: it.sku || (it.is_service ? "SERVIÇO" : null),
      category: it.category ?? null,
      brand: it.brand ?? null,
      model: it.model ?? null,
      unit: it.unit ?? null,
      imei_serial: it.imei_serial ?? null,
      public_notes: it.public_notes ?? null,
      discount_amount: Number(it.discount_amount || 0),
      quantity: it.quantity,
      unit_price: Number(it.unit_price),
      total: Number(it.total),
    }));
    // Carrega trade-ins vinculados a esta venda (troca como pagamento)
    let tradeIns: any[] = [];
    try {
      const { data: pays } = await (supabase as any)
        .from("sale_payments")
        .select("amount, trade_in_id")
        .eq("sale_id", sale.id)
        .eq("method", "troca");
      const ids = (pays ?? []).map((p: any) => p.trade_in_id).filter(Boolean);
      if (ids.length > 0) {
        const { data: tis } = await supabase
          .from("trade_ins")
          .select("id, brand, model, imei, storage_gb, entry_value")
          .in("id", ids);
        tradeIns = (tis ?? []).map((t: any) => {
          const pay = (pays ?? []).find((p: any) => p.trade_in_id === t.id);
          return {
            brand: t.brand, model: t.model, imei: t.imei, storage_gb: t.storage_gb,
            value: Number(pay?.amount || t.entry_value || 0),
          };
        });
      }
    } catch { /* noop */ }
    printSaleReceipt({ sale, items: list, store, warranty, tradeIns });
  };

  const openReminder = (sale: any) => {
    if (!sale.customer_whatsapp) {
      toast.error("Cliente sem WhatsApp cadastrado nesta venda.");
      return;
    }
    setReminderSale(sale);
    const tpl = getTemplate();
    const due = sale.due_date ? new Date(sale.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—";
    const msg = tpl
      .replace(/\{cliente\}/g, sale.customer_name || "cliente")
      .replace(/\{numero\}/g, fmtNum(sale.sale_number))
      .replace(/\{valor\}/g, brl(Number(sale.total || 0)))
      .replace(/\{vencimento\}/g, due)
      .replace(/\{loja\}/g, store?.name || "");
    setReminderText(msg);
    setReminderOpen(true);
  };

  const sendReminder = async () => {
    if (!reminderSale) return;
    try { localStorage.setItem(tplKey, reminderText); } catch {}
    const phone = onlyDigits(reminderSale.customer_whatsapp);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(reminderText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    await supabase.from("sales").update({ last_reminder_sent_at: new Date().toISOString() }).eq("id", reminderSale.id);
    toast.success("Lembrete aberto no WhatsApp");
    setReminderOpen(false);
    setReminderSale(null);
    load();
  };

  const markPaid = async (sale: any) => {
    const { error } = await supabase.from("sales").update({ payment_status: "pago" }).eq("id", sale.id);
    if (error) return toast.error(error.message);
    toast.success("Venda marcada como paga");
    load();
  };

  const openAdjust = (sale: any) => {
    setAdjustSale(sale);
    setAdjustNet(sale.net_value != null ? String(sale.net_value) : String(sale.total ?? ""));
    setAdjustReason(sale.net_value_reason || (sale.payment_method === "debito" ? "Taxa cartão de débito" : "Taxa cartão de crédito"));
    setAdjustOpen(true);
  };

  const saveAdjust = async () => {
    if (!adjustSale) return;
    const v = Number(String(adjustNet).replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return toast.error("Informe um valor líquido válido");
    const { error } = await (supabase.from("sales") as any).update({
      net_value: v,
      net_value_reason: adjustReason || null,
    }).eq("id", adjustSale.id);
    if (error) return toast.error(error.message);
    toast.success("Valor líquido atualizado · financeiro sincronizado");
    setAdjustOpen(false);
    setAdjustSale(null);
    load();
  };

  const estornarVenda = async (sale: any) => {
    // 1. Buscar itens da venda para devolver ao estoque
    const { data: items, error: itemsErr } = await supabase
      .from("sale_items")
      .select("product_id, quantity")
      .eq("sale_id", sale.id);
    if (itemsErr) return toast.error("Erro ao ler itens: " + itemsErr.message);

    // 2. Devolver quantidade ao estoque (produto a produto)
    for (const it of items ?? []) {
      if (!it.product_id) continue;
      const { data: prod } = await supabase.from("products").select("stock_current").eq("id", it.product_id).maybeSingle();
      const novoEstoque = Number(prod?.stock_current ?? 0) + Number(it.quantity || 0);
      const { error: updErr } = await supabase.from("products").update({ stock_current: novoEstoque }).eq("id", it.product_id);
      if (updErr) return toast.error("Erro ao devolver estoque: " + updErr.message);
    }

    // 3. Registrar ajuste de estoque (auditoria) por item
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    for (const it of items ?? []) {
      if (!it.product_id) continue;
      await (supabase as any).from("stock_adjustments").insert({
        store_id: sale.store_id,
        item_kind: "product",
        product_id: it.product_id,
        item_name: `Estorno venda #${sale.sale_number ?? "-"}`,
        qty_change: Number(it.quantity || 0),
        prev_stock: 0,
        new_stock: 0,
        reason: "correcao",
        justification: `Estorno da venda #${sale.sale_number ?? sale.id.slice(0,8)} — ${brl(Number(sale.total || 0))}`,
        user_id: uid,
      });
    }

    // 4. Excluir a venda (cascade remove sale_items) — debita o faturamento
    const { error: delErr } = await supabase.from("sales").delete().eq("id", sale.id);
    if (delErr) return toast.error("Erro ao estornar venda: " + delErr.message);

    toast.success(`Venda #${sale.sale_number ?? ""} estornada · estoque atualizado`);
    load();
  };

  const today0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  return (
    <div className="lg:text-[90%]">
      <PageHeader
        title="Vendas"
        description="Histórico de vendas e PDV rápido."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => navigate("/painel/estoque/relatorio")} title="Inventário em tempo real">
              <Activity className="h-4 w-4 mr-1 text-success" />Estoque em tempo real
            </Button>
            <Button variant="outline" onClick={onExportPDF} disabled={filtered.length === 0}>
              <FileDown className="h-4 w-4 mr-1" />PDF
            </Button>
            <Button variant="outline" onClick={onExportXLSX} disabled={filtered.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
            </Button>
          </div>
        }
      />
      {/* Dashboard de vendas — padrão visual do Dashboard principal */}
      {canRegisterSale(role) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <button
            type="button"
            onClick={() => navigate("/painel/vendas/nova")}
            className="sm:col-span-2 lg:col-span-4 rounded-xl bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground shadow-glow hover:brightness-110 transition-all border border-primary/60 px-6 py-5 flex items-center justify-center gap-2 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Plus className="h-5 w-5" />
            Nova venda
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          label="Total vendido"
          value={brl(total)}
          delta={`${filtered.length} venda(s)`}
          icon={Receipt}
          tone="primary"
          className="py-[18px]"
        />
        <MetricCard
          label="Recebido em caixa"
          value={brl(cashTotal)}
          delta="Dinheiro, PIX, cartão, boleto"
          icon={Banknote}
          tone="success"
          className="py-[18px]"
        />
        <MetricCard
          label="Recebido em aparelhos (troca)"
          value={brl(trocaTotal)}
          delta={`${trocaSplits.length} aparelho(s) recebido(s)`}
          icon={Smartphone}
          tone="violet"
          className="py-[18px]"
        />
        <button
          type="button"
          onClick={() => { setTab("receber"); setReceiverOpen(true); }}
          className="text-left focus:outline-none focus:ring-2 focus:ring-primary rounded-xl"
          title="Ver clientes com vendas em aberto"
        >
          <MetricCard
            label="A receber"
            value={brl(pendingTotal)}
            delta={`${pendingSales.length} venda(s) · ${overdueCount} vencida(s)`}
            icon={Wallet}
            tone={overdueCount > 0 ? "danger" : "warning"}
            className="py-[18px]"
          />
        </button>
        {(["dinheiro", "pix", "debito", "credito", "boleto"] as const).slice(0, 3).map((m) => {
          const d = paymentBreakdown[m];
          return (
            <MetricCard
              key={m}
              label={pmLabel[m]}
              value={brl(d?.total || 0)}
              delta={`${d?.count || 0} venda(s)`}
              icon={pmIcon[m]}
              tone={pmTone[m]}
              className="py-[18px]"
            />
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-3">
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="receber" className="gap-2">
            <Clock className="h-3.5 w-3.5" /> Financeiro · A receber
            {pendingSales.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-warning/20 text-warning text-[10px] font-bold">
                {pendingSales.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "receber" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {(["credito", "boleto"] as const).map((m) => {
            const d = paymentBreakdown[m];
            return (
              <MetricCard
                key={m}
                label={pmLabel[m]}
                value={brl(d?.total || 0)}
                delta={`${d?.count || 0} venda(s)`}
                icon={pmIcon[m]}
                tone={pmTone[m]}
                className="py-[18px]"
              />
            );
          })}
        </div>
      )}

      <Card className="bg-card border-border shadow-card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nº da venda ou cliente" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-8" />
        </div>
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          options={["7d", "30d", "90d", "1y", "all", "custom"]}
          custom={periodCustom}
          onCustomChange={setPeriodCustom}
          showLabel={false}
        />
        <Select value={payment} onValueChange={setPayment}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos pagamentos</SelectItem>
            <SelectItem value="dinheiro">Dinheiro</SelectItem>
            <SelectItem value="pix">PIX</SelectItem>
            <SelectItem value="debito">Débito</SelectItem>
            <SelectItem value="credito">Crédito</SelectItem>
            <SelectItem value="boleto">Boleto</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs font-mono text-muted-foreground">
          {filtered.length} venda(s) · <span className="text-foreground font-semibold">{brl(total)}</span>
          {totalLiquido !== total && (
            <span> · líq. <span className="text-emerald-700 font-semibold">{brl(totalLiquido)}</span></span>
          )}
        </div>
      </Card>

      <Card className="bg-card border-border shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nº</th>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Pagamento</th>
                {tab === "receber" && <th className="text-left px-4 py-3 font-medium">Vencimento</th>}
                {tab === "receber" && <th className="text-left px-4 py-3 font-medium">Situação</th>}
                <th className="text-right px-4 py-3 font-medium">Desconto</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-right px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => {
                const due = s.due_date ? new Date(s.due_date + "T00:00:00") : null;
                const overdue = due && due < today0;
                return (
                <tr key={s.id} className="hover:bg-surface-elevated/40">
                  <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{fmtNum(s.sale_number)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3">{s.customer_name || <span className="text-muted-foreground">Avulso</span>}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="capitalize text-xs">{s.payment_method}</Badge></td>
                  {tab === "receber" && (
                    <td className="px-4 py-3 font-mono text-xs">
                      {due ? due.toLocaleDateString("pt-BR") : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  {tab === "receber" && (
                    <td className="px-4 py-3">
                      {overdue ? (
                        <Badge className="bg-danger/15 text-danger border-danger/30"><AlertTriangle className="h-3 w-3 mr-1" />Vencida</Badge>
                      ) : (
                        <Badge className="bg-warning/15 text-warning border-warning/30"><Clock className="h-3 w-3 mr-1" />Em aberto</Badge>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right metric text-muted-foreground">{brl(Number(s.discount))}</td>
                  <td className="px-4 py-3 text-right metric font-semibold">
                    {brl(Number(s.total))}
                    {s.net_value != null && Number(s.net_value) !== Number(s.total) && (
                      <div className="text-[10px] font-mono text-emerald-700">
                        líq. {brl(Number(s.net_value))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {(s.payment_method === "credito" || s.payment_method === "debito") && (
                        <Button size="icon" variant="ghost" title="Ajustar valor líquido (taxas de cartão)" onClick={() => openAdjust(s)}>
                          <Sliders className="h-4 w-4 text-info" />
                        </Button>
                      )}
                      {s.payment_status === "pendente" && (
                        <>
                          <Button size="icon" variant="ghost" title="Enviar lembrete WhatsApp" onClick={() => openReminder(s)}>
                            <MessageCircle className="h-4 w-4 text-success" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Marcar como pago" onClick={() => markPaid(s)}>
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          </Button>
                        </>
                      )}
                      <Button size="icon" variant="ghost" title="Imprimir comprovante" onClick={() => onPrintReceipt(s)}>
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Ver itens da venda" onClick={() => openDetails(s)}>
                        <Eye className="h-4 w-4 text-info" />
                      </Button>
                      {canRegisterSale(role) && (
                        <Button size="icon" variant="ghost" title="Editar venda" onClick={() => navigate(`/painel/vendas/${s.id}/editar`)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canRegisterSale(role) && canDeleteSale && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" title="Estornar venda">
                              <RotateCcw className="h-4 w-4 text-danger" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Estornar venda #{s.sale_number}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O valor de <strong>{brl(Number(s.total))}</strong> será debitado do faturamento e os itens
                                voltarão ao estoque automaticamente. Esta ação é registrada na auditoria.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => estornarVenda(s)} className="bg-danger text-danger-foreground hover:bg-danger/90">
                                Confirmar estorno
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3 text-success" />
        <span>Dados protegidos com segurança e criptografia.</span>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Itens da venda {detailsSale ? fmtNum(detailsSale.sale_number) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
              <div>Cliente: <strong className="text-foreground">{detailsSale?.customer_name || "Avulso"}</strong></div>
              <div>Pagamento: <strong className="text-foreground capitalize">{detailsSale?.payment_method}</strong>{detailsSale?.installments > 1 ? ` · ${detailsSale.installments}x` : ""}</div>
              <div>Data: <strong className="text-foreground">{detailsSale ? new Date(detailsSale.created_at).toLocaleString("pt-BR") : ""}</strong></div>
              <div>Total: <strong className="text-foreground">{detailsSale ? brl(Number(detailsSale.total)) : ""}</strong></div>
            </div>
            {detailsLoading ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Carregando itens…</div>
            ) : !detailsItems || detailsItems.length === 0 ? (
              <div className="text-sm text-danger py-6 text-center">Nenhum item vinculado a esta venda.</div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Código</th>
                      <th className="text-left px-3 py-2 font-medium">Descrição</th>
                      <th className="text-right px-3 py-2 font-medium">Qtd</th>
                      <th className="text-right px-3 py-2 font-medium">Unit.</th>
                      <th className="text-right px-3 py-2 font-medium">Desc.</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detailsItems.map((it: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono text-xs">{it.sku || (it.is_service ? "SERVIÇO" : "—")}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{it.name || it.description || "—"}</div>
                          {(it.brand || it.model || it.category || it.imei_serial) && (
                            <div className="text-[11px] text-muted-foreground">
                              {[it.brand, it.model, it.category].filter(Boolean).join(" · ")}
                              {it.imei_serial ? ` · IMEI/Serial: ${it.imei_serial}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{it.quantity} {it.unit || ""}</td>
                        <td className="px-3 py-2 text-right font-mono">{brl(Number(it.unit_price))}</td>
                        <td className="px-3 py-2 text-right font-mono text-warning">{Number(it.discount_amount) > 0 ? `- ${brl(Number(it.discount_amount))}` : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{brl(Number(it.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            {detailsSale && (
              <Button variant="outline" onClick={() => { setDetailsOpen(false); onPrintReceipt(detailsSale); }}>
                <Printer className="h-4 w-4 mr-2" /> Imprimir comprovante
              </Button>
            )}
            <Button onClick={() => setDetailsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-success" />
              Lembrete via WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Cliente: <strong className="text-foreground">{reminderSale?.customer_name || "—"}</strong> ·
              Venda: <strong className="text-foreground">{reminderSale ? fmtNum(reminderSale.sale_number) : ""}</strong> ·
              WhatsApp: <strong className="text-foreground font-mono">{reminderSale?.customer_whatsapp || "—"}</strong>
            </div>

            {/* Prévia estilo WhatsApp */}
            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                Prévia da mensagem
              </Label>
              <div
                className="mt-1 rounded-lg p-3 border border-emerald-200"
                style={{
                  backgroundColor: "#e7f5ec",
                  backgroundImage:
                    "radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)",
                  backgroundSize: "14px 14px",
                }}
              >
                <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-sm bg-[#dcf8c6] text-slate-900 px-3 py-2 shadow-sm relative">
                  <div className="text-[10px] font-semibold text-emerald-700 mb-1">
                    {store?.name || "Sua loja"}
                  </div>
                  <div className="text-[13px] whitespace-pre-wrap leading-snug">
                    {reminderText || "—"}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                    <span>{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <CheckCircle2 className="h-3 w-3 text-sky-500" />
                  </div>
                </div>
                {reminderSale && (
                  <div className="mt-2 text-[10px] text-emerald-900/70 text-right font-mono">
                    Venda {fmtNum(reminderSale.sale_number)} · {brl(Number(reminderSale.total || 0))}
                    {reminderSale.due_date && ` · vence ${new Date(reminderSale.due_date + "T00:00:00").toLocaleDateString("pt-BR")}`}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground flex items-center gap-1">
                <Pencil className="h-3 w-3" /> Editar mensagem
              </Label>
              <Textarea rows={6} value={reminderText} onChange={(e) => setReminderText(e.target.value)} className="mt-1 text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">
                Mensagem padrão amigável e dentro da lei (lembrete cordial, sem cobrança coercitiva). Será salva como padrão para próximos envios.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>Cancelar</Button>
            <Button onClick={sendReminder} className="bg-success text-success-foreground hover:bg-success/90">
              <MessageCircle className="h-4 w-4 mr-1" />Abrir no WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clientes com vendas em aberto */}
      <Dialog open={receiverOpen} onOpenChange={setReceiverOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-warning" />
              Clientes com vendas em aberto · {brl(pendingTotal)}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {receivablesByCustomer.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nenhum cliente com vendas em aberto.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Cliente</th>
                    <th className="text-left px-3 py-2 font-medium">Próx. venc.</th>
                    <th className="text-right px-3 py-2 font-medium">Vendas</th>
                    <th className="text-right px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receivablesByCustomer.map((c) => {
                    const due = c.nextDue ? new Date(c.nextDue + "T00:00:00") : null;
                    const overdue = due && due < today0;
                    return (
                      <tr key={c.name} className="hover:bg-surface-elevated/40">
                        <td className="px-3 py-2">
                          <div className="font-medium">{c.name}</div>
                          {c.whatsapp && <div className="text-[11px] text-muted-foreground font-mono">{c.whatsapp}</div>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {due ? (
                            <span className={overdue ? "text-danger" : "text-foreground"}>
                              {due.toLocaleDateString("pt-BR")}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right metric">{c.count}</td>
                        <td className="px-3 py-2 text-right metric font-semibold text-warning">{brl(c.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiverOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rodapé: aviso discreto sobre Catálogo de Fornecedores */}
      <div className="mt-8 pt-4 border-t border-border/60 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Truck className="h-3.5 w-3.5 text-primary/70 shrink-0" />
        <span>
          <span className="font-medium text-foreground/80">Em breve · Catálogo de Fornecedores</span> — gratuito, exclusivo para Gestores. Fornecedores de todas as categorias em diversos estados do Brasil.
        </span>
      </div>

      {/* Ajustar valor líquido — taxas de cartão */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-info" />
              Ajustar valor líquido · Venda {adjustSale ? fmtNum(adjustSale.sale_number) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 p-3 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Total bruto da venda</span><span className="metric font-semibold">{adjustSale ? brl(Number(adjustSale.total)) : "—"}</span></div>
              <div className="flex justify-between mt-1"><span className="text-muted-foreground">Pagamento</span><span className="font-mono capitalize">{adjustSale?.payment_method}</span></div>
            </div>
            <div>
              <Label>Valor líquido recebido (R$)</Label>
              <NumberInput min={0} value={Number(adjustNet) || 0} onValueChange={(n) => setAdjustNet(String(n))} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Será refletido em Financeiro, Dashboard e relatórios automaticamente.
              </p>
            </div>
            <div>
              <Label>Motivo do abatimento</Label>
              <Select2 value={adjustReason} onValueChange={setAdjustReason}>
                <Select2Trigger><Select2Value /></Select2Trigger>
                <Select2Content>
                  {NET_REASONS.map((r) => <Select2Item key={r} value={r}>{r}</Select2Item>)}
                </Select2Content>
              </Select2>
            </div>
            {adjustSale && Number(adjustNet) > 0 && (
              <div className="text-xs flex justify-between rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <span className="text-amber-700">Diferença (taxa)</span>
                <span className="metric text-amber-700">{brl(Math.max(0, Number(adjustSale.total) - Number(adjustNet)))}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button onClick={saveAdjust}>Salvar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}