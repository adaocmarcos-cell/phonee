import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeCost, canManageProducts } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AutocompleteInput from "@/components/AutocompleteInput";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Package, AlertTriangle, Edit3, Trash2, ShoppingBag, Tag, FileBarChart, Wrench, ClipboardCheck, Download, Upload, ShoppingCart, Truck, Boxes, DollarSign, TrendingDown } from "lucide-react";
import { brl, num } from "@/lib/format";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { VendaRapidaModal } from "@/components/VendaRapidaModal";
import { MarcasModal } from "@/components/MarcasModal";
import { canRegisterSale } from "@/contexts/AuthContext";
import { generateUniqueSku } from "@/lib/sku";
import { normalizeProductStockMetrics, type ProductStockMetrics } from "@/lib/stockMetrics";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronLeft, ChevronRight, FileBarChart2 } from "lucide-react";

type Product = {
  id: string;
  name: string; sku: string | null; brand: string | null;
  category: string; condition: string; status: string;
  cost_price: number; sale_price: number;
  stock_current: number; stock_min: number;
  last_sold_at: string | null;
  supplier?: string | null;
};

const categoryLabel: Record<string, string> = {
  acessorio: "Acessório", peca: "Peça",
  aparelho_novo: "Aparelho novo", aparelho_seminovo: "Aparelho seminovo",
};

export default function Estoque() {
  const { store, role } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [stockMetrics, setStockMetrics] = useState<ProductStockMetrics>({
    product_count: 0, units: 0, low_count: 0, stalled_count: 0,
    sale_value: 0, cost_value: 0, parts_count: 0, parts_units: 0,
    parts_low_count: 0, parts_sale_value: 0, alert_count: 0,
  });
  const [filterOptions, setFilterOptions] = useState<{ brands: string[]; categories: string[]; suppliers: string[] }>({ brands: [], categories: [], suppliers: [] });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "stalled">("all");
  const [delTarget, setDelTarget] = useState<Product | null>(null);
  const [saleTarget, setSaleTarget] = useState<Product | null>(null);
  const [minTarget, setMinTarget] = useState<Product | null>(null);
  const [minValue, setMinValue] = useState<string>("0");
  const [minSaving, setMinSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marcasOpen, setMarcasOpen] = useState(false);
  const fileInputId = "estoque-csv-import";

  // Selection + pagination + advanced filters
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Bulk action dialogs
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkOp, setBulkOp] = useState<null | "brand" | "category" | "supplier" | "price" | "stock_min">(null);
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const [{ data: pData, error: pErr }, { data: metrics }, { data: options }] = await Promise.all([
      (supabase as any).rpc("stock_products_page", {
        _store_id: store.id,
        _query: q,
        _filter: filter,
        _brand: brandFilter,
        _category: categoryFilter,
        _page: page,
        _page_size: pageSize,
      }),
      (supabase as any).rpc("product_stock_metrics", { _store_id: store.id }),
      (supabase as any).rpc("product_stock_filter_options", { _store_id: store.id }),
    ]);
    if (pErr) toast.error(`Erro ao carregar produtos: ${pErr.message}`);
    setProducts((pData ?? []) as Product[]);
    setFilteredCount(Number((pData ?? [])[0]?.total_count ?? 0));
    if (metrics) setStockMetrics(normalizeProductStockMetrics(metrics));
    if (options) {
      setFilterOptions({
        brands: Array.isArray(options.brands) ? options.brands : [],
        categories: Array.isArray(options.categories) ? options.categories : [],
        suppliers: Array.isArray(options.suppliers) ? options.suppliers : [],
      });
    }
    setLoading(false);
  }, [store, q, filter, brandFilter, categoryFilter, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  // Realtime sync
  useEffect(() => {
    if (!store) return;
    const ch = supabase
      .channel(`estoque-list-${store.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `store_id=eq.${store.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "parts_inventory", filter: `store_id=eq.${store.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [store?.id, load]);

  const filtered = useMemo(() => {
    return products;
  }, [products]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [q, filter, brandFilter, categoryFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered;

  const distinctBrands = filterOptions.brands;
  const distinctCategories = filterOptions.categories;
  const distinctSuppliers = filterOptions.suppliers;
  const bulkOptions = useMemo(() => {
    if (bulkOp === "brand") return distinctBrands;
    if (bulkOp === "supplier") return distinctSuppliers;
    if (bulkOp === "category") return distinctCategories;
    return [] as string[];
  }, [bulkOp, distinctBrands, distinctSuppliers, distinctCategories]);

  const togglePageSelection = (checked: boolean) => {
    const next = new Set(selectedIds);
    paged.forEach((p) => { if (checked) next.add(p.id); else next.delete(p.id); });
    setSelectedIds(next);
  };
  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    setSelectedIds(next);
  };
  const pageAllChecked = paged.length > 0 && paged.every((p) => selectedIds.has(p.id));

  const totals = useMemo(() => {
    const saleValue = filtered.reduce((s, p) => s + Number(p.sale_price) * p.stock_current, 0);
    const costValue = filtered.reduce((s, p) => s + Number(p.cost_price) * p.stock_current, 0);
    const totalUnits = filtered.reduce((s, p) => s + (p.stock_current || 0), 0);
    return {
      count: stockMetrics.product_count,
      filtered: filteredCount,
      selected: selectedIds.size,
      units: stockMetrics.units,
      low: stockMetrics.low_count + stockMetrics.parts_low_count,
      value: stockMetrics.sale_value + stockMetrics.parts_sale_value,
      costValue,
      saleValue,
      profitValue: saleValue - costValue,
      avgCost: totalUnits > 0 ? costValue / totalUnits : 0,
      partsCount: stockMetrics.parts_count,
      partsUnits: stockMetrics.parts_units,
    };
  }, [stockMetrics, filtered, filteredCount, selectedIds]);

  const handleDelete = async () => {
    if (!delTarget) return;
    const { error } = await supabase.from("products").delete().eq("id", delTarget.id);
    setDelTarget(null);
    if (error) return toast.error(error.message);
    toast.success("Produto removido");
    load();
  };

  const toggleActive = async (p: Product, next: boolean) => {
    const newStatus = next ? "ativo" : "inativo";
    setProducts((arr) => arr.map((x) => (x.id === p.id ? { ...x, status: newStatus } : x)));
    const { error } = await supabase.from("products").update({ status: newStatus }).eq("id", p.id);
    if (error) {
      toast.error(error.message);
      setProducts((arr) => arr.map((x) => (x.id === p.id ? { ...x, status: p.status } : x)));
      return;
    }
    toast.success(next ? "Produto ativado" : "Produto desativado");
  };

  const openMinEdit = (p: Product) => {
    setMinTarget(p);
    setMinValue(String(p.stock_min ?? 0));
  };

  const saveMin = async () => {
    if (!minTarget) return;
    const n = Math.max(0, parseInt(minValue || "0", 10) || 0);
    setMinSaving(true);
    const { error } = await supabase.from("products").update({ stock_min: n }).eq("id", minTarget.id);
    setMinSaving(false);
    if (error) return toast.error(error.message);
    setProducts((arr) => arr.map((x) => (x.id === minTarget.id ? { ...x, stock_min: n } : x)));
    toast.success("Estoque mínimo atualizado");
    setMinTarget(null);
  };

  // === Bulk actions ===========================================================
  const bulkIds = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const runBulkDelete = async () => {
    if (bulkIds.length === 0) return;
    const { error } = await supabase.from("products").delete().in("id", bulkIds);
    if (error) return toast.error(error.message);
    toast.success(`${bulkIds.length} produto(s) removido(s)`);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    load();
  };
  const runBulkUpdate = async () => {
    if (!bulkOp || bulkIds.length === 0) return;
    const v = bulkValue.trim();
    let payload: Record<string, any> = {};
    if (bulkOp === "brand") payload = { brand: v || null };
    else if (bulkOp === "category") payload = { category: v };
    else if (bulkOp === "supplier") payload = { supplier: v || null };
    else if (bulkOp === "price") {
      const n = Number(v.replace(",", "."));
      if (!isFinite(n) || n < 0) return toast.error("Preço inválido");
      payload = { sale_price: n };
    }
    else if (bulkOp === "stock_min") {
      const n = parseInt(v, 10);
      if (!isFinite(n) || n < 0) return toast.error("Quantidade inválida");
      payload = { stock_min: n };
    }
    setBulkSaving(true);
    const { error } = await supabase.from("products").update(payload as any).in("id", bulkIds);
    setBulkSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${bulkIds.length} produto(s) atualizado(s)`);
    setBulkOp(null);
    setBulkValue("");
    setSelectedIds(new Set());
    load();
  };

  const openBulk = (op: NonNullable<typeof bulkOp>) => { setBulkOp(op); setBulkValue(""); };
  const bulkOpLabel: Record<string, string> = {
    brand: "Alterar marca", category: "Alterar categoria", supplier: "Alterar fornecedor",
    price: "Atualizar preço de venda", stock_min: "Atualizar estoque mínimo",
  };

  const CSV_HEADERS = [
    "name","sku","brand","category","condition","cost_price","sale_price","stock_current","stock_min","status",
  ];

  const csvEscape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCSV = () => {
    const source = selectedIds.size > 0 ? products.filter((p) => selectedIds.has(p.id)) : products;
    const rows = source.map((p) =>
      [p.name, p.sku, p.brand, p.category, p.condition, p.cost_price, p.sale_price, p.stock_current, p.stock_min, p.status]
        .map(csvEscape).join(",")
    );
    const csv = [CSV_HEADERS.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estoque-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${source.length} produto(s) exportado(s)`);
  };

  const parseCSV = (text: string): Record<string, string>[] => {
    const lines: string[][] = [];
    let cur: string[] = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { cur.push(field); field = ""; }
        else if (ch === '\n' || ch === '\r') {
          if (field.length || cur.length) { cur.push(field); lines.push(cur); cur = []; field = ""; }
          if (ch === '\r' && text[i + 1] === '\n') i++;
        } else field += ch;
      }
    }
    if (field.length || cur.length) { cur.push(field); lines.push(cur); }
    if (lines.length < 2) return [];
    const headers = lines[0].map((h) => h.trim().replace(/^\uFEFF/, ""));
    return lines.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (row[i] ?? "").trim(); });
      return obj;
    });
  };

  const importCSV = async (file: File) => {
    if (!store) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { toast.error("CSV vazio ou inválido"); return; }

      // Normaliza linhas
      const parsed = rows
        .map((r) => ({
          name: (r.name || r.nome || "").trim().slice(0, 200),
          sku: (r.sku || r.codigo || "").trim().toUpperCase(),
          ean: (r.ean || r.gtin || r.barcode || r.codigo_barras || "").trim(),
          brand: (r.brand || r.marca || "").trim() || null,
          category: (r.category || r.categoria || "acessorio").trim(),
          condition: (r.condition || r.condicao || "novo").trim(),
          cost_price: Number(String(r.cost_price || r.custo || "0").replace(",", ".")) || 0,
          sale_price: Number(String(r.sale_price || r.venda || "0").replace(",", ".")) || 0,
          stock_current: parseInt(r.stock_current || r.estoque || "0", 10) || 0,
          stock_min: parseInt(r.stock_min || r.minimo || "0", 10) || 0,
          status: (r.status || "ativo").trim(),
        }))
        .filter((r) => r.name);

      if (parsed.length === 0) { toast.error("Nenhuma linha válida (coluna 'name' é obrigatória)"); return; }

      // Carrega base existente para dedupe
      const { data: existing, error: exErr } = await supabase
        .from("products")
        .select("id, name, sku, ean, brand, stock_current")
        .eq("store_id", store.id);
      if (exErr) { toast.error(`Erro ao ler base: ${exErr.message}`); return; }

      const byId = new Map<string, any>();
      const bySku = new Map<string, any>();
      const byEan = new Map<string, any>();
      const byNameBrand = new Map<string, any>();
      const usedSkus = new Set<string>();
      (existing ?? []).forEach((p: any) => {
        byId.set(p.id, p);
        if (p.sku) { bySku.set(String(p.sku).toUpperCase(), p); usedSkus.add(String(p.sku).toUpperCase()); }
        if (p.ean) byEan.set(String(p.ean), p);
        const key = `${(p.name || "").toLowerCase().trim()}|${(p.brand || "").toLowerCase().trim()}`;
        if (key.trim() !== "|") byNameBrand.set(key, p);
      });

      // Pré-verificação: detecta SKUs duplicados dentro do próprio CSV
      const csvSkuCount = new Map<string, number>();
      parsed.forEach((r) => {
        if (r.sku) csvSkuCount.set(r.sku, (csvSkuCount.get(r.sku) || 0) + 1);
      });
      const dupSkus = [...csvSkuCount.entries()].filter(([, c]) => c > 1).map(([s]) => s);
      if (dupSkus.length > 0) {
        const ok = confirm(
          `Detectados ${dupSkus.length} SKU(s) duplicados no CSV: ${dupSkus.slice(0, 5).join(", ")}${dupSkus.length > 5 ? "…" : ""}\n\nO sistema irá gerar novos SKUs únicos automaticamente para as duplicatas. Deseja continuar?`,
        );
        if (!ok) { toast.info("Importação cancelada — corrija os SKUs duplicados no CSV."); return; }
      }

      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: any }[] = [];
      const errors: string[] = [];
      const seenSkuInBatch = new Set<string>();
      const report: {
        name: string; sku: string; ean: string; status: string;
        match_by: string; message: string;
      }[] = [];

      for (const r of parsed) {
        // 1) Match por SKU, GTIN ou nome+marca (nessa ordem)
        let match: any = null;
        let matchBy = "";
        if (r.sku && bySku.has(r.sku)) { match = bySku.get(r.sku); matchBy = "sku"; }
        if (!match && r.ean && byEan.has(r.ean)) { match = byEan.get(r.ean); matchBy = "ean"; }
        if (!match) {
          const k = `${r.name.toLowerCase().trim()}|${(r.brand || "").toLowerCase().trim()}`;
          if (byNameBrand.has(k)) { match = byNameBrand.get(k); matchBy = "nome+marca"; }
        }

        if (match) {
          // Atualiza sem apagar histórico (preserva id, estoque só se informado)
          const patch: any = {
            name: r.name,
            brand: r.brand ?? match.brand,
            category: r.category,
            condition: r.condition,
            cost_price: r.cost_price,
            sale_price: r.sale_price,
            stock_min: r.stock_min,
            status: r.status,
          };
          if (r.stock_current > 0) patch.stock_current = r.stock_current;
          if (r.ean) patch.ean = r.ean;
          // Corrige SKU se estava vazio ou inválido
          if (!match.sku && r.sku && !usedSkus.has(r.sku)) {
            patch.sku = r.sku; usedSkus.add(r.sku);
          }
          toUpdate.push({ id: match.id, patch });
          report.push({ name: r.name, sku: r.sku || match.sku || "", ean: r.ean || "", status: "atualizado", match_by: matchBy, message: "" });
        } else {
          // Novo produto — gera SKU se ausente/duplicado
          let sku = r.sku;
          let genMsg = "";
          if (!sku || usedSkus.has(sku) || seenSkuInBatch.has(sku)) {
            genMsg = sku ? `SKU "${sku}" duplicado — gerado novo` : "SKU ausente — gerado";
            try { sku = await generateUniqueSku(store.id, r.name); }
            catch { sku = `SKU-${Date.now().toString().slice(-6)}`; }
          }
          usedSkus.add(sku);
          seenSkuInBatch.add(sku);
          toInsert.push({
            store_id: store.id,
            name: r.name,
            sku,
            ean: r.ean || null,
            brand: r.brand,
            category: r.category,
            condition: r.condition,
            cost_price: r.cost_price,
            sale_price: r.sale_price,
            stock_current: r.stock_current,
            stock_min: r.stock_min,
            status: r.status,
          });
          report.push({ name: r.name, sku, ean: r.ean || "", status: "criado", match_by: "novo", message: genMsg });
        }
      }

      // Executa em lote
      let created = 0, updated = 0;
      if (toInsert.length > 0) {
        const { error, count } = await supabase
          .from("products")
          .insert(toInsert as any, { count: "exact" });
        if (error) { errors.push(`Inserção: ${error.message}`); report.push({ name: "-", sku: "-", ean: "-", status: "erro", match_by: "-", message: `Inserção em lote: ${error.message}` }); }
        else created = count ?? toInsert.length;
      }
      for (const u of toUpdate) {
        const { error } = await supabase.from("products").update(u.patch).eq("id", u.id);
        if (error) { errors.push(`Atualização (${u.id.slice(0, 8)}): ${error.message}`); report.push({ name: "-", sku: u.id.slice(0, 8), ean: "-", status: "erro", match_by: "-", message: error.message }); }
        else updated++;
      }

      // Gera CSV do relatório e dispara download
      try {
        const header = "status,critério_dedupe,nome,sku,ean,observação\n";
        const body = report.map((r) => [r.status, r.match_by, r.name, r.sku, r.ean, r.message]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob(["\ufeff" + header + body], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `import-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      } catch (e) { console.warn("import report generation failed", e); }

      if (errors.length) {
        toast.error(`${errors.length} erro(s) na importação — ${errors[0]}`);
      }
      toast.success(
        `Importação concluída: ${created} novo(s), ${updated} atualizado(s), ${errors.length} erro(s). Relatório baixado.`,
        { duration: 6000 }
      );
      load();
    } catch (e: any) {
      toast.error(`Falha ao processar CSV: ${e?.message ?? "erro"}`);
    }
  };

  return (
    <div>
      <PageHeader
        title=""
        description={undefined}
        actions={
          canManageProducts(role) && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/painel/estoque/relatorios")} className="border-primary/40 text-primary hover:bg-primary/10">
                <FileBarChart2 className="h-4 w-4 mr-1" /> Relatório de Estoque
              </Button>
              <Button variant="outline" onClick={() => navigate("/painel/ajustes-estoque")}>
                <ClipboardCheck className="h-4 w-4 mr-1" /> Ajustes de Estoque
              </Button>
              <Button variant="outline" onClick={exportCSV} title="Exportar estoque em CSV">
                <Download className="h-4 w-4 mr-1" /> Exportar CSV
              </Button>
              <Button variant="outline" onClick={() => document.getElementById(fileInputId)?.click()} title="Importar produtos via CSV">
                <Upload className="h-4 w-4 mr-1" /> Importar CSV
              </Button>
              <input
                id={fileInputId}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCSV(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMarcasOpen(true)}
                title="Marcas que você trabalha"
                aria-label="Marcas"
              >
                <Tag className="h-4 w-4" />
              </Button>
              <Button onClick={() => navigate("/painel/estoque/novo")} className="bg-gradient-primary shadow-glow">
                <Plus className="h-4 w-4 mr-1" /> Novo produto
              </Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card className="bg-card border-border shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Produtos</div>
              <div className="metric text-2xl font-bold mt-1">{num(totals.count)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{num(totals.units)} unidades</div>
            </div>
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-primary">
              <Package className="h-4 w-4" />
            </div>
          </div>
        </Card>
        <Card className="bg-card border-border shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Valor em estoque</div>
              <div className="metric text-2xl font-bold mt-1">{brl(totals.value)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">preço de venda</div>
            </div>
            <div className="h-9 w-9 rounded-md bg-success/10 flex items-center justify-center text-success">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
        </Card>
        <Card className="bg-card border-border shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Em alerta</div>
              <div className={`metric text-2xl font-bold mt-1 ${totals.low > 0 ? "text-warning" : ""}`}>{num(totals.low)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">abaixo do mínimo</div>
            </div>
            <div className="h-9 w-9 rounded-md bg-warning/10 flex items-center justify-center text-warning">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
        </Card>
        <Card className="bg-card border-border shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Peças</div>
              <div className="metric text-2xl font-bold mt-1">{num(totals.partsCount)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{num(totals.partsUnits)} unidades</div>
            </div>
            <div className="h-9 w-9 rounded-md bg-info/10 flex items-center justify-center text-info">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
        </Card>
      </div>

      {canManageProducts(role) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => navigate("/painel/compras")}
            className="group flex items-center gap-3 rounded-lg border border-border bg-white text-slate-700 px-4 py-3 text-left shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
          >
            <div className="h-9 w-9 rounded-md bg-slate-50 flex items-center justify-center text-slate-500 group-hover:text-primary group-hover:bg-primary/5 transition-colors">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">Compras</div>
              <div className="text-[12px] text-slate-500 truncate">Pedidos de reposição, recebimento e histórico</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate("/painel/fornecedores")}
            className="group flex items-center gap-3 rounded-lg border border-border bg-white text-slate-700 px-4 py-3 text-left shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
          >
            <div className="h-9 w-9 rounded-md bg-slate-50 flex items-center justify-center text-slate-500 group-hover:text-primary group-hover:bg-primary/5 transition-colors">
              <Truck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">Fornecedores</div>
              <div className="text-[12px] text-slate-500 truncate">Cadastro, marcas, condições e prazos</div>
            </div>
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, SKU ou marca…" className="pl-9 h-10 bg-card border-border" />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-full md:w-44 h-10 bg-card border-border">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as marcas</SelectItem>
            {distinctBrands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full md:w-44 h-10 bg-card border-border">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {distinctCategories.map((c) => <SelectItem key={c} value={c}>{categoryLabel[c] ?? c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1 p-1 bg-card border border-border rounded-md">
          {(["all", "low", "stalled"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} onClick={() => setFilter(f)} className={filter === f ? "bg-primary text-primary-foreground" : ""}>
              {f === "all" ? "Todos" : f === "low" ? "Em alerta" : "Encalhados"}
            </Button>
          ))}
        </div>
      </div>

      {/* Totalizadores + ações em lote */}
      <div className="flex flex-col lg:flex-row gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground bg-card border border-border rounded-md px-3 py-2 flex-1">
          <span><b className="text-foreground">{num(totals.count)}</b> cadastrados</span>
          <span><b className="text-foreground">{num(totals.filtered)}</b> filtrados</span>
          <span><b className="text-primary">{num(totals.selected)}</b> selecionados</span>
          <span>Valor venda: <b className="text-foreground">{brl(totals.saleValue)}</b></span>
          {canSeeCost(role) && <span>Custo: <b className="text-foreground">{brl(totals.costValue)}</b></span>}
          {canSeeCost(role) && <span>Custo médio/un: <b className="text-foreground">{brl(totals.avgCost)}</b></span>}
          {canSeeCost(role) && <span>Lucro potencial: <b className="text-success">{brl(totals.profitValue)}</b></span>}
        </div>
        {canManageProducts(role) && selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9">
                  Ações em lote ({selectedIds.size}) <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Aplicar a {selectedIds.size} produto(s)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openBulk("category")}>Alterar categoria</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulk("brand")}>Alterar marca</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulk("supplier")}>Alterar fornecedor</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulk("price")}>Atualizar preço de venda</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulk("stock_min")}>Atualizar estoque mínimo</DropdownMenuItem>
                <DropdownMenuItem onClick={exportCSV}>
                  <Download className="h-4 w-4 mr-2" /> Exportar selecionados
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setBulkDeleteOpen(true)} className="text-danger focus:text-danger">
                  <Trash2 className="h-4 w-4 mr-2" /> Excluir selecionados
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
          </div>
        )}
      </div>

      <Card className="bg-card border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm table-auto [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_th]:[word-break:keep-all] [&_td]:[word-break:keep-all] [&_th]:[overflow-wrap:normal] [&_td]:[overflow-wrap:normal] [&_th]:[hyphens:none] [&_td]:[hyphens:none]">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="px-3 py-3 w-8">
                  <Checkbox
                    checked={pageAllChecked}
                    onCheckedChange={(v) => togglePageSelection(!!v)}
                    aria-label="Selecionar todos da página"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium min-w-[180px]">Produto</th>
                <th className="text-left px-4 py-3 font-medium min-w-[110px]">Categoria</th>
                <th className="text-right px-4 py-3 font-medium min-w-[80px]">Estoque</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground/70 min-w-[70px]">Mín</th>
                {canSeeCost(role) && <th className="text-right px-4 py-3 font-medium min-w-[110px]">Custo</th>}
                <th className="text-right px-4 py-3 font-medium min-w-[110px]">Venda</th>
                {canSeeCost(role) && <th className="text-right px-4 py-3 font-medium min-w-[90px]">Margem</th>}
                <th className="text-left px-4 py-3 font-medium min-w-[110px]">Status</th>
                <th className="text-center px-4 py-3 font-medium min-w-[70px]">Ativo</th>
                <th className="px-4 py-3 min-w-[80px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-16 text-center">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhum produto encontrado.</p>
                  <div className="flex flex-col items-center gap-2">
                    {canManageProducts(role) && (
                      <Button onClick={() => navigate("/painel/estoque/novo")} className="bg-gradient-primary">
                        <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro produto
                      </Button>
                    )}
                    {(q || filter !== "all") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setQ(""); setFilter("all"); }}
                        className="bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      >
                        Ver todos
                      </Button>
                    )}
                  </div>
                </td></tr>
              ) : paged.map((p) => {
                const margin = p.sale_price > 0 ? ((p.sale_price - p.cost_price) / p.sale_price) * 100 : 0;
                const low = p.stock_current <= p.stock_min;
                return (
                  <tr key={p.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="px-3 py-3 align-middle">
                      <Checkbox
                        checked={selectedIds.has(p.id)}
                        onCheckedChange={(v) => toggleOne(p.id, !!v)}
                        aria-label={`Selecionar ${p.name}`}
                      />
                    </td>
                    <td className="px-4 py-3 min-w-[180px] max-w-[280px]">
                      <div className="font-medium truncate" title={p.name}>{p.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">{p.sku || "—"}{p.brand ? ` · ${p.brand}` : ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="border-border text-xs">{categoryLabel[p.category] ?? p.category}</Badge>
                      <div className="text-[11px] text-muted-foreground mt-1 capitalize">{p.condition}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`metric font-bold text-lg leading-none ${low ? "text-warning" : ""}`}>{p.stock_current}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1 justify-end text-slate-400">
                        <span className="metric text-xs font-mono">{p.stock_min}</span>
                        {canManageProducts(role) && (
                          <button
                            type="button"
                            onClick={() => openMinEdit(p)}
                            title="Editar estoque mínimo"
                            aria-label="Editar estoque mínimo"
                            className="p-0.5 rounded text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    {canSeeCost(role) && <td className="px-4 py-3 text-right metric text-muted-foreground">{brl(Number(p.cost_price))}</td>}
                    <td className="px-4 py-3 text-right metric font-semibold">{brl(Number(p.sale_price))}</td>
                    {canSeeCost(role) && <td className="px-4 py-3 text-right">
                      <span className={`metric text-xs ${margin >= 30 ? "text-success" : margin >= 15 ? "text-warning" : "text-danger"}`}>{margin.toFixed(0)}%</span>
                    </td>}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {low && (
                          <button
                            type="button"
                            onClick={() => canManageProducts(role) && navigate("/painel/compras/novo")}
                            title={canManageProducts(role) ? "Sugerir pedido de compra" : "Estoque abaixo do mínimo"}
                            className="inline-flex"
                          >
                            <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/20 cursor-pointer">
                              <AlertTriangle className="h-3 w-3 mr-1" />Baixo
                            </Badge>
                          </button>
                        )}
                        {p.status === "promocao" && <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20">Promo</Badge>}
                        {p.status === "inativo" && <Badge variant="outline">Inativo</Badge>}
                        {!low && p.status === "ativo" && <Badge variant="outline" className="border-border text-muted-foreground">Ativo</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <Switch
                          checked={p.status === "ativo"}
                          onCheckedChange={(v) => toggleActive(p, v)}
                          disabled={!canManageProducts(role)}
                          aria-label={p.status === "ativo" ? "Desativar produto" : "Ativar produto"}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {canRegisterSale(role) && p.stock_current > 0 && (
                          <Button size="icon" variant="ghost" onClick={() => setSaleTarget(p)} title="Registrar venda">
                            <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        )}
                        {canManageProducts(role) && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => navigate(`/painel/estoque/${p.id}`)}>
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDelTarget(p)} className="text-danger hover:text-danger">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Paginação */}
        {!loading && filteredCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-border bg-surface-elevated/40">
            <div className="text-xs text-muted-foreground">
              Mostrando <b className="text-foreground">{(safePage - 1) * pageSize + 1}</b>–
              <b className="text-foreground">{Math.min(safePage * pageSize, filteredCount)}</b> de{" "}
              <b className="text-foreground">{num(filteredCount)}</b>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">por página</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v) as 20 | 50 | 100)}>
                <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-xs text-muted-foreground">
                <b className="text-foreground">{safePage}</b> / {totalPages}
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a remover <strong className="text-foreground">{delTarget?.name}</strong>. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-danger hover:bg-danger/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VendaRapidaModal
        open={!!saleTarget}
        onOpenChange={(o) => !o && setSaleTarget(null)}
        product={saleTarget}
        onDone={() => { setSaleTarget(null); load(); }}
      />

      <MarcasModal open={marcasOpen} onOpenChange={setMarcasOpen} />

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {bulkIds.length} produto(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os produtos selecionados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runBulkDelete} className="bg-danger hover:bg-danger/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk update dialog */}
      <Dialog open={!!bulkOp} onOpenChange={(o) => { if (!o) { setBulkOp(null); setBulkValue(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{bulkOp ? bulkOpLabel[bulkOp] : ""}</DialogTitle>
            <DialogDescription>
              Aplicar a {bulkIds.length} produto(s) selecionado(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs text-muted-foreground">
              {bulkOp === "price" ? "Novo preço de venda (R$)" :
               bulkOp === "stock_min" ? "Novo estoque mínimo" :
               "Novo valor"}
            </Label>
            {bulkOp === "price" || bulkOp === "stock_min" ? (
              <NumberInput
                autoFocus
                allowDecimal={bulkOp === "price"}
                min={0}
                value={Number(bulkValue) || 0}
                onValueChange={(n) => setBulkValue(String(n))}
              />
            ) : (
              <AutocompleteInput
                autoFocus
                options={bulkOptions}
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder={
                  bulkOp === "brand" ? "Digite ou selecione uma marca existente" :
                  bulkOp === "supplier" ? "Digite ou selecione um fornecedor existente" :
                  bulkOp === "category" ? "Ex: acessorio, aparelho_novo…" : ""
                }
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOp(null)} disabled={bulkSaving}>Cancelar</Button>
            <Button onClick={runBulkUpdate} disabled={bulkSaving} className="bg-gradient-primary">
              {bulkSaving ? "Salvando…" : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!minTarget} onOpenChange={(o) => !o && setMinTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar estoque mínimo</DialogTitle>
            <DialogDescription className="truncate">
              {minTarget?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="min-stock" className="text-xs text-muted-foreground">Quantidade mínima em estoque</Label>
              <NumberInput
                id="min-stock"
                allowDecimal={false}
                min={0}
                value={Number(minValue) || 0}
                onValueChange={(n) => setMinValue(String(n))}
                className="mt-1 h-10"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Quando o estoque atual atingir ou ficar abaixo desse valor, o produto será marcado como "Baixo" e aparecerá nas sugestões de pedido de compra.
              </p>
            </div>
            {minTarget && (
              <div className="text-[11px] font-mono text-muted-foreground bg-surface-elevated rounded px-2 py-1.5 flex items-center justify-between">
                <span>Estoque atual</span>
                <span className="text-foreground">{minTarget.stock_current}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMinTarget(null)} disabled={minSaving}>Cancelar</Button>
            <Button onClick={saveMin} disabled={minSaving} className="bg-gradient-primary">
              {minSaving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Peças (sincronizado com Assistência) */}
      <Card className="bg-card border-border shadow-card overflow-hidden mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface-elevated">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Peças</h3>
            <span className="text-[11px] text-muted-foreground font-mono">
              sincronizado com Assistência · {num(stockMetrics.parts_count)} itens · {num(stockMetrics.parts_units)} unid.
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/painel/pecas")}>
            Gerenciar peças
          </Button>
        </div>
      </Card>
    </div>
  );
}