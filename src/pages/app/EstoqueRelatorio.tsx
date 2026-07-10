import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeCost } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, FileDown, AlertTriangle, Wrench, RefreshCw, ClipboardEdit, Calendar as CalendarIcon } from "lucide-react";
import { brl, num } from "@/lib/format";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, FileSpreadsheet, Printer, ChevronDown } from "lucide-react";

type Reason = "perda" | "brinde" | "uso_interno" | "correcao" | "entrada_manual" | "outros";
const REASONS: { value: Reason; label: string }[] = [
  { value: "perda", label: "Perda" },
  { value: "brinde", label: "Brinde" },
  { value: "uso_interno", label: "Uso interno" },
  { value: "correcao", label: "Correção de inconsistência" },
  { value: "entrada_manual", label: "Entrada manual" },
  { value: "outros", label: "Outros" },
];

type Row = {
  kind: "product" | "part";
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  stock_current: number;
  stock_min: number;
  cost_price: number;
  sale_price: number;
  movements: { in: number; out: number };
  baseline: number;
  inconsistent: boolean;
};

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function endOfPrevMonth(d = new Date()) {
  const x = startOfMonth(d);
  x.setMilliseconds(-1);
  return x;
}
const toInputDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

type Prefs = {
  startDate: string;
  endDate: string;
  categories: string[];
  kind: "all" | "product" | "part";
};
const PREF_KEY = "phonee.estoqueRelatorio.prefs";
const LEGACY_PREF_KEY = "mobileplus.estoqueRelatorio.prefs";
const loadPrefs = (): Prefs => {
  const defaults: Prefs = {
    startDate: toInputDate(startOfMonth()),
    endDate: toInputDate(endOfMonth()),
    categories: [],
    kind: "all",
  };
  try {
    let raw = typeof window !== "undefined" ? localStorage.getItem(PREF_KEY) : null;
    if (!raw && typeof window !== "undefined") {
      const legacy = localStorage.getItem(LEGACY_PREF_KEY);
      if (legacy) { raw = legacy; try { localStorage.setItem(PREF_KEY, legacy); localStorage.removeItem(LEGACY_PREF_KEY); } catch {} }
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      // migrate old prefs (granularity-based)
      if (parsed.granularity || !parsed.startDate) return defaults;
      return { ...defaults, ...parsed };
    }
  } catch {}
  return defaults;
};
const savePrefs = (p: Prefs) => {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
};

