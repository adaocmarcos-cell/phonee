import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { FileDown, Filter, Search, CheckSquare, Square } from "lucide-react";
import { DEFAULT_CATEGORIES, getCustomCategories, categoryLabel } from "@/lib/categories";
import { brl as formatBRL } from "@/lib/format";

// --- Sub-filters configuration (price table) ---
const PHONE_BRANDS = [
  "Samsung","Motorola","Xiaomi","Apple","Oppo","Realme","Honor","Infinix",
  "Tecno","POCO","Redmi","Vivo","ASUS","Nokia","Google","Huawei","OnePlus",
  "ZTE","Nubia","Sony",
];
const FONE_TYPES: { value: string; label: string; match: RegExp }[] = [
  { value: "fio", label: "Com fio", match: /\b(com\s*fio|p2|3\.5|cabo)\b/i },
  { value: "bluetooth", label: "Bluetooth", match: /bluetooth|bt\b|sem\s*fio|wireless|tws/i },
  { value: "headset", label: "Headset", match: /headset|headphone|over[-\s]?ear/i },
  { value: "intra", label: "Intra-auricular", match: /intra|in[-\s]?ear|earbud|earphone/i },
];
const MEMORY_SIZES = ["4GB","8GB","16GB","32GB","64GB","128GB","256GB","512GB","1TB","2TB"];
const CHARGER_TYPES: { value: string; label: string; match: RegExp }[] = [
  { value: "parede", label: "Carregador de parede", match: /parede|wall|tomada|fonte/i },
  { value: "powerbank", label: "Powerbank", match: /power\s*bank|powerbank|bateria\s*externa/i },
];
const CABLE_TYPES: { value: string; label: string; match: RegExp }[] = [
  { value: "usba_typec",   label: "USB-A → Type-C",         match: /usb[-\s]?a.*(type[-\s]?c|tipo[-\s]?c)|\ba\s*[-→x]\s*c\b/i },
  { value: "usbc_typec",   label: "USB-C → Type-C",         match: /usb[-\s]?c.*(type[-\s]?c|tipo[-\s]?c)|\bc\s*[-→x]\s*c\b/i },
  { value: "usba_light",   label: "USB-A → Lightning",      match: /usb[-\s]?a.*lightning|\ba\s*[-→x]\s*lightning\b/i },
  { value: "usbc_light",   label: "USB-C → Lightning",      match: /usb[-\s]?c.*lightning|\bc\s*[-→x]\s*lightning\b/i },
  { value: "usba_v8",      label: "USB-A → V8 (Micro USB)", match: /usb[-\s]?a.*(v8|micro\s*usb)|\ba\s*[-→x]\s*(v8|micro)/i },
  { value: "usbc_v8",      label: "USB-C → V8 (Micro USB)", match: /usb[-\s]?c.*(v8|micro\s*usb)|\bc\s*[-→x]\s*(v8|micro)/i },
];

function matchesBrandList(p: { name: string; brand: string | null }, brands: Set<string>) {
  if (!brands.size) return true;
  const hay = `${p.brand || ""} ${p.name}`.toLowerCase();
  for (const b of brands) if (hay.includes(b.toLowerCase())) return true;
  return false;
}
function matchesTypeList(p: { name: string }, types: Set<string>, defs: { value: string; match: RegExp }[]) {
  if (!types.size) return true;
  return defs.some((d) => types.has(d.value) && d.match.test(p.name));
}
function matchesMemory(p: { name: string }, sizes: Set<string>) {
  if (!sizes.size) return true;
  const name = p.name.toUpperCase().replace(/\s+/g, "");
  return [...sizes].some((s) => name.includes(s));
}

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  brand: string | null;
  sale_price: number;
  stock_current: number;
  status: string;
};

export default function TabelasPreco() {
  const { store } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [storeBrands, setStoreBrands] = useState<string[]>([]);
  // sub-filters per category
  const [phoneBrands, setPhoneBrands] = useState<Set<string>>(new Set());
  const [capaBrands, setCapaBrands] = useState<Set<string>>(new Set());
  const [foneTypes, setFoneTypes] = useState<Set<string>>(new Set());
  const [memorySizes, setMemorySizes] = useState<Set<string>>(new Set());
  const [chargerTypes, setChargerTypes] = useState<Set<string>>(new Set());
  const [cableTypes, setCableTypes] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [filterName, setFilterName] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterAvailable, setFilterAvailable] = useState<"all" | "in" | "out">("all");

  const [showAvailability, setShowAvailability] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const customCats = useMemo(() => getCustomCategories(), []);
  const allCats = useMemo(() => [...DEFAULT_CATEGORIES, ...customCats], [customCats]);

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("products")
        .select("id,name,sku,category,brand,sale_price,stock_current,status")
        .eq("store_id", store.id)
        .neq("status", "inativo")
        .order("name");
      setProducts((data ?? []) as any);
      setLoading(false);
      const { data: br } = await (supabase as any)
        .from("store_brands")
        .select("brand")
        .eq("store_id", store.id);
      const uniq = Array.from(new Set(((br ?? []) as { brand: string }[]).map((r) => r.brand))).sort();
      setStoreBrands(uniq);
    })();
  }, [store]);

  const toggleCat = (v: string) => {
    const next = new Set(selectedCats);
    next.has(v) ? next.delete(v) : next.add(v);
    setSelectedCats(next);
  };

  const toggleBrand = (v: string) => {
    const next = new Set(selectedBrands);
    next.has(v) ? next.delete(v) : next.add(v);
    setSelectedBrands(next);
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (selectedCats.size && !selectedCats.has(p.category || "")) return false;
      if (selectedBrands.size && !selectedBrands.has((p.brand || "").trim())) return false;
      if (filterName && !p.name.toLowerCase().includes(filterName.toLowerCase())) return false;
      if (filterSku && !(p.sku || "").toLowerCase().includes(filterSku.toLowerCase())) return false;
      if (filterAvailable === "in" && p.stock_current <= 0) return false;
      if (filterAvailable === "out" && p.stock_current > 0) return false;
      // category-specific sub-filters (apply only to relevant category)
      const cat = p.category || "";
      if (cat === "smartphones" && !matchesBrandList(p, phoneBrands)) return false;
      if (cat === "capas" && !matchesBrandList(p, capaBrands)) return false;
      if (cat === "fones" && !matchesTypeList(p, foneTypes, FONE_TYPES)) return false;
      if (cat === "memoria" && !matchesMemory(p, memorySizes)) return false;
      if ((cat === "carregadores" || cat === "powerbanks") && !matchesTypeList(p, chargerTypes, CHARGER_TYPES)) return false;
      if (cat === "cabos" && !matchesTypeList(p, cableTypes, CABLE_TYPES)) return false;
      return true;
    });
  }, [products, selectedCats, selectedBrands, filterName, filterSku, filterAvailable, phoneBrands, capaBrands, foneTypes, memorySizes, chargerTypes, cableTypes]);

  const toggleProduct = (id: string) => {
    const next = new Set(selectedProducts);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedProducts(next);
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedProducts);
    filtered.forEach((p) => next.add(p.id));
    setSelectedProducts(next);
  };

  const clearSelection = () => setSelectedProducts(new Set());

  const exportPDF = () => {
    const items = products.filter((p) => selectedProducts.has(p.id));
    if (!items.length) return toast.error("Selecione ao menos um produto");
    if (!store) return;

    const byCat = new Map<string, Product[]>();
    items.forEach((p) => {
      const k = p.category || "outros";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(p);
    });

    const today = new Date().toLocaleDateString("pt-BR");
    const storeName = store.trade_name || store.name;
    const s: any = store;
    const addrLine = [
      [s.address_street, s.address_number].filter(Boolean).join(", "),
      s.address_complement,
      s.address_neighborhood,
      [s.address_city, s.address_uf].filter(Boolean).join(" - "),
    ].filter(Boolean).join(" · ") || s.address || "";
    const showTaxId = s.show_tax_id_on_docs !== false;
    const showLegal = s.show_legal_name_on_docs !== false;
    const logoUrl = s.pdf_logo_url && /^https?:\/\//i.test(s.pdf_logo_url) ? s.pdf_logo_url : s.logo_url || "";
    const logoBlock = logoUrl
      ? `<img src="${logoUrl}" alt="logo" style="width:64px;height:64px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;background:#fff"/>`
      : `<div style="width:64px;height:64px;border:1px dashed #cbd5e1;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px">LOGO</div>`;

    const headerInfo = [
      showLegal && s.name && s.trade_name && s.name !== s.trade_name ? escapeHtml(s.name) : null,
      showTaxId && s.tax_id ? `CNPJ/CPF: ${escapeHtml(s.tax_id)}` : null,
      addrLine ? escapeHtml(addrLine) : null,
      [
        s.phone ? `Tel: ${escapeHtml(s.phone)}` : null,
        s.instagram ? escapeHtml(s.instagram) : null,
        s.email ? escapeHtml(s.email) : null,
      ].filter(Boolean).join(" · ") || null,
    ].filter(Boolean).map((l) => `<div class="line">${l}</div>`).join("");

    const note = store.price_table_note
      || "Valores sujeitos à disponibilidade de estoque e alteração sem aviso prévio.";

    const sections = Array.from(byCat.entries()).map(([cat, list]) => `
      <h2 style="font-size:14px;margin:18px 0 6px;color:#0f172a;border-bottom:2px solid #00abfb;padding-bottom:4px">
        ${categoryLabel(cat)}
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f1f5f9;color:#0f172a">
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Produto</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;width:110px">Código</th>
            ${showAvailability ? '<th style="text-align:center;padding:8px;border-bottom:1px solid #e2e8f0;width:90px">Disponível</th>' : ''}
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;width:110px">Preço</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((p) => `
            <tr>
              <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9">${escapeHtml(p.name)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;color:#64748b">${escapeHtml(p.sku || "—")}</td>
              ${showAvailability ? `<td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;text-align:center;color:${p.stock_current > 0 ? '#16a34a' : '#dc2626'}">${p.stock_current > 0 ? 'Sim' : 'Não'}</td>` : ''}
              <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${formatBRL(Number(p.sale_price))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tabela de Preços</title>
      <style>
        @page { size: A4; margin: 18mm 14mm; }
        body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#0f172a; background:#fff; margin:0 }
        header { display:flex; align-items:flex-start; gap:16px; justify-content:space-between; border-bottom:3px solid #00abfb; padding-bottom:12px; margin-bottom:16px }
        header .store { flex:1; min-width:0 }
        header .store .name { font-size:18px; font-weight:800; letter-spacing:.3px; text-transform:uppercase; margin-bottom:4px }
        header .store .line { font-size:11px; color:#475569; line-height:1.5 }
        header .right { text-align:right }
        footer { margin-top:30px; padding-top:10px; border-top:1px solid #e2e8f0; font-size:11px; color:#475569; text-align:center }
        .note { font-size:10px; color:#64748b; margin-top:6px; text-align:center; font-style:italic }
        h1 { font-size:18px; margin:0 0 4px }
        .meta { font-size:11px; color:#64748b }
      </style></head>
      <body>
        <header>
          ${logoBlock}
          <div class="store">
            <div class="name">${escapeHtml(storeName)}</div>
            ${headerInfo}
          </div>
          <div class="right">
            <h1>Tabela de Preços</h1>
            <div class="meta">Emitido em ${today}</div>
          </div>
        </header>
        ${sections}
        <footer>
          <div class="note">${escapeHtml(note)}</div>
        </footer>
        <script>window.onload=()=>{setTimeout(()=>window.print(),250)}</script>
      </body></html>`;

    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para exportar");
    w.document.write(html);
    w.document.close();
  };

  const totalSelected = selectedProducts.size;

  return (
    <div className="pb-24 md:pb-0">
      <PageHeader
        title="Tabelas de Preço"
        description="Selecione categorias e produtos para gerar uma tabela em PDF pronta para enviar ao cliente."
        actions={
          <Button onClick={exportPDF} className="bg-gradient-primary shadow-glow hidden md:inline-flex">
            <FileDown className="h-4 w-4 mr-1" /> Exportar PDF ({totalSelected})
          </Button>
        }
      />

      {/* Mobile filters toggle */}
      <div className="md:hidden mb-3">
        <Collapsible open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full">
              <Filter className="h-4 w-4 mr-1" /> Filtros e categorias
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <FiltersPanel
              allCats={allCats} selectedCats={selectedCats} toggleCat={toggleCat}
              storeBrands={storeBrands} selectedBrands={selectedBrands} toggleBrand={toggleBrand}
              filterName={filterName} setFilterName={setFilterName}
              filterSku={filterSku} setFilterSku={setFilterSku}
              filterAvailable={filterAvailable} setFilterAvailable={setFilterAvailable}
              showAvailability={showAvailability} setShowAvailability={setShowAvailability}
              showNotes={showNotes} setShowNotes={setShowNotes}
              phoneBrands={phoneBrands} setPhoneBrands={setPhoneBrands}
              capaBrands={capaBrands} setCapaBrands={setCapaBrands}
              foneTypes={foneTypes} setFoneTypes={setFoneTypes}
              memorySizes={memorySizes} setMemorySizes={setMemorySizes}
              chargerTypes={chargerTypes} setChargerTypes={setChargerTypes}
              cableTypes={cableTypes} setCableTypes={setCableTypes}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="hidden md:block">
          <FiltersPanel
            allCats={allCats} selectedCats={selectedCats} toggleCat={toggleCat}
            storeBrands={storeBrands} selectedBrands={selectedBrands} toggleBrand={toggleBrand}
            filterName={filterName} setFilterName={setFilterName}
            filterSku={filterSku} setFilterSku={setFilterSku}
            filterAvailable={filterAvailable} setFilterAvailable={setFilterAvailable}
            showAvailability={showAvailability} setShowAvailability={setShowAvailability}
            showNotes={showNotes} setShowNotes={setShowNotes}
            phoneBrands={phoneBrands} setPhoneBrands={setPhoneBrands}
            capaBrands={capaBrands} setCapaBrands={setCapaBrands}
            foneTypes={foneTypes} setFoneTypes={setFoneTypes}
            memorySizes={memorySizes} setMemorySizes={setMemorySizes}
            chargerTypes={chargerTypes} setChargerTypes={setChargerTypes}
            cableTypes={cableTypes} setCableTypes={setCableTypes}
          />
        </div>

        <Card className="p-4 bg-card border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-sm text-muted-foreground">
              {loading ? "Carregando…" : `${filtered.length} produto(s) · ${totalSelected} selecionado(s)`}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={selectAllFiltered}>
                <CheckSquare className="h-4 w-4 mr-1" /> Selecionar todos
              </Button>
              <Button size="sm" variant="outline" onClick={clearSelection}>
                <Square className="h-4 w-4 mr-1" /> Limpar
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {filtered.length === 0 && !loading && (
              <div className="text-sm text-muted-foreground py-6 text-center">
                Nenhum produto encontrado com os filtros atuais.
              </div>
            )}
            {filtered.map((p) => {
              const checked = selectedProducts.has(p.id);
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-3 py-2.5 px-1 cursor-pointer hover:bg-muted/40 rounded"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleProduct(p.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {categoryLabel(p.category)} · {p.sku || "sem código"} · Est: {p.stock_current}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{formatBRL(Number(p.sale_price))}</div>
                </label>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Sticky mobile export button */}
      <div className="md:hidden fixed bottom-0 inset-x-0 p-3 bg-background/95 backdrop-blur border-t border-border z-40">
        <Button onClick={exportPDF} className="w-full bg-gradient-primary shadow-glow">
          <FileDown className="h-4 w-4 mr-1" /> Exportar PDF ({totalSelected})
        </Button>
      </div>
    </div>
  );
}

function FiltersPanel(props: {
  allCats: { value: string; label: string }[];
  selectedCats: Set<string>;
  toggleCat: (v: string) => void;
  storeBrands: string[];
  selectedBrands: Set<string>;
  toggleBrand: (v: string) => void;
  filterName: string; setFilterName: (v: string) => void;
  filterSku: string; setFilterSku: (v: string) => void;
  filterAvailable: "all" | "in" | "out"; setFilterAvailable: (v: "all" | "in" | "out") => void;
  showAvailability: boolean; setShowAvailability: (v: boolean) => void;
  showNotes: boolean; setShowNotes: (v: boolean) => void;
  phoneBrands: Set<string>; setPhoneBrands: (v: Set<string>) => void;
  capaBrands: Set<string>; setCapaBrands: (v: Set<string>) => void;
  foneTypes: Set<string>; setFoneTypes: (v: Set<string>) => void;
  memorySizes: Set<string>; setMemorySizes: (v: Set<string>) => void;
  chargerTypes: Set<string>; setChargerTypes: (v: Set<string>) => void;
  cableTypes: Set<string>; setCableTypes: (v: Set<string>) => void;
}) {
  const {
    allCats, selectedCats, toggleCat,
    storeBrands, selectedBrands, toggleBrand,
    filterName, setFilterName, filterSku, setFilterSku,
    filterAvailable, setFilterAvailable,
    showAvailability, setShowAvailability,
    showNotes, setShowNotes,
    phoneBrands, setPhoneBrands,
    capaBrands, setCapaBrands,
    foneTypes, setFoneTypes,
    memorySizes, setMemorySizes,
    chargerTypes, setChargerTypes,
    cableTypes, setCableTypes,
  } = props;

  const toggleIn = (set: Set<string>, v: string, apply: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    apply(n);
  };
  const showSmart = !selectedCats.size || selectedCats.has("smartphones");
  const showCapas = !selectedCats.size || selectedCats.has("capas");
  const showFones = !selectedCats.size || selectedCats.has("fones");
  const showMem   = !selectedCats.size || selectedCats.has("memoria");
  const showCarr  = !selectedCats.size || selectedCats.has("carregadores") || selectedCats.has("powerbanks");
  const showCab   = !selectedCats.size || selectedCats.has("cabos");

  const renderChips = (
    title: string,
    items: { value: string; label: string }[],
    set: Set<string>,
    apply: (s: Set<string>) => void,
  ) => (
    <div>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</Label>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {items.map((it) => {
          const active = set.has(it.value);
          return (
            <button
              key={it.value}
              type="button"
              onClick={() => toggleIn(set, it.value, apply)}
              className={`text-xs px-2 py-1 rounded-md border transition ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card className="p-4 bg-card border-border space-y-4">
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias</Label>
        <div className="grid grid-cols-1 gap-1.5 mt-2 max-h-60 overflow-y-auto">
          {allCats.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={selectedCats.has(c.value)} onCheckedChange={() => toggleCat(c.value)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {showSmart && renderChips(
        "Smartphones · Marca",
        PHONE_BRANDS.map((b) => ({ value: b, label: b })),
        phoneBrands, setPhoneBrands,
      )}
      {showCapas && renderChips(
        "Capas · Marca",
        PHONE_BRANDS.map((b) => ({ value: b, label: b })),
        capaBrands, setCapaBrands,
      )}
      {showFones && renderChips(
        "Fones · Tipo",
        FONE_TYPES.map((t) => ({ value: t.value, label: t.label })),
        foneTypes, setFoneTypes,
      )}
      {showMem && renderChips(
        "Memória · Capacidade",
        MEMORY_SIZES.map((s) => ({ value: s, label: s })),
        memorySizes, setMemorySizes,
      )}
      {showCarr && renderChips(
        "Carregadores · Tipo",
        CHARGER_TYPES.map((t) => ({ value: t.value, label: t.label })),
        chargerTypes, setChargerTypes,
      )}
      {showCab && renderChips(
        "Cabos · Conector",
        CABLE_TYPES.map((t) => ({ value: t.value, label: t.label })),
        cableTypes, setCableTypes,
      )}

      {storeBrands.length > 0 && (
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marcas</Label>
          <div className="grid grid-cols-1 gap-1.5 mt-2 max-h-48 overflow-y-auto">
            {storeBrands.map((b) => (
              <label key={b} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={selectedBrands.has(b)} onCheckedChange={() => toggleBrand(b)} />
                <span>{b}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buscar</Label>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Nome" className="pl-8 h-9" value={filterName} onChange={(e) => setFilterName(e.target.value)} />
        </div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Código / SKU" className="pl-8 h-9" value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(["all", "in", "out"] as const).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={filterAvailable === v ? "default" : "outline"}
              className="flex-1 h-8 text-xs"
              onClick={() => setFilterAvailable(v)}
            >
              {v === "all" ? "Todos" : v === "in" ? "Em estoque" : "Sem estoque"}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exibir no PDF</Label>
        <div className="flex items-center justify-between text-sm">
          <span>Disponibilidade</span>
          <Switch checked={showAvailability} onCheckedChange={setShowAvailability} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>Observações</span>
          <Switch checked={showNotes} onCheckedChange={setShowNotes} />
        </div>
      </div>
    </Card>
  );
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}