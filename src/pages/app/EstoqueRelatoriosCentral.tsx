import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeCost } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, RefreshCw, FileDown, ChevronDown, FileText, FileSpreadsheet, Printer,
  Calendar as CalendarIcon, ArrowDownUp, Repeat, Boxes, TrendingUp, MoonStar, AlertTriangle,
  DollarSign, Search, Wifi, ShieldCheck,
} from "lucide-react";
import { brl, num } from "@/lib/format";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

type ReportKey =
  | "in_out" | "transfers" | "balances" | "top_movers"
  | "stalled" | "low_stock" | "financial" | "by_product";

const REPORTS: { key: ReportKey; label: string; icon: any; desc: string }[] = [
  { key: "in_out",     label: "Entradas & Saídas",        icon: ArrowDownUp, desc: "Movimentações do período" },
  { key: "transfers",  label: "Transferências",           icon: Repeat,      desc: "Entre lojas/depósitos" },
  { key: "balances",   label: "Saldos em Estoque",        icon: Boxes,       desc: "Foto atual do estoque" },
  { key: "top_movers", label: "Maior Giro",               icon: TrendingUp,  desc: "Produtos mais vendidos" },
  { key: "stalled",    label: "Sem Movimentação",         icon: MoonStar,    desc: "Sem saídas no período" },
  { key: "low_stock",  label: "Abaixo do Mínimo",         icon: AlertTriangle, desc: "Reposição urgente" },
  { key: "financial",  label: "Visão Financeira",         icon: DollarSign,  desc: "Custo · Venda · Lucro" },
  { key: "by_product", label: "Movimentação por Produto", icon: Search,      desc: "Linha do tempo individual" },
];

function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0); }
function endOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Movement = {
  id: string;
  date: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  category: string | null;
  brand: string | null;
  supplier: string | null;
  qty: number; // + entrada / - saida
  kind: "venda" | "compra" | "ajuste" | "os" | "troca" | "transfer_in" | "transfer_out";
  unit_cost: number;
  unit_price: number;
};

export default function EstoqueRelatoriosCentral() {
  const { store, role } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const showCost = canSeeCost(role as any);

  const initialTab = (sp.get("tab") as ReportKey) || "in_out";
  const [tab, setTab] = useState<ReportKey>(initialTab);
  useEffect(() => { setSp((p) => { p.set("tab", tab); return p; }, { replace: true }); }, [tab]); // eslint-disable-line

  // Filters
  const [startDate, setStartDate] = useState(toInputDate(startOfMonth()));
  const [endDate, setEndDate] = useState(toInputDate(endOfMonth()));
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [supplier, setSupplier] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>(""); // for "by_product"

  const periodStart = useMemo(() => new Date(startDate + "T00:00:00"), [startDate]);
  const periodEnd   = useMemo(() => new Date(endDate + "T23:59:59"),   [endDate]);

  // Data
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [movs, setMovs] = useState<Movement[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [liveDot, setLiveDot] = useState(false);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const startIso = periodStart.toISOString();
    const endIso = periodEnd.toISOString();

    const [{ data: prods }, { data: saleItems }, { data: adjustments }, { data: osParts }, { data: trIn }, { data: trOut }] = await Promise.all([
      supabase.from("products")
        .select("id, name, sku, brand, category, supplier, stock_current, stock_min, cost_price, sale_price, last_sold_at, created_at")
        .eq("store_id", store.id).range(0, 49999),
      supabase.from("sale_items")
        .select("id, product_id, qty, unit_price, sales!inner(store_id, created_at)")
        .eq("sales.store_id", store.id)
        .gte("sales.created_at", startIso).lte("sales.created_at", endIso),
      supabase.from("stock_adjustments")
        .select("id, item_kind, product_id, item_name, qty_change, reason, created_at")
        .eq("store_id", store.id)
        .gte("created_at", startIso).lte("created_at", endIso),
      supabase.from("service_order_parts")
        .select("id, part_id, qty, created_at")
        .eq("store_id", store.id)
        .gte("created_at", startIso).lte("created_at", endIso),
      supabase.from("product_transfers")
        .select("id, from_product_id, to_product_id, quantity, note, created_at, from_store_id, to_store_id")
        .eq("to_store_id", store.id)
        .gte("created_at", startIso).lte("created_at", endIso),
      supabase.from("product_transfers")
        .select("id, from_product_id, to_product_id, quantity, note, created_at, from_store_id, to_store_id")
        .eq("from_store_id", store.id)
        .gte("created_at", startIso).lte("created_at", endIso),
    ]);

    setProducts(prods ?? []);
    const map = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p]));

    const list: Movement[] = [];
    (saleItems ?? []).forEach((r: any) => {
      const p = map.get(r.product_id) || {};
      list.push({
        id: `sale_${r.id}`, date: r.sales?.created_at,
        product_id: r.product_id, product_name: p.name ?? "Produto removido",
        sku: p.sku ?? null, category: p.category ?? null, brand: p.brand ?? null, supplier: p.supplier ?? null,
        qty: -Number(r.qty || 0), kind: "venda",
        unit_cost: Number(p.cost_price || 0), unit_price: Number(r.unit_price || p.sale_price || 0),
      });
    });
    (adjustments ?? []).filter((r: any) => r.item_kind === "product").forEach((r: any) => {
      const p = map.get(r.product_id) || {};
      const qc = Number(r.qty_change || 0);
      list.push({
        id: `adj_${r.id}`, date: r.created_at,
        product_id: r.product_id, product_name: p.name ?? r.item_name ?? "—",
        sku: p.sku ?? null, category: p.category ?? null, brand: p.brand ?? null, supplier: p.supplier ?? null,
        qty: qc, kind: qc >= 0 ? (r.reason === "entrada_manual" ? "compra" : "ajuste") : "ajuste",
        unit_cost: Number(p.cost_price || 0), unit_price: Number(p.sale_price || 0),
      });
    });
    (trIn ?? []).forEach((r: any) => {
      const p = map.get(r.to_product_id || r.from_product_id) || {};
      list.push({
        id: `trin_${r.id}`, date: r.created_at, product_id: r.to_product_id ?? r.from_product_id,
        product_name: p.name ?? "—", sku: p.sku ?? null, category: p.category ?? null,
        brand: p.brand ?? null, supplier: p.supplier ?? null,
        qty: Number(r.quantity || 0), kind: "transfer_in",
        unit_cost: Number(p.cost_price || 0), unit_price: Number(p.sale_price || 0),
      });
    });
    (trOut ?? []).forEach((r: any) => {
      const p = map.get(r.from_product_id) || {};
      list.push({
        id: `trout_${r.id}`, date: r.created_at, product_id: r.from_product_id,
        product_name: p.name ?? "—", sku: p.sku ?? null, category: p.category ?? null,
        brand: p.brand ?? null, supplier: p.supplier ?? null,
        qty: -Number(r.quantity || 0), kind: "transfer_out",
        unit_cost: Number(p.cost_price || 0), unit_price: Number(p.sale_price || 0),
      });
    });
    setMovs(list);
    setTransfers([...(trIn ?? []).map((t: any) => ({ ...t, direction: "in" })), ...(trOut ?? []).map((t: any) => ({ ...t, direction: "out" }))]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store, startDate, endDate]);

  // Realtime sync
  useEffect(() => {
    if (!store) return;
    const ch = supabase
      .channel(`estoque-reports-${store.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `store_id=eq.${store.id}` }, () => { setLiveDot(true); load(); setTimeout(()=>setLiveDot(false), 1200); })
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_adjustments", filter: `store_id=eq.${store.id}` }, () => { setLiveDot(true); load(); setTimeout(()=>setLiveDot(false), 1200); })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `store_id=eq.${store.id}` }, () => { setLiveDot(true); load(); setTimeout(()=>setLiveDot(false), 1200); })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_transfers" }, () => { setLiveDot(true); load(); setTimeout(()=>setLiveDot(false), 1200); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [store?.id]); // eslint-disable-line

  // Filter helpers
  const matchTextProduct = (p: any) => {
    if (q && !`${p.name} ${p.sku ?? ""} ${p.brand ?? ""} ${p.supplier ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (brand !== "all" && (p.brand ?? "—") !== brand) return false;
    if (category !== "all" && (p.category ?? "—") !== category) return false;
    if (supplier !== "all" && (p.supplier ?? "—") !== supplier) return false;
    return true;
  };
  const matchMov = (m: Movement) => {
    if (q && !`${m.product_name} ${m.sku ?? ""} ${m.brand ?? ""} ${m.supplier ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (brand !== "all" && (m.brand ?? "—") !== brand) return false;
    if (category !== "all" && (m.category ?? "—") !== category) return false;
    if (supplier !== "all" && (m.supplier ?? "—") !== supplier) return false;
    return true;
  };

  // Distinct facets
  const brands = useMemo(() => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort(), [products]);
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(), [products]);
  const suppliers = useMemo(() => Array.from(new Set(products.map((p) => p.supplier).filter(Boolean))).sort(), [products]);

  // Aggregations
  const filteredMovs = useMemo(() => movs.filter(matchMov), [movs, q, brand, category, supplier]);
  const filteredProds = useMemo(() => products.filter(matchTextProduct), [products, q, brand, category, supplier]);

  const movByDay = useMemo(() => {
    const m = new Map<string, { day: string; entradas: number; saidas: number }>();
    filteredMovs.forEach((x) => {
      const day = x.date?.slice(0, 10) ?? "—";
      const cur = m.get(day) || { day, entradas: 0, saidas: 0 };
      if (x.qty >= 0) cur.entradas += x.qty; else cur.saidas += -x.qty;
      m.set(day, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [filteredMovs]);

  const topMovers = useMemo(() => {
    const m = new Map<string, { id: string; name: string; sku: string | null; sold: number; revenue: number; cost: number }>();
    filteredMovs.filter((x) => x.kind === "venda").forEach((x) => {
      const k = x.product_id ?? x.product_name;
      const cur = m.get(k) || { id: k!, name: x.product_name, sku: x.sku, sold: 0, revenue: 0, cost: 0 };
      cur.sold += -x.qty;
      cur.revenue += -x.qty * x.unit_price;
      cur.cost += -x.qty * x.unit_cost;
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.sold - a.sold).slice(0, 100);
  }, [filteredMovs]);

  const stalled = useMemo(() => {
    const sold = new Set(filteredMovs.filter((x) => x.kind === "venda").map((x) => x.product_id));
    return filteredProds.filter((p) => !sold.has(p.id) && (p.stock_current || 0) > 0);
  }, [filteredProds, filteredMovs]);

  const lowStock = useMemo(() => filteredProds.filter((p) => (p.stock_current || 0) <= (p.stock_min || 0)), [filteredProds]);

  const financial = useMemo(() => {
    let cost = 0, sale = 0, profit = 0, units = 0;
    filteredProds.forEach((p) => {
      const u = Number(p.stock_current) || 0;
      units += u;
      cost += u * Number(p.cost_price || 0);
      sale += u * Number(p.sale_price || 0);
      profit += u * (Number(p.sale_price || 0) - Number(p.cost_price || 0));
    });
    return { cost, sale, profit, units, items: filteredProds.length, avgCost: filteredProds.length ? cost / Math.max(units, 1) : 0 };
  }, [filteredProds]);

  const byProductTimeline = useMemo(() => {
    if (!productFilter) return [];
    const id = productFilter;
    return filteredMovs.filter((m) => m.product_id === id).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [filteredMovs, productFilter]);

  // Exports — generic helper
  const buildExportData = (): { title: string; header: string[]; body: any[][] } => {
    if (tab === "in_out") {
      return {
        title: "Entradas e Saídas",
        header: ["Data", "Produto", "SKU", "Categoria", "Tipo", "Qtd", "Valor"],
        body: filteredMovs.map((m) => [
          new Date(m.date).toLocaleString("pt-BR"),
          m.product_name, m.sku ?? "", m.category ?? "",
          kindLabel(m.kind), m.qty, (m.qty * (m.qty >= 0 ? m.unit_cost : m.unit_price)).toFixed(2),
        ]),
      };
    }
    if (tab === "transfers") {
      return {
        title: "Transferências",
        header: ["Data", "Direção", "Quantidade", "Observação"],
        body: transfers.map((t: any) => [new Date(t.created_at).toLocaleString("pt-BR"), t.direction === "in" ? "Entrada" : "Saída", t.quantity, t.note ?? ""]),
      };
    }
    if (tab === "balances") {
      return {
        title: "Saldos em Estoque",
        header: ["Produto", "SKU", "Marca", "Categoria", "Estoque", "Mín"],
        body: filteredProds.map((p) => [p.name, p.sku ?? "", p.brand ?? "", p.category ?? "", p.stock_current, p.stock_min]),
      };
    }
    if (tab === "top_movers") {
      return {
        title: "Maior Giro",
        header: ["Produto", "SKU", "Vendidos", "Receita", "Custo"],
        body: topMovers.map((t) => [t.name, t.sku ?? "", t.sold, t.revenue.toFixed(2), t.cost.toFixed(2)]),
      };
    }
    if (tab === "stalled") {
      return {
        title: "Sem Movimentação",
        header: ["Produto", "SKU", "Marca", "Estoque", "Última venda"],
        body: stalled.map((p) => [p.name, p.sku ?? "", p.brand ?? "", p.stock_current, p.last_sold_at ? new Date(p.last_sold_at).toLocaleDateString("pt-BR") : "—"]),
      };
    }
    if (tab === "low_stock") {
      return {
        title: "Abaixo do Mínimo",
        header: ["Produto", "SKU", "Marca", "Estoque", "Mín", "Sugestão"],
        body: lowStock.map((p) => [p.name, p.sku ?? "", p.brand ?? "", p.stock_current, p.stock_min, Math.max((p.stock_min || 0) * 2 - (p.stock_current || 0), 1)]),
      };
    }
    if (tab === "financial") {
      return {
        title: "Visão Financeira",
        header: ["Produto", "SKU", "Estoque", "Custo unit.", "Venda unit.", "Valor custo", "Valor venda", "Lucro potencial"],
        body: filteredProds.map((p) => {
          const u = Number(p.stock_current) || 0;
          const cp = Number(p.cost_price || 0), sp = Number(p.sale_price || 0);
          return [p.name, p.sku ?? "", u, cp.toFixed(2), sp.toFixed(2), (u * cp).toFixed(2), (u * sp).toFixed(2), (u * (sp - cp)).toFixed(2)];
        }),
      };
    }
    // by_product
    return {
      title: "Movimentação Individual",
      header: ["Data", "Tipo", "Qtd", "Valor unit."],
      body: byProductTimeline.map((m) => [new Date(m.date).toLocaleString("pt-BR"), kindLabel(m.kind), m.qty, (m.qty >= 0 ? m.unit_cost : m.unit_price).toFixed(2)]),
    };
  };

  const exportPdf = () => {
    const { title, header, body } = buildExportData();
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`${title} — ${store?.name ?? ""}`, 14, 16);
    doc.setFontSize(9); doc.text(`${periodStart.toLocaleDateString("pt-BR")} → ${periodEnd.toLocaleDateString("pt-BR")} · ${new Date().toLocaleString("pt-BR")}`, 14, 22);
    autoTable(doc, { head: [header], body: body as any[], startY: 28, styles: { fontSize: 8 } });
    doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };
  const exportCsv = () => {
    const { title, header, body } = buildExportData();
    const esc = (v: any) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [header, ...body].map((r) => r.map(esc).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const exportExcel = () => {
    const { title, header, body } = buildExportData();
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 28));
    XLSX.writeFile(wb, `${title.toLowerCase().replace(/\s+/g, "-")}.xlsx`);
  };
  const exportPrint = () => {
    const { title, header, body } = buildExportData();
    const win = window.open("", "_blank"); if (!win) return toast.error("Bloqueio de pop-up");
    const rows = body.map((r) => `<tr>${r.map((c) => `<td>${String(c ?? "")}</td>`).join("")}</tr>`).join("");
    win.document.write(`<html><head><title>${title}</title><style>body{font-family:system-ui;padding:24px;color:#111}h1{font-size:18px;margin:0 0 6px}.meta{font-size:11px;color:#555;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f3f4f6}</style></head><body><h1>${title} — ${store?.name ?? ""}</h1><div class="meta">${periodStart.toLocaleDateString("pt-BR")} → ${periodEnd.toLocaleDateString("pt-BR")}</div><table><thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  const totalEntradas = filteredMovs.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0);
  const totalSaidas = filteredMovs.filter((m) => m.qty < 0).reduce((s, m) => s + -m.qty, 0);

  return (
    <div>
      <PageHeader
        title="Relatório de Estoque"
        description="Atualização em tempo real · filtros avançados · exportação"
        actions={
          <div className="flex gap-2 items-center">
            <span className={`inline-flex items-center gap-1 text-[11px] font-mono ${liveDot ? "text-success" : "text-muted-foreground"}`}>
              <Wifi className="h-3 w-3" /> {liveDot ? "atualizando" : "ao vivo"}
            </span>
            <Button variant="outline" onClick={() => navigate("/painel/estoque")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <Button variant="outline" onClick={() => navigate("/painel/estoque/auditoria-pdf")} className="border-primary/40 text-primary hover:bg-primary/10">
              <ShieldCheck className="h-4 w-4 mr-1" /> Auditoria PDF
            </Button>
            <Button variant="outline" onClick={load} title="Recarregar"><RefreshCw className="h-4 w-4" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-gradient-primary shadow-glow"><FileDown className="h-4 w-4 mr-1" /> Exportar <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-80" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={exportPdf}><FileText className="h-4 w-4 mr-2" /> PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv}><FileDown className="h-4 w-4 mr-2" /> CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={exportPrint}><Printer className="h-4 w-4 mr-2" /> Imprimir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Filters */}
      <Card className="p-3 mb-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div>
            <Label className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Início</Label>
            <div className="relative mt-1"><CalendarIcon className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 pl-8" />
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Fim</Label>
            <div className="relative mt-1"><CalendarIcon className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 pl-8" />
            </div>
          </div>
          <div className="col-span-2">
            <Label className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Buscar</Label>
            <div className="relative mt-1"><Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="produto · SKU · marca · fornecedor" className="h-9 pl-8" />
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Marca</Label>
            <Select value={brand} onValueChange={setBrand}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{brands.map((b: any) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Categoria</Label>
            <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{categories.map((c: any) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Fornecedor</Label>
            <Select value={supplier} onValueChange={setSupplier}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{suppliers.map((s: any) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="md:col-span-4 flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setStartDate(toInputDate(startOfMonth())); setEndDate(toInputDate(endOfMonth())); }}>Mês atual</Button>
            <Button size="sm" variant="ghost" onClick={() => { const d=new Date(); d.setDate(d.getDate()-7); setStartDate(toInputDate(d)); setEndDate(toInputDate(new Date())); }}>Últimos 7d</Button>
            <Button size="sm" variant="ghost" onClick={() => { const d=new Date(); d.setDate(d.getDate()-30); setStartDate(toInputDate(d)); setEndDate(toInputDate(new Date())); }}>Últimos 30d</Button>
            <Button size="sm" variant="ghost" onClick={() => { setQ(""); setBrand("all"); setCategory("all"); setSupplier("all"); }}>Limpar</Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KPI label="Entradas" value={num(totalEntradas)} sub="período" tone="success" />
        <KPI label="Saídas" value={num(totalSaidas)} sub="período" tone="danger" />
        <KPI label="Valor de venda" value={brl(financial.sale)} sub={`${num(financial.items)} itens · ${num(financial.units)} un.`} />
        {showCost ? (
          <KPI label="Lucro potencial" value={brl(financial.profit)} sub={`custo ${brl(financial.cost)}`} tone="info" />
        ) : (
          <KPI label="Itens cadastrados" value={num(financial.items)} sub={`${num(financial.units)} un.`} />
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportKey)}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-3">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <TabsTrigger key={r.key} value={r.key} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">
                <Icon className="h-3.5 w-3.5 mr-1.5" /> {r.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="in_out"><MovChart data={movByDay} /><MovTable rows={filteredMovs} loading={loading} /></TabsContent>
        <TabsContent value="transfers"><TransfersTable rows={transfers} loading={loading} /></TabsContent>
        <TabsContent value="balances"><BalancesTable rows={filteredProds} loading={loading} /></TabsContent>
        <TabsContent value="top_movers"><TopMoversChart rows={topMovers} /><TopMoversTable rows={topMovers} /></TabsContent>
        <TabsContent value="stalled"><StalledTable rows={stalled} loading={loading} /></TabsContent>
        <TabsContent value="low_stock"><LowStockTable rows={lowStock} loading={loading} /></TabsContent>
        <TabsContent value="financial"><FinancialTable rows={filteredProds} showCost={showCost} loading={loading} /></TabsContent>
        <TabsContent value="by_product">
          <Card className="p-3 mb-3">
            <Label className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Produto</Label>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Selecione um produto…" /></SelectTrigger>
              <SelectContent>{filteredProds.slice(0, 500).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `· ${p.sku}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Card>
          <ByProductTimeline rows={byProductTimeline} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function kindLabel(k: Movement["kind"]) {
  switch (k) {
    case "venda": return "Venda";
    case "compra": return "Compra";
    case "ajuste": return "Ajuste";
    case "os": return "OS";
    case "troca": return "Troca";
    case "transfer_in": return "Transferência (entrada)";
    case "transfer_out": return "Transferência (saída)";
  }
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "success" | "danger" | "info" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "info" ? "text-info" : "";
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">{label}</div>
      <div className={`metric text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function MovChart({ data }: { data: { day: string; entradas: number; saidas: number }[] }) {
  if (!data.length) return null;
  return (
    <Card className="p-3 mb-3">
      <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground mb-2">Movimentação por dia</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="day" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Legend />
            <Bar dataKey="entradas" fill="hsl(var(--success))" />
            <Bar dataKey="saidas" fill="hsl(var(--danger))" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MovTable({ rows, loading }: { rows: Movement[]; loading: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground"><tr>
          <th className="text-left px-4 py-3 font-medium">Data</th>
          <th className="text-left px-4 py-3 font-medium">Produto</th>
          <th className="text-left px-4 py-3 font-medium">Tipo</th>
          <th className="text-right px-4 py-3 font-medium">Qtd</th>
          <th className="text-right px-4 py-3 font-medium">Valor</th>
        </tr></thead>
        <tbody className="divide-y divide-border">
          {loading ? <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">Carregando…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">Sem movimentações no período.</td></tr>
            : rows.slice(0, 500).map((m) => (
              <tr key={m.id} className="hover:bg-surface-elevated/40">
                <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{new Date(m.date).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-2"><div className="font-medium">{m.product_name}</div><div className="text-[11px] text-muted-foreground font-mono">{m.sku ?? "—"}</div></td>
                <td className="px-4 py-2"><Badge variant="outline" className="text-xs">{kindLabel(m.kind)}</Badge></td>
                <td className={`px-4 py-2 text-right metric font-semibold ${m.qty >= 0 ? "text-success" : "text-danger"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                <td className="px-4 py-2 text-right metric">{brl(Math.abs(m.qty) * (m.qty >= 0 ? m.unit_cost : m.unit_price))}</td>
              </tr>
            ))}
        </tbody></table></div>
    </Card>
  );
}

function TransfersTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground"><tr>
        <th className="text-left px-4 py-3 font-medium">Data</th>
        <th className="text-left px-4 py-3 font-medium">Direção</th>
        <th className="text-right px-4 py-3 font-medium">Qtd</th>
        <th className="text-left px-4 py-3 font-medium">Observação</th>
      </tr></thead>
      <tbody className="divide-y divide-border">
        {loading ? <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-muted-foreground">Carregando…</td></tr>
          : rows.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-muted-foreground">Sem transferências no período.</td></tr>
          : rows.map((t: any) => (
            <tr key={t.id} className="hover:bg-surface-elevated/40">
              <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{new Date(t.created_at).toLocaleString("pt-BR")}</td>
              <td className="px-4 py-2"><Badge variant="outline" className={`text-xs ${t.direction === "in" ? "text-success" : "text-danger"}`}>{t.direction === "in" ? "Entrada" : "Saída"}</Badge></td>
              <td className="px-4 py-2 text-right metric">{t.quantity}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{t.note ?? "—"}</td>
            </tr>
          ))}
      </tbody></table></div></Card>
  );
}

function BalancesTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground"><tr>
        <th className="text-left px-4 py-3 font-medium">Produto</th>
        <th className="text-left px-4 py-3 font-medium">Marca</th>
        <th className="text-left px-4 py-3 font-medium">Categoria</th>
        <th className="text-right px-4 py-3 font-medium">Estoque</th>
        <th className="text-right px-4 py-3 font-medium">Mín</th>
      </tr></thead>
      <tbody className="divide-y divide-border">
        {loading ? <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">Carregando…</td></tr>
          : rows.slice(0, 1000).map((p) => (
            <tr key={p.id} className="hover:bg-surface-elevated/40">
              <td className="px-4 py-2"><div className="font-medium">{p.name}</div><div className="text-[11px] text-muted-foreground font-mono">{p.sku ?? "—"}</div></td>
              <td className="px-4 py-2 text-xs">{p.brand ?? "—"}</td>
              <td className="px-4 py-2 text-xs">{p.category ?? "—"}</td>
              <td className="px-4 py-2 text-right metric font-bold text-lg">{p.stock_current}</td>
              <td className="px-4 py-2 text-right metric text-xs text-slate-400">{p.stock_min}</td>
            </tr>
          ))}
      </tbody></table></div></Card>
  );
}

function TopMoversChart({ rows }: { rows: any[] }) {
  if (!rows.length) return null;
  return (
    <Card className="p-3 mb-3">
      <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground mb-2">Top 15 mais vendidos</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows.slice(0, 15)} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis type="number" fontSize={10} />
            <YAxis type="category" dataKey="name" fontSize={10} width={140} />
            <Tooltip />
            <Bar dataKey="sold" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TopMoversTable({ rows }: { rows: any[] }) {
  return (
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground"><tr>
        <th className="text-left px-4 py-3 font-medium">#</th>
        <th className="text-left px-4 py-3 font-medium">Produto</th>
        <th className="text-right px-4 py-3 font-medium">Vendidos</th>
        <th className="text-right px-4 py-3 font-medium">Receita</th>
      </tr></thead>
      <tbody className="divide-y divide-border">
        {rows.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-muted-foreground">Sem vendas no período.</td></tr>
          : rows.map((r, i) => (
            <tr key={r.id} className="hover:bg-surface-elevated/40">
              <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{i + 1}</td>
              <td className="px-4 py-2"><div className="font-medium">{r.name}</div><div className="text-[11px] text-muted-foreground font-mono">{r.sku ?? "—"}</div></td>
              <td className="px-4 py-2 text-right metric font-semibold">{r.sold}</td>
              <td className="px-4 py-2 text-right metric text-success">{brl(r.revenue)}</td>
            </tr>
          ))}
      </tbody></table></div></Card>
  );
}

function StalledTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground"><tr>
        <th className="text-left px-4 py-3 font-medium">Produto</th>
        <th className="text-left px-4 py-3 font-medium">Marca</th>
        <th className="text-right px-4 py-3 font-medium">Estoque</th>
        <th className="text-left px-4 py-3 font-medium">Última venda</th>
      </tr></thead>
      <tbody className="divide-y divide-border">
        {loading ? <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-muted-foreground">Carregando…</td></tr>
          : rows.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-muted-foreground">Todos os produtos tiveram movimento ✨</td></tr>
          : rows.slice(0, 1000).map((p) => (
            <tr key={p.id} className="hover:bg-surface-elevated/40">
              <td className="px-4 py-2"><div className="font-medium">{p.name}</div><div className="text-[11px] text-muted-foreground font-mono">{p.sku ?? "—"}</div></td>
              <td className="px-4 py-2 text-xs">{p.brand ?? "—"}</td>
              <td className="px-4 py-2 text-right metric font-semibold">{p.stock_current}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{p.last_sold_at ? new Date(p.last_sold_at).toLocaleDateString("pt-BR") : "nunca"}</td>
            </tr>
          ))}
      </tbody></table></div></Card>
  );
}

function LowStockTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground"><tr>
        <th className="text-left px-4 py-3 font-medium">Produto</th>
        <th className="text-left px-4 py-3 font-medium">Marca</th>
        <th className="text-right px-4 py-3 font-medium">Estoque</th>
        <th className="text-right px-4 py-3 font-medium">Mín</th>
        <th className="text-right px-4 py-3 font-medium">Sugestão</th>
      </tr></thead>
      <tbody className="divide-y divide-border">
        {loading ? <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">Carregando…</td></tr>
          : rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">Nenhum produto abaixo do mínimo 🎉</td></tr>
          : rows.map((p) => (
            <tr key={p.id} className="hover:bg-surface-elevated/40">
              <td className="px-4 py-2"><div className="font-medium">{p.name}</div><div className="text-[11px] text-muted-foreground font-mono">{p.sku ?? "—"}</div></td>
              <td className="px-4 py-2 text-xs">{p.brand ?? "—"}</td>
              <td className="px-4 py-2 text-right metric font-semibold text-warning">{p.stock_current}</td>
              <td className="px-4 py-2 text-right metric text-xs text-slate-400">{p.stock_min}</td>
              <td className="px-4 py-2 text-right metric font-semibold text-success">+{Math.max((p.stock_min || 0) * 2 - (p.stock_current || 0), 1)}</td>
            </tr>
          ))}
      </tbody></table></div></Card>
  );
}

function FinancialTable({ rows, showCost, loading }: { rows: any[]; showCost: boolean; loading: boolean }) {
  return (
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground"><tr>
        <th className="text-left px-4 py-3 font-medium">Produto</th>
        <th className="text-right px-4 py-3 font-medium">Estoque</th>
        {showCost && <th className="text-right px-4 py-3 font-medium">Custo unit.</th>}
        <th className="text-right px-4 py-3 font-medium">Venda unit.</th>
        {showCost && <th className="text-right px-4 py-3 font-medium">Valor custo</th>}
        <th className="text-right px-4 py-3 font-medium">Valor venda</th>
        {showCost && <th className="text-right px-4 py-3 font-medium">Lucro potencial</th>}
      </tr></thead>
      <tbody className="divide-y divide-border">
        {loading ? <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">Carregando…</td></tr>
          : rows.slice(0, 1000).map((p) => {
            const u = Number(p.stock_current) || 0;
            const cp = Number(p.cost_price || 0), sp = Number(p.sale_price || 0);
            return (
              <tr key={p.id} className="hover:bg-surface-elevated/40">
                <td className="px-4 py-2"><div className="font-medium">{p.name}</div><div className="text-[11px] text-muted-foreground font-mono">{p.sku ?? "—"}</div></td>
                <td className="px-4 py-2 text-right metric">{u}</td>
                {showCost && <td className="px-4 py-2 text-right metric text-muted-foreground">{brl(cp)}</td>}
                <td className="px-4 py-2 text-right metric">{brl(sp)}</td>
                {showCost && <td className="px-4 py-2 text-right metric">{brl(u * cp)}</td>}
                <td className="px-4 py-2 text-right metric text-success">{brl(u * sp)}</td>
                {showCost && <td className="px-4 py-2 text-right metric text-info">{brl(u * (sp - cp))}</td>}
              </tr>
            );
          })}
      </tbody></table></div></Card>
  );
}

function ByProductTimeline({ rows, loading }: { rows: Movement[]; loading: boolean }) {
  const chartData = useMemo(() => {
    let running = 0;
    return rows.map((m) => { running += m.qty; return { date: new Date(m.date).toLocaleDateString("pt-BR"), saldo: running, qty: m.qty }; });
  }, [rows]);
  return (
    <>
      {chartData.length > 0 && (
        <Card className="p-3 mb-3">
          <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground mb-2">Saldo ao longo do tempo</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Line type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      <MovTable rows={rows} loading={loading} />
    </>
  );
}