export default function EstoqueRelatorio() {
  const { store, role } = useAuth();
  const navigate = useNavigate();
  const showCost = canSeeCost(role as any);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const periodStart = useMemo<Date>(() => {
    return prefs.startDate ? new Date(prefs.startDate + "T00:00:00") : startOfMonth();
  }, [prefs]);
  const periodEnd = useMemo<Date>(() => {
    return prefs.endDate ? new Date(prefs.endDate + "T23:59:59") : endOfMonth();
  }, [prefs]);

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjTarget, setAdjTarget] = useState<Row | null>(null);
  const [adjQty, setAdjQty] = useState<number>(0);
  const [adjReason, setAdjReason] = useState<Reason>("perda");
  const [adjJustification, setAdjJustification] = useState("");

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const startIso = periodStart.toISOString();
    const endIso = periodEnd.toISOString();

    const [{ data: prods }, { data: parts }] = await Promise.all([
      supabase.from("products")
        .select("id, name, sku, category, stock_current, stock_min, cost_price, sale_price")
        .eq("store_id", store.id),
      supabase.from("parts_inventory")
        .select("id, name, sku, category, stock_current, stock_min, cost_price, sale_price")
        .eq("store_id", store.id),
    ]);

    // Outflows in period
    const { data: saleItems } = await supabase
      .from("sale_items")
      .select("product_id, qty, sales!inner(store_id, created_at)")
      .eq("sales.store_id", store.id)
      .gte("sales.created_at", startIso)
      .lte("sales.created_at", endIso);
    const { data: osParts } = await supabase
      .from("service_order_parts")
      .select("part_id, qty, created_at")
      .eq("store_id", store.id)
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    const { data: adjustments } = await supabase
      .from("stock_adjustments")
      .select("item_kind, product_id, part_id, qty_change")
      .eq("store_id", store.id)
      .gte("created_at", startIso)
      .lte("created_at", endIso);

    const movMap = new Map<string, { in: number; out: number }>();
    const bump = (key: string, delta: number) => {
      const cur = movMap.get(key) ?? { in: 0, out: 0 };
      if (delta >= 0) cur.in += delta;
      else cur.out += -delta;
      movMap.set(key, cur);
    };
    (saleItems ?? []).forEach((r: any) => bump(`product:${r.product_id}`, -Number(r.qty || 0)));
    (osParts ?? []).forEach((r: any) => bump(`part:${r.part_id}`, -Number(r.qty || 0)));
    (adjustments ?? []).forEach((r: any) => {
      const key = r.item_kind === "product" ? `product:${r.product_id}` : `part:${r.part_id}`;
      bump(key, Number(r.qty_change || 0));
    });

    const buildRow = (kind: "product" | "part", p: any): Row => {
      const mv = movMap.get(`${kind}:${p.id}`) ?? { in: 0, out: 0 };
      const baseline = Number(p.stock_current) - mv.in + mv.out;
      return {
        kind, id: p.id, name: p.name, sku: p.sku ?? null,
        category: p.category ?? null,
        stock_current: Number(p.stock_current) || 0,
        stock_min: Number(p.stock_min) || 0,
        cost_price: Number(p.cost_price) || 0,
        sale_price: Number(p.sale_price) || 0,
        movements: mv,
        baseline,
        inconsistent: Number(p.stock_current) < 0 || baseline < 0,
      };
    };

    const all: Row[] = [
      ...(prods ?? []).map((p) => buildRow("product", p)),
      ...(parts ?? []).map((p) => buildRow("part", p)),
    ].sort((a, b) => a.name.localeCompare(b.name));
    setRows(all);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store, periodStart.getTime(), periodEnd.getTime()]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category && set.add(r.category));
    return Array.from(set).sort();
  }, [rows]);

  const visibleRows = useMemo(() => rows.filter((r) => {
    if (prefs.kind !== "all" && r.kind !== prefs.kind) return false;
    if (prefs.categories.length > 0) {
      const tag = r.kind === "part" ? `peca:${r.category ?? "outros"}` : (r.category ?? "");
      if (!prefs.categories.includes(tag) && !prefs.categories.includes(r.category ?? "")) return false;
    }
    return true;
  }), [rows, prefs]);

  const totals = useMemo(() => ({
    items: visibleRows.length,
    units: visibleRows.reduce((s, r) => s + r.stock_current, 0),
    cashCost: visibleRows.reduce((s, r) => s + r.stock_current * r.cost_price, 0),
    cashSale: visibleRows.reduce((s, r) => s + r.stock_current * r.sale_price, 0),
    inconsistencies: visibleRows.filter((r) => r.inconsistent).length,
    baselineUnits: visibleRows.reduce((s, r) => s + r.baseline, 0),
  }), [visibleRows]);

  const openAdjust = (r: Row) => {
    setAdjTarget(r);
    setAdjQty(0);
    setAdjReason("perda");
    setAdjJustification("");
    setAdjOpen(true);
  };

  const saveAdjust = async () => {
    if (!store || !adjTarget) return;
    if (!adjQty || Number.isNaN(adjQty)) { toast.error("Informe uma quantidade (positiva ou negativa)"); return; }
    if (!adjJustification.trim()) { toast.error("Justificativa obrigatória para o gestor"); return; }
    const prev = adjTarget.stock_current;
    const next = prev + adjQty;
    if (next < 0) { toast.error("Estoque resultante não pode ser negativo"); return; }

    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;

    const table = adjTarget.kind === "product" ? "products" : "parts_inventory";
    const { error: e1 } = await supabase.from(table).update({ stock_current: next }).eq("id", adjTarget.id);
    if (e1) { toast.error(e1.message); return; }
    const { error: e2 } = await supabase.from("stock_adjustments").insert({
      store_id: store.id,
      item_kind: adjTarget.kind,
      product_id: adjTarget.kind === "product" ? adjTarget.id : null,
      part_id: adjTarget.kind === "part" ? adjTarget.id : null,
      item_name: adjTarget.name,
      qty_change: adjQty,
      prev_stock: prev,
      new_stock: next,
      reason: adjReason,
      justification: adjJustification.trim(),
      user_id: uid,
    });
    if (e2) { toast.error(e2.message); return; }
    toast.success("Ajuste registrado e enviado ao gestor");
    setAdjOpen(false);
    load();
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Relatório de Estoque — ${store?.name ?? ""}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Período: ${periodStart.toLocaleDateString("pt-BR")} → ${new Date().toLocaleDateString("pt-BR")}`, 14, 22);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 27);

    doc.setFontSize(10);
    doc.text(`Itens: ${num(totals.items)}   Unidades: ${num(totals.units)}   Valor (venda): ${brl(totals.cashSale)}${showCost ? `   Valor (custo): ${brl(totals.cashCost)}` : ""}`, 14, 34);
    if (totals.inconsistencies > 0) {
      doc.setTextColor(200, 0, 0);
      doc.text(`Inconsistências detectadas: ${totals.inconsistencies}`, 14, 40);
      doc.setTextColor(0, 0, 0);
    }

    const head = [["Item", "Tipo", "Base", "Entradas", "Saídas", "Atual", `Valor venda${showCost ? " | custo" : ""}`, "Status"]];
    const body = visibleRows.map((r) => [
      `${r.name}${r.sku ? ` (${r.sku})` : ""}`,
      r.kind === "product" ? "Produto" : "Peça",
      String(r.baseline),
      String(r.movements.in),
      String(r.movements.out),
      String(r.stock_current),
      showCost
        ? `${brl(r.stock_current * r.sale_price)} | ${brl(r.stock_current * r.cost_price)}`
        : brl(r.stock_current * r.sale_price),
      r.inconsistent ? "INCONSISTÊNCIA" : r.stock_current <= r.stock_min ? "Baixo" : "OK",
    ]);
    autoTable(doc, { head, body, startY: totals.inconsistencies > 0 ? 46 : 40, styles: { fontSize: 8 } });
    doc.save(`relatorio-estoque-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const buildTabular = () => {
    const header = ["Item", "SKU", "Tipo", "Categoria", "Base", "Entradas", "Saídas", "Atual", "Preço venda", ...(showCost ? ["Custo unit."] : []), "Valor venda", ...(showCost ? ["Valor custo"] : []), "Status"];
    const body = visibleRows.map((r) => [
      r.name,
      r.sku ?? "",
      r.kind === "product" ? "Produto" : "Peça",
      r.category ?? "",
      r.baseline,
      r.movements.in,
      r.movements.out,
      r.stock_current,
      r.sale_price,
      ...(showCost ? [r.cost_price] : []),
      r.stock_current * r.sale_price,
      ...(showCost ? [r.stock_current * r.cost_price] : []),
      r.inconsistent ? "INCONSISTÊNCIA" : r.stock_current <= r.stock_min ? "Baixo" : "OK",
    ]);
    return { header, body };
  };

  const exportCsv = () => {
    const { header, body } = buildTabular();
    const esc = (v: any) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...body].map((row) => row.map(esc).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-estoque-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const { header, body } = buildTabular();
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, `relatorio-estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPrint = () => {
    const { header, body } = buildTabular();
    const win = window.open("", "_blank");
    if (!win) { toast.error("Não foi possível abrir a janela de impressão"); return; }
    const rows = body.map((r) => `<tr>${r.map((c) => `<td>${String(c ?? "")}</td>`).join("")}</tr>`).join("");
    win.document.write(`
      <html><head><title>Relatório de Estoque</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px} .meta{font-size:11px;color:#555;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f5f5f5}
      </style></head><body>
      <h1>Relatório de Estoque — ${store?.name ?? ""}</h1>
      <div class="meta">Período: ${periodStart.toLocaleDateString("pt-BR")} → ${periodEnd.toLocaleDateString("pt-BR")} · Gerado em ${new Date().toLocaleString("pt-BR")}</div>
      <table><thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div>
      <PageHeader
        title="Relatório de Estoque"
        description="Inventário em tempo real · Selecione o período abaixo"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/painel/estoque")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <Button variant="outline" onClick={load} title="Recarregar">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-gradient-primary shadow-glow">
                  <FileDown className="h-4 w-4 mr-1" /> Exportar <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={exportPdf}>
                  <FileText className="h-4 w-4 mr-2" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv}>
                  <FileDown className="h-4 w-4 mr-2" /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportPrint}>
                  <Printer className="h-4 w-4 mr-2" /> Imprimir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Filters */}
      <Card className="p-3 mb-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex flex-wrap gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Data início</Label>
              <div className="relative mt-1">
                <CalendarIcon className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={prefs.startDate}
                  onChange={(e) => setPrefs({ ...prefs, startDate: e.target.value || toInputDate(startOfMonth()) })}
                  className="h-9 pl-8 w-[170px]"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Data fim</Label>
              <div className="relative mt-1">
                <CalendarIcon className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={prefs.endDate}
                  onChange={(e) => setPrefs({ ...prefs, endDate: e.target.value || toInputDate(endOfMonth()) })}
                  className="h-9 pl-8 w-[170px]"
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-9 text-xs"
                onClick={() => setPrefs({ ...prefs, startDate: toInputDate(startOfMonth()), endDate: toInputDate(endOfMonth()) })}
              >
                Mês atual
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Tipo</Label>
            <Select value={prefs.kind} onValueChange={(v) => setPrefs({ ...prefs, kind: v as any })}>
              <SelectTrigger className="h-9 w-40 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="product">Produtos</SelectItem>
                <SelectItem value="part">Peças</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {allCategories.length > 0 && (
            <div className="flex-1 min-w-0">
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Categorias</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {allCategories.map((c) => {
                  const active = prefs.categories.includes(c);
                  return (
                    <Button
                      key={c}
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => setPrefs({
                        ...prefs,
                        categories: active
                          ? prefs.categories.filter((x) => x !== c)
                          : [...prefs.categories, c],
                      })}
                      className={`h-7 text-xs ${active ? "bg-primary text-primary-foreground" : ""}`}
                    >
                      {c}
                    </Button>
                  );
                })}
                {prefs.categories.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setPrefs({ ...prefs, categories: [] })} className="h-7 text-xs">
                    Limpar
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* KPI cards — 2 colunas, formato linha */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <Card className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Itens distintos</span>
            <span className="text-base font-semibold metric">{num(totals.items)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Unidades em estoque</span>
            <span className="text-base font-semibold metric">{num(totals.units)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Base ({endOfPrevMonth().toLocaleDateString("pt-BR")})</span>
            <span className="text-base font-semibold metric text-muted-foreground">{num(totals.baselineUnits)}</span>
          </div>
        </Card>
        <Card className={`divide-y divide-border ${totals.inconsistencies > 0 ? "border-danger/40" : ""}`}>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Valor de venda</span>
            <span className="text-base font-semibold metric text-success">{brl(totals.cashSale)}</span>
          </div>
          {showCost && (
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Valor de custo</span>
              <span className="text-base font-semibold metric">{brl(totals.cashCost)}</span>
            </div>
          )}
          {totals.inconsistencies > 0 ? (
            <a
              href="#inconsistencias"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("inconsistencias")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="flex items-center justify-between px-4 py-3 bg-red-600 hover:bg-red-700 text-white transition-colors group"
            >
              <span className="text-[11px] uppercase tracking-widest font-mono flex items-center gap-1.5 text-white/90">
                <AlertTriangle className="h-3.5 w-3.5" />
                Inconsistências, quebra e falta
              </span>
              <span className="text-2xl font-bold metric text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.45)] group-hover:scale-105 transition-transform">
                {num(totals.inconsistencies)}
              </span>
            </a>
          ) : (
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Inconsistências</span>
              <span className="text-base font-semibold metric text-success">0</span>
            </div>
          )}
        </Card>
      </div>

      <Card id="inconsistencias" className="bg-card border-border shadow-card overflow-hidden scroll-mt-24">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium min-w-[320px] w-[40%]">Item</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 font-medium">Base (mês-1)</th>
                <th className="text-right px-4 py-3 font-medium text-success">Entradas</th>
                <th className="text-right px-4 py-3 font-medium text-danger">Saídas</th>
                <th className="text-right px-4 py-3 font-medium">Atual</th>
                <th className="text-right px-4 py-3 font-medium">Valor</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono">CARREGANDO…</td></tr>
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Nenhum item no estoque.</td></tr>
              ) : visibleRows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className={`hover:bg-surface-elevated/40 ${r.inconsistent ? "bg-danger/5" : ""}`}>
                  <td className="px-4 py-3 min-w-[320px] w-[40%]">
                    <div className="font-medium whitespace-normal break-words">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{r.sku || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.kind === "part" ? (
                      <Badge variant="outline" className="border-border text-xs"><Wrench className="h-3 w-3 mr-1" />Peça</Badge>
                    ) : (
                      <Badge variant="outline" className="border-border text-xs">Produto</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right metric text-muted-foreground">{r.baseline}</td>
                  <td className="px-4 py-3 text-right metric text-success">{r.movements.in > 0 ? `+${r.movements.in}` : "—"}</td>
                  <td className="px-4 py-3 text-right metric text-danger">{r.movements.out > 0 ? `-${r.movements.out}` : "—"}</td>
                  <td className="px-4 py-3 text-right metric font-semibold">{r.stock_current}</td>
                  <td className="px-4 py-3 text-right metric">{brl(r.stock_current * r.sale_price)}</td>
                  <td className="px-4 py-3 text-center">
                    {r.inconsistent ? (
                      <Badge className="bg-danger/15 text-danger border-danger/30"><AlertTriangle className="h-3 w-3 mr-1" />Inconsistente</Badge>
                    ) : r.stock_current <= r.stock_min ? (
                      <Badge className="bg-warning/15 text-warning border-warning/30">Baixo</Badge>
                    ) : (
                      <Badge variant="outline" className="border-border text-muted-foreground">OK</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openAdjust(r)} title="Ajustar / Justificar">
                      <ClipboardEdit className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste de estoque · {adjTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Estoque atual: <strong className="text-foreground">{adjTarget?.stock_current ?? 0}</strong> · Novo: <strong className="text-foreground">{(adjTarget?.stock_current ?? 0) + adjQty}</strong>
            </div>
            <div>
              <Label>Quantidade (use negativo para baixa)</Label>
              <NumberInput allowDecimal={false} value={adjQty} onValueChange={setAdjQty} />
            </div>
            <div>
              <Label>Motivo</Label>
              <Select value={adjReason} onValueChange={(v) => setAdjReason(v as Reason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Justificativa para o gestor *</Label>
              <Textarea value={adjJustification} onChange={(e) => setAdjJustification(e.target.value)} rows={3} placeholder="Descreva o que aconteceu…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjOpen(false)}>Cancelar</Button>
            <Button onClick={saveAdjust} className="bg-gradient-primary">Registrar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}