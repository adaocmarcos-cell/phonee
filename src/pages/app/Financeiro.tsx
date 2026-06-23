import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MetricCard } from "@/components/MetricCard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import {
  Wallet, TrendingUp, TrendingDown, Receipt, ArrowRight, Clock, CheckCircle2,
  AlertTriangle, Calendar as CalendarIcon, FileDown, Wrench, ShoppingCart,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Sale = { id: string; sale_number: number | null; total: number; created_at: string; payment_status: string; due_date: string | null; customer_name: string | null; payment_method: string };
type PartsSale = { id: string; total: number; created_at: string; payment_method: string; customer_name: string | null };
type ServiceOrder = { id: string; os_number: number | null; total_value: number; status: string; budget_status: string; created_at: string; customer_name: string };
type Expense = { id: string; amount: number; expense_date: string; description: string; category_name: string; payment_method: string };

type Receivable = {
  id: string; ref: string; source: "venda" | "peça" | "serviço";
  customer: string; total: number; date: string; due: string | null; status: "aberto" | "vencido" | "pago"; method: string;
};
type Payable = {
  id: string; description: string; category: string;
  total: number; date: string; status: "aberto" | "vencido" | "pago"; method: string;
};

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }

export default function Financeiro() {
  const { store } = useAuth();
  const navigate = useNavigate();

  const [from, setFrom] = useState(toInputDate(startOfMonth()));
  const [to, setTo] = useState(toInputDate(endOfMonth()));

  const [sales, setSales] = useState<Sale[]>([]);
  const [partsSales, setPartsSales] = useState<PartsSale[]>([]);
  const [os, setOs] = useState<ServiceOrder[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<{ method: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store) return;
    const load = async () => {
      setLoading(true);
      const fromIso = new Date(from + "T00:00:00").toISOString();
      const toIso = new Date(to + "T23:59:59").toISOString();
      const [{ data: s }, { data: ps }, { data: o }, { data: e }, { data: sp }] = await Promise.all([
        supabase.from("sales").select("id,sale_number,total,net_value,created_at,payment_status,due_date,customer_name,payment_method").eq("store_id", store.id).gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }),
        supabase.from("parts_sales").select("id,total,net_value,created_at,payment_method,customer_name").eq("store_id", store.id).gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }),
        supabase.from("service_orders").select("id,os_number,total_value,net_value,status,budget_status,created_at,customer_name").eq("store_id", store.id).gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }),
        (supabase as any).from("expenses").select("id,amount,expense_date,description,category_name,payment_method").eq("store_id", store.id).gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false }),
        (supabase as any).from("sale_payments").select("method,amount,created_at").eq("store_id", store.id).gte("created_at", fromIso).lte("created_at", toIso),
      ]);
      setSales((s as any) ?? []);
      setPartsSales((ps as any) ?? []);
      setOs((o as any) ?? []);
      setExpenses((e as any) ?? []);
      setSplits(((sp as any) ?? []).map((r: any) => ({ method: r.method, amount: Number(r.amount || 0) })));
      setLoading(false);
    };
    load();
  }, [store, from, to]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const receivables = useMemo<Receivable[]>(() => {
    const items: Receivable[] = [];
    sales.forEach((s) => {
      const isPaid = (s.payment_status ?? "pago").toLowerCase() === "pago";
      const dueDate = s.due_date ? new Date(s.due_date + "T00:00:00") : null;
      const status: Receivable["status"] = isPaid ? "pago" : dueDate && dueDate < today ? "vencido" : "aberto";
      items.push({
        id: s.id, ref: `#${s.sale_number ?? "—"}`, source: "venda",
        customer: s.customer_name || "—", total: Number((s as any).net_value ?? s.total ?? 0),
        date: s.created_at, due: s.due_date, status, method: s.payment_method,
      });
    });
    partsSales.forEach((p) => {
      items.push({
        id: p.id, ref: "peça", source: "peça",
        customer: p.customer_name || "—", total: Number((p as any).net_value ?? p.total ?? 0),
        date: p.created_at, due: null, status: "pago", method: p.payment_method,
      });
    });
    os.forEach((o) => {
      const concluida = ["concluida","concluído","entregue","finalizada","finalizado"].includes((o.status ?? "").toLowerCase());
      const status: Receivable["status"] = concluida ? "pago" : "aberto";
      const osVal = Number((o as any).net_value ?? o.total_value ?? 0);
      if (osVal > 0) {
        items.push({
          id: o.id, ref: `OS #${o.os_number ?? "—"}`, source: "serviço",
          customer: o.customer_name || "—", total: osVal,
          date: o.created_at, due: null, status, method: "—",
        });
      }
    });
    return items.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [sales, partsSales, os, today]);

  const payables = useMemo<Payable[]>(() => {
    return expenses.map((e) => {
      const expDate = new Date(e.expense_date + "T00:00:00");
      const status: Payable["status"] = expDate <= today ? "pago" : "aberto";
      return {
        id: e.id, description: e.description, category: e.category_name,
        total: Number(e.amount || 0), date: e.expense_date, status, method: e.payment_method,
      };
    });
  }, [expenses, today]);

  const totals = useMemo(() => {
    const receita = receivables.reduce((s, r) => s + r.total, 0);
    const recebido = receivables.filter((r) => r.status === "pago").reduce((s, r) => s + r.total, 0);
    const aReceber = receivables.filter((r) => r.status !== "pago").reduce((s, r) => s + r.total, 0);
    const vencidoReceber = receivables.filter((r) => r.status === "vencido").reduce((s, r) => s + r.total, 0);
    const despesa = payables.reduce((s, p) => s + p.total, 0);
    const pago = payables.filter((p) => p.status === "pago").reduce((s, p) => s + p.total, 0);
    const aPagar = payables.filter((p) => p.status !== "pago").reduce((s, p) => s + p.total, 0);
    const liquido = receita - despesa;
    return { receita, recebido, aReceber, vencidoReceber, despesa, pago, aPagar, liquido };
  }, [receivables, payables]);

  // Recebimentos por método (vendas com split + peças)
  const receiptsByMethod = useMemo(() => {
    const map = new Map<string, number>();
    splits.forEach((sp) => map.set(sp.method, (map.get(sp.method) ?? 0) + sp.amount));
    // Soma vendas sem split (legado) + peças
    const splitSaleTotal = splits.reduce((s, x) => s + x.amount, 0);
    if (splitSaleTotal === 0) {
      sales.forEach((s) => map.set(s.payment_method || "outro",
        (map.get(s.payment_method || "outro") ?? 0) + Number(s.total || 0)));
    }
    partsSales.forEach((p) => map.set(p.payment_method || "outro",
      (map.get(p.payment_method || "outro") ?? 0) + Number(p.total || 0)));
    return Array.from(map.entries())
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);
  }, [splits, sales, partsSales]);

  const StatusBadge = ({ s }: { s: "aberto" | "vencido" | "pago" }) =>
    s === "pago"
      ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Pago</Badge>
      : s === "vencido"
      ? <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30"><AlertTriangle className="h-3 w-3 mr-1" />Vencido</Badge>
      : <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30"><Clock className="h-3 w-3 mr-1" />Em aberto</Badge>;

  const sourceIcon = (src: Receivable["source"]) =>
    src === "venda" ? <Receipt className="h-3 w-3" /> : src === "peça" ? <ShoppingCart className="h-3 w-3" /> : <Wrench className="h-3 w-3" />;

  const exportReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Relatório Financeiro — ${store?.name ?? ""}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Período: ${new Date(from).toLocaleDateString("pt-BR")} → ${new Date(to).toLocaleDateString("pt-BR")}`, 14, 22);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 27);
    doc.setFontSize(10);
    doc.text(`Receita: ${brl(totals.receita)}  ·  Recebido: ${brl(totals.recebido)}  ·  A receber: ${brl(totals.aReceber)}`, 14, 34);
    doc.text(`Despesas: ${brl(totals.despesa)}  ·  Pago: ${brl(totals.pago)}  ·  A pagar: ${brl(totals.aPagar)}`, 14, 40);
    doc.setFontSize(11);
    doc.text(`Resultado líquido: ${brl(totals.liquido)}`, 14, 48);

    autoTable(doc, {
      startY: 54,
      head: [["Contas a Receber", "Cliente", "Origem", "Vencimento", "Status", "Valor"]],
      body: receivables.map((r) => [r.ref, r.customer, r.source, r.due ? new Date(r.due).toLocaleDateString("pt-BR") : "—", r.status, brl(r.total)]),
      styles: { fontSize: 8 },
    });
    autoTable(doc, {
      head: [["Contas a Pagar", "Categoria", "Forma", "Data", "Status", "Valor"]],
      body: payables.map((p) => [p.description, p.category, p.method, new Date(p.date).toLocaleDateString("pt-BR"), p.status, brl(p.total)]),
      styles: { fontSize: 8 },
    });
    doc.save(`financeiro-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Contas a pagar, a receber e resultado consolidado da loja."
        actions={
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[160px] mt-1" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[160px] mt-1" />
            </div>
            <Button variant="outline" onClick={exportReport}><FileDown className="h-4 w-4 mr-1" />Exportar PDF</Button>
          </div>
        }
      />

      {/* CTA Custos & Despesas (integração) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <button
          type="button"
          onClick={() => navigate("/painel/despesas")}
          className="sm:col-span-2 lg:col-span-2 rounded-xl bg-gradient-to-br from-rose-500 via-red-600 to-red-700 text-white shadow-glow hover:brightness-110 transition-all border border-red-500/60 px-6 py-5 flex items-center justify-between gap-3 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <span className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Custos & Despesas</span>
          <span className="flex items-center gap-2 text-sm font-normal text-white/90">
            {loading ? "…" : brl(totals.despesa)} no período
            <ArrowRight className="h-4 w-4" />
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/painel/vendas")}
          className="sm:col-span-2 lg:col-span-2 rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 text-white shadow-glow hover:brightness-110 transition-all border border-blue-500/60 px-6 py-5 flex items-center justify-between gap-3 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <span className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Vendas & Recebimentos</span>
          <span className="flex items-center gap-2 text-sm font-normal text-white/90">
            {loading ? "…" : brl(totals.receita)} no período
            <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="A receber" value={brl(totals.aReceber)} delta={`${receivables.filter(r => r.status !== "pago").length} título(s)`} icon={Clock} tone="warning" className="py-[18px]" />
        <MetricCard label="A pagar" value={brl(totals.aPagar)} delta={`${payables.filter(p => p.status !== "pago").length} título(s)`} icon={TrendingDown} tone="danger" className="py-[18px]" />
        <MetricCard label="Recebido" value={brl(totals.recebido)} delta="No período" icon={CheckCircle2} tone="success" className="py-[18px]" />
        <MetricCard label="Resultado líquido" value={brl(totals.liquido)} delta="Receita − Despesas" icon={Wallet} tone={totals.liquido >= 0 ? "info" : "danger"} className="py-[18px]" />
      </div>

      {/* Recebimentos por método */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Wallet className="h-4 w-4" />Recebimentos por método</h3>
          <span className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
            Total: {brl(receiptsByMethod.reduce((s, r) => s + r.total, 0))}
          </span>
        </div>
        {receiptsByMethod.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem recebimentos no período.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {receiptsByMethod.map((r) => (
              <div key={r.method} className="rounded-md bg-muted/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground capitalize">{r.method}</div>
                <div className="text-sm font-semibold metric">{brl(r.total)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Tabs defaultValue="receber" className="mb-3">
        <TabsList>
          <TabsTrigger value="receber" className="gap-2"><Clock className="h-3.5 w-3.5" />A Receber</TabsTrigger>
          <TabsTrigger value="pagar" className="gap-2"><TrendingDown className="h-3.5 w-3.5" />A Pagar</TabsTrigger>
          <TabsTrigger value="aberto" className="gap-2"><AlertTriangle className="h-3.5 w-3.5" />Em Aberto / Vencidos</TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-2"><FileDown className="h-3.5 w-3.5" />Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="receber">
          <Card className="bg-card border-border shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Ref</th>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium">Origem</th>
                  <th className="text-left px-4 py-3 font-medium">Forma</th>
                  <th className="text-left px-4 py-3 font-medium">Data</th>
                  <th className="text-left px-4 py-3 font-medium">Vencimento</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-muted-foreground font-mono">CARREGANDO…</td></tr>
                ) : receivables.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Nenhum recebível no período.</td></tr>
                ) : receivables.map((r) => (
                  <tr key={`${r.source}-${r.id}`} className="hover:bg-surface-elevated/40">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.ref}</td>
                    <td className="px-4 py-2.5">{r.customer}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] gap-1">{sourceIcon(r.source)}{r.source}</Badge></td>
                    <td className="px-4 py-2.5 capitalize text-xs">{r.method}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{new Date(r.date).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-xs font-mono">{r.due ? new Date(r.due).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge s={r.status} /></td>
                    <td className="px-4 py-2.5 text-right metric font-semibold">{brl(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="pagar">
          <Card className="bg-card border-border shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Despesas e contas a pagar</span>
              <Button size="sm" variant="outline" onClick={() => navigate("/painel/despesas")}>Lançar nova despesa <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 font-medium">Categoria</th>
                  <th className="text-left px-4 py-3 font-medium">Forma</th>
                  <th className="text-left px-4 py-3 font-medium">Data</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-xs text-muted-foreground font-mono">CARREGANDO…</td></tr>
                ) : payables.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Nenhuma despesa no período.</td></tr>
                ) : payables.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-elevated/40">
                    <td className="px-4 py-2.5 max-w-[320px] truncate" title={p.description}>{p.description}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{p.category}</Badge></td>
                    <td className="px-4 py-2.5 text-xs">{p.method}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{new Date(p.date).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge s={p.status} /></td>
                    <td className="px-4 py-2.5 text-right metric font-semibold text-danger">{brl(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="aberto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card border-border shadow-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest font-mono text-muted-foreground">A receber em aberto</span>
                <span className="text-sm font-semibold text-warning">{brl(totals.aReceber)}</span>
              </div>
              <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                {receivables.filter((r) => r.status !== "pago").length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum recebível em aberto.</div>
                ) : receivables.filter((r) => r.status !== "pago").map((r) => (
                  <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{r.customer} <span className="text-[11px] text-muted-foreground font-mono ml-1">{r.ref}</span></div>
                      <div className="text-[11px] text-muted-foreground font-mono">{r.due ? `vence ${new Date(r.due).toLocaleDateString("pt-BR")}` : "sem vencimento"}</div>
                    </div>
                    <StatusBadge s={r.status} />
                    <span className="metric font-semibold">{brl(r.total)}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="bg-card border-border shadow-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest font-mono text-muted-foreground">A pagar em aberto</span>
                <span className="text-sm font-semibold text-danger">{brl(totals.aPagar)}</span>
              </div>
              <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                {payables.filter((p) => p.status !== "pago").length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma conta a pagar pendente.</div>
                ) : payables.filter((p) => p.status !== "pago").map((p) => (
                  <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{p.description}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{p.category} · vence {new Date(p.date).toLocaleDateString("pt-BR")}</div>
                    </div>
                    <StatusBadge s={p.status} />
                    <span className="metric font-semibold text-danger">{brl(p.total)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="relatorios">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Resumo do período</span>
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Receita bruta</span><span className="metric font-semibold">{brl(totals.receita)}</span></div>
                <div className="flex justify-between"><span className="text-emerald-700">Recebido</span><span className="metric font-semibold text-emerald-700">{brl(totals.recebido)}</span></div>
                <div className="flex justify-between"><span className="text-amber-700">A receber</span><span className="metric font-semibold text-amber-700">{brl(totals.aReceber)}</span></div>
                <div className="flex justify-between"><span className="text-rose-700">Vencidos a receber</span><span className="metric font-semibold text-rose-700">{brl(totals.vencidoReceber)}</span></div>
                <div className="h-px bg-border my-2" />
                <div className="flex justify-between"><span>Despesas totais</span><span className="metric font-semibold text-danger">{brl(totals.despesa)}</span></div>
                <div className="flex justify-between"><span>Pago</span><span className="metric font-semibold">{brl(totals.pago)}</span></div>
                <div className="flex justify-between"><span>A pagar</span><span className="metric font-semibold">{brl(totals.aPagar)}</span></div>
                <div className="h-px bg-border my-2" />
                <div className="flex justify-between text-base font-semibold"><span>Resultado líquido</span><span className={`metric ${totals.liquido >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{brl(totals.liquido)}</span></div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Exportar / Compartilhar</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Gere um relatório consolidado em PDF com receitas, despesas, contas a pagar/receber e resultado líquido do período selecionado.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={exportReport} className="bg-gradient-primary shadow-glow"><FileDown className="h-4 w-4 mr-1" />Relatório completo (PDF)</Button>
                <Button variant="outline" onClick={() => navigate("/painel/despesas")}>Abrir Despesas</Button>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}