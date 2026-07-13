import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canManageProducts } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import AutocompleteInput from "@/components/AutocompleteInput";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, ShoppingCart, Trash2, Package, CheckCircle2, PackagePlus, TrendingUp, TrendingDown, Wallet, DollarSign, RefreshCw, Pencil, Eye } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { MAIN_CATEGORIES, SUBCATEGORIES_BY_MAIN } from "@/lib/categories";
import { generateUniqueSku } from "@/lib/sku";
import { NONE_SUBCATEGORY } from "@/lib/productCategory";
import { LastEditFooter } from "@/components/audit/LastEditFooter";

type Supplier = { id: string; company_name: string; brands: string[]; avg_delivery_days: number | null };
type Item = { id?: string; product_id?: string | null; product_name: string; sku?: string | null; quantity: number; unit_cost: number; notes?: string | null };
type CatalogProduct = { id: string; name: string; sku: string | null; cost_price: number | null; category: string | null; brand: string | null };
type Preview = {
  name: string;
  quantity: number;
  unit_cost: number;
  exists: boolean;
  current_stock: number;
  new_stock: number;
  product_id: string | null;
};
type Order = {
  id: string;
  store_id: string;
  supplier: string | null;
  supplier_id: string | null;
  status: "rascunho" | "enviado" | "recebido" | "parcial" | "cancelado";
  total_cost: number;
  notes: string | null;
  payment_method: string | null;
  expected_delivery_at: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  payment_status?: string | null;
  paid_at?: string | null;
  due_date?: string | null;
  tags?: string[] | null;
};

const PAYMENT_METHODS = [
  "Dinheiro", "PIX", "Cartão de crédito", "Cartão de débito",
  "Boleto", "Transferência", "Cheque",
  "Crediário 30 dias", "Crediário 30/60", "Crediário 30/60/90", "Outro",
];

const STATUS_LABEL: Record<Order["status"], string> = {
  rascunho: "Rascunho", enviado: "Enviado", recebido: "Recebido", parcial: "Parcial", cancelado: "Cancelado",
};
const STATUS_COLOR: Record<Order["status"], string> = {
  rascunho: "bg-muted text-muted-foreground border-border",
  enviado: "bg-primary/15 text-primary border-primary/30",
  recebido: "bg-success/15 text-success border-success/30",
  parcial: "bg-warning/15 text-warning border-warning/30",
  cancelado: "bg-danger/15 text-danger border-danger/30",
};

// Resumo textual do delta entre itens originais e atuais para o toast final.
function buildDeltaSummary(before: Item[], after: Item[], newTotal: number): string | null {
  const key = (it: Item) => it.id ?? `new:${it.product_id ?? ""}:${it.product_name}`;
  const beforeMap = new Map<string, Item>();
  before.forEach((b) => beforeMap.set(key(b), b));
  const parts: string[] = [];
  after.forEach((a) => {
    const b = beforeMap.get(key(a));
    const diff = Number(a.quantity || 0) - Number(b?.quantity || 0);
    if (diff !== 0) parts.push(`${diff > 0 ? "+" : ""}${diff} ${a.product_name || "item"}`);
    if (b) beforeMap.delete(key(a));
  });
  beforeMap.forEach((b) => parts.push(`−${Number(b.quantity || 0)} ${b.product_name || "item"}`));
  if (parts.length === 0) return `total ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(newTotal)}`;
  const shown = parts.slice(0, 4).join(" · ");
  const extra = parts.length > 4 ? ` · +${parts.length - 4} alteraç${parts.length - 4 === 1 ? "ão" : "ões"}` : "";
  return `${shown}${extra} · total ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(newTotal)}`;
}

export default function Compras() {
  const { store, role } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [fSupplier, setFSupplier] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPeriod, setFPeriod] = useState<string>("90");
  const [loading, setLoading] = useState(true);

  // dialog
  const [open, setOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Order>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [originalItems, setOriginalItems] = useState<Item[]>([]);
  // Read-only "Ver detalhes"
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [viewItems, setViewItems] = useState<Item[]>([]);
  const [bulk, setBulk] = useState("");
  const [delTarget, setDelTarget] = useState<Order | null>(null);
  const [skuQuery, setSkuQuery] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // Catálogo (autocomplete) + criação inline de produto
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [openSuggestFor, setOpenSuggestFor] = useState<number | null>(null);
  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProdTargetIdx, setNewProdTargetIdx] = useState<number | null>(null);
  const [newProd, setNewProd] = useState<{ name: string; sku: string; brand: string; category: string; subcategory: string; cost_price: number; sale_price: number }>({
    name: "", sku: "", brand: "", category: "", subcategory: NONE_SUBCATEGORY, cost_price: 0, sale_price: 0,
  });
  const [newProdBusy, setNewProdBusy] = useState(false);
  const [newSkuBusy, setNewSkuBusy] = useState(false);

  // Refs dos inputs de produto/qtd por linha (para restaurar foco após popup)
  const productInputsRef = useRef<Record<number, HTMLInputElement | null>>({});
  const qtyInputsRef = useRef<Record<number, HTMLInputElement | null>>({});

  // Debounce da busca do autocomplete + índice ativo para navegação por teclado
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [activeSuggestIdx, setActiveSuggestIdx] = useState(0);
  useEffect(() => {
    if (openSuggestFor == null) { setDebouncedTerm(""); return; }
    const term = items[openSuggestFor]?.product_name ?? "";
    const t = setTimeout(() => setDebouncedTerm(term), 160);
    return () => clearTimeout(t);
  }, [openSuggestFor, items]);
  useEffect(() => { setActiveSuggestIdx(0); }, [debouncedTerm, openSuggestFor]);

  // Fallback: se o autocomplete local não achar nada (ex.: catálogo com muitos
  // produtos ou item sem estoque que não veio no lote inicial), busca ao vivo
  // no banco por nome/SKU e mescla no catálogo. Assim, produtos existentes em
  // Estoque — mesmo com estoque zero — aparecem como sugestão em Compras.
  useEffect(() => {
    if (!store) return;
    const term = debouncedTerm.trim();
    if (term.length < 2) return;
    const local = suggestFor(term);
    if (local.length > 0) return;
    let cancelled = false;
    (async () => {
      const like = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, cost_price, category, brand")
        .eq("store_id", store.id)
        .or(`name.ilike.${like},sku.ilike.${like}`)
        .limit(20);
      if (cancelled || !data || data.length === 0) return;
      setCatalog((prev) => {
        const map = new Map(prev.map((p) => [p.id, p] as const));
        for (const row of data as any[]) {
          map.set(row.id, {
            id: row.id,
            name: row.name,
            sku: row.sku ?? null,
            cost_price: row.cost_price ?? null,
            category: row.category ?? null,
            brand: row.brand ?? null,
          });
        }
        return Array.from(map.values());
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTerm, store]);

  const focusRow = (idx: number, field: "product" | "qty" = "product") => {
    // aguarda o próximo tick para o Radix devolver o foco após fechar o Dialog
    setTimeout(() => {
      const el = field === "qty" ? qtyInputsRef.current[idx] : productInputsRef.current[idx];
      el?.focus();
      if (field === "qty" && el) (el as HTMLInputElement).select?.();
    }, 60);
  };

  // Destaca a parte casada do termo (case-insensitive)
  const highlight = (text: string, term: string) => {
    const t = term.trim();
    if (!t) return text;
    const i = text.toLowerCase().indexOf(t.toLowerCase());
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className="bg-primary/20 text-primary px-0.5 rounded-sm">{text.slice(i, i + t.length)}</mark>
        {text.slice(i + t.length)}
      </>
    );
  };

  // financial summary (mês atual)
  const [monthSales, setMonthSales] = useState(0);
  const [monthPurchases, setMonthPurchases] = useState(0);
  const [monthExpenses, setMonthExpenses] = useState(0);

  // validação/preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<Preview[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const iso = monthStart.toISOString();
    const [{ data: o }, { data: s }, { data: salesM }, { data: expM }] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("store_id", store.id).order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, company_name, brands, avg_delivery_days").eq("store_id", store.id).eq("active", true).order("company_name"),
      supabase.from("sales").select("total, created_at").eq("store_id", store.id).gte("created_at", iso),
      supabase.from("expenses").select("amount, expense_date").eq("store_id", store.id).gte("expense_date", monthStart.toISOString().slice(0, 10)),
    ]);
    setOrders((o ?? []) as Order[]);
    setSuppliers((s ?? []) as Supplier[]);
    setMonthSales((salesM ?? []).reduce((a: number, r: any) => a + Number(r.total ?? 0), 0));
    setMonthExpenses((expM ?? []).reduce((a: number, r: any) => a + Number(r.amount ?? 0), 0));
    const mp = (o ?? []).filter((r: any) => new Date(r.created_at) >= monthStart)
      .reduce((a: number, r: any) => a + Number(r.total_cost ?? 0), 0);
    setMonthPurchases(mp);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  // Carrega catálogo leve quando abre o diálogo (para autocomplete por nome/SKU)
  useEffect(() => {
    if (!open || !store) return;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, cost_price, category, brand")
        .eq("store_id", store.id)
        .order("name")
        .limit(2000);
      setCatalog((data ?? []) as CatalogProduct[]);
    })();
  }, [open, store]);

  // Sincronização em tempo real: qualquer produto criado/editado/removido em
  // Estoque aparece imediatamente no autocomplete de Compras (mesma base).
  useEffect(() => {
    if (!store) return;
    const channel = supabase
      .channel(`products-sync-${store.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `store_id=eq.${store.id}` },
        (payload) => {
          setCatalog((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as any)?.id;
              return prev.filter((p) => p.id !== oldId);
            }
            const row = payload.new as any;
            const next: CatalogProduct = {
              id: row.id,
              name: row.name,
              sku: row.sku ?? null,
              cost_price: row.cost_price ?? null,
              category: row.category ?? null,
              brand: row.brand ?? null,
            };
            const idx = prev.findIndex((p) => p.id === next.id);
            if (idx === -1) return [next, ...prev];
            const copy = prev.slice();
            copy[idx] = next;
            return copy;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [store]);

  const suggestFor = (term: string): CatalogProduct[] => {
    const t = term.trim().toLowerCase();
    if (t.length < 2) return [];
    // Prioriza matches por SKU exato e por prefixo de nome
    const scored = catalog
      .map((p) => {
        const name = (p.name ?? "").toLowerCase();
        const sku = (p.sku ?? "").toLowerCase();
        let score = -1;
        if (sku === t) score = 100;
        else if (sku.startsWith(t)) score = 80;
        else if (name.startsWith(t)) score = 60;
        else if (name.includes(t)) score = 40;
        else if (sku.includes(t)) score = 30;
        return { p, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.p);
    return scored;
  };

  const pickSuggestion = (idx: number, p: CatalogProduct) => {
    setItems((a) => a.map((x, i) => i === idx ? {
      ...x,
      product_id: p.id,
      product_name: p.name,
      sku: p.sku ?? "",
      unit_cost: x.unit_cost > 0 ? x.unit_cost : Number(p.cost_price ?? 0),
    } : x));
    setOpenSuggestFor(null);
  };

  const openNewProductFor = (idx: number) => {
    const it = items[idx];
    setNewProdTargetIdx(idx);
    setNewProd({
      name: it?.product_name?.trim() ?? "",
      sku: it?.sku ?? "",
      brand: "",
      category: "",
      subcategory: NONE_SUBCATEGORY,
      cost_price: Number(it?.unit_cost ?? 0),
      sale_price: 0,
    });
    setNewProdOpen(true);
  };

  const saveNewProduct = async (keepOpen: boolean) => {
    if (!store) return;
    const name = newProd.name.trim();
    if (!name) { toast.error("Informe o nome do produto"); return; }
    if (!newProd.category) { toast.error("Selecione uma categoria"); return; }
    setNewProdBusy(true);
    const payload: any = {
      store_id: store.id,
      name,
      sku: newProd.sku.trim() || null,
      brand: newProd.brand.trim() || null,
      category: newProd.category,
      subcategory: newProd.subcategory && newProd.subcategory !== NONE_SUBCATEGORY ? newProd.subcategory : null,
      cost_price: Number(newProd.cost_price) || 0,
      sale_price: Number(newProd.sale_price) || 0,
      stock_current: 0,
      stock_min: 3,
      stock_max: 0,
      condition: "novo",
      status: "ativo",
      visible_in_catalog: false,
    };
    const { data, error } = await supabase.from("products").insert(payload).select("id, name, sku, cost_price, category, brand").single();
    setNewProdBusy(false);
    if (error) {
      if ((error as any).code === "23505") return toast.error("Este SKU já está em uso.");
      return toast.error(error.message);
    }
    const created = data as CatalogProduct;
    setCatalog((c) => [created, ...c]);
    // Vincula ao item da compra
    const targetIdx = newProdTargetIdx;
    if (targetIdx != null) {
      setItems((a) => a.map((x, i) => i === targetIdx ? {
        ...x,
        product_id: created.id,
        product_name: created.name,
        sku: created.sku ?? "",
        unit_cost: x.unit_cost > 0 ? x.unit_cost : Number(created.cost_price ?? 0),
      } : x));
    }
    toast.success("Produto cadastrado");
    // Em ambos os casos, fecha o popup, mantém o formulário de Compras aberto
    // e devolve o foco à mesma linha (Compras nunca é fechado).
    setNewProdOpen(false);
    setNewProdTargetIdx(null);
    if (targetIdx != null) {
      // "Salvar e continuar" → foco no campo do produto da mesma linha
      // "Salvar e vincular" → avança para a quantidade da mesma linha
      focusRow(targetIdx, keepOpen ? "product" : "qty");
    }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const cutoff = fPeriod === "all" ? 0 : Date.now() - Number(fPeriod) * 24 * 3600 * 1000;
    return orders.filter((o) => {
      if (fSupplier !== "all" && o.supplier_id !== fSupplier) return false;
      if (fStatus !== "all" && o.status !== fStatus) return false;
      if (cutoff && new Date(o.created_at).getTime() < cutoff) return false;
      if (term && !`${o.supplier ?? ""} ${o.notes ?? ""} ${o.payment_method ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [orders, q, fSupplier, fStatus, fPeriod]);

  const totals = useMemo(() => {
    const purchased = filtered.reduce((s, o) => s + Number(o.total_cost ?? 0), 0);
    const lastOrders = [...filtered].slice(0, 5);
    return {
      count: filtered.length,
      purchased,
      activeSuppliers: new Set(filtered.map((o) => o.supplier_id).filter(Boolean)).size,
      lastOrders,
    };
  }, [filtered]);

  const startNew = () => {
    setForm({
      status: "rascunho", payment_method: "", expected_delivery_at: "", notes: "",
      supplier_id: null, supplier: "",
      payment_status: "a_pagar", due_date: "", tags: [],
      received_at: new Date().toISOString().slice(0, 10),
    } as any);
    setItems([{ product_name: "", quantity: 0, unit_cost: 0 }]);
    setOriginalItems([]);
    setBulk("");
    setSkuQuery("");
    setTagsInput("");
    setEditingOrderId(null);
    setOpen(true);
  };

  const startEdit = async (o: Order) => {
    const { data: full } = await supabase.from("purchase_orders").select("*").eq("id", o.id).maybeSingle();
    const { data: its } = await supabase
      .from("purchase_order_items")
      .select("id, product_id, product_name, sku, quantity, unit_cost, notes")
      .eq("order_id", o.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (!full) return toast.error("Compra não encontrada.");
    setForm({
      ...(full as any),
      expected_delivery_at: (full as any).expected_delivery_at ? String((full as any).expected_delivery_at).slice(0, 10) : "",
      due_date: (full as any).due_date ?? "",
      received_at: (full as any).received_at ? String((full as any).received_at).slice(0, 10) : "",
    } as any);
    const loaded: Item[] = ((its ?? []) as any[]).map((r) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: r.product_name,
      sku: r.sku,
      quantity: Number(r.quantity || 0),
      unit_cost: Number(r.unit_cost || 0),
      notes: r.notes,
    }));
    setItems(loaded);
    setOriginalItems(loaded);
    setBulk("");
    setSkuQuery("");
    setTagsInput((full as any).tags?.join(", ") ?? "");
    setEditingOrderId(o.id);
    setOpen(true);
  };

  const openView = async (o: Order) => {
    const { data: its } = await supabase
      .from("purchase_order_items")
      .select("id, product_id, product_name, sku, quantity, unit_cost, notes")
      .eq("order_id", o.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    setViewItems(((its ?? []) as any[]).map((r) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: r.product_name,
      sku: r.sku,
      quantity: Number(r.quantity || 0),
      unit_cost: Number(r.unit_cost || 0),
      notes: r.notes,
    })));
    setViewOrder(o);
  };

  const orderTotal = useMemo(() => items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0), [items]);

  const applyBulk = () => {
    const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed: Item[] = lines.map((l) => {
      // formato: nome;qtd;custo
      const parts = l.split(/[;\t,]/).map((p) => p.trim());
      const name = parts[0] ?? "";
      const qty = Number((parts[1] ?? "1").replace(",", ".")) || 1;
      const cost = Number((parts[2] ?? "0").replace(",", ".")) || 0;
      return { product_name: name, quantity: qty, unit_cost: cost };
    }).filter((i) => i.product_name);
    if (parsed.length === 0) { toast.error("Nenhuma linha válida"); return; }
    setItems((arr) => [...arr.filter((i) => i.product_name), ...parsed]);
    setBulk("");
    toast.success(`${parsed.length} item(s) adicionado(s)`);
  };

  const addBySku = async () => {
    if (!store || !skuQuery.trim()) return;
    const sku = skuQuery.trim();
    const { data: prod } = await supabase
      .from("products")
      .select("id, name, sku, cost_price")
      .eq("store_id", store.id)
      .ilike("sku", sku)
      .limit(1)
      .maybeSingle();
    if (!prod) {
      toast.error(`Nenhum produto encontrado com SKU "${sku}"`);
      return;
    }
    setItems((arr) => {
      const exists = arr.find((x) => x.product_id === prod.id);
      if (exists) {
        return arr.map((x) => x.product_id === prod.id ? { ...x, quantity: x.quantity + 1 } : x);
      }
      const empty = arr.findIndex((x) => !x.product_name.trim());
      const next: Item = { product_id: prod.id, product_name: prod.name, sku: prod.sku, quantity: 1, unit_cost: Number(prod.cost_price ?? 0) };
      if (empty >= 0) {
        return arr.map((x, i) => i === empty ? next : x);
      }
      return [...arr, next];
    });
    setSkuQuery("");
    toast.success(`${prod.name} adicionado`);
  };

  // Antes de salvar, valida cada item: existe no estoque? saldo atual e após entrada
  const buildPreview = async () => {
    if (!store) return;
    const missingQty = items.find((i) => i.product_name.trim() && (!i.quantity || i.quantity <= 0));
    if (missingQty) { toast.error(`Informe a quantidade do item ${missingQty.product_name.trim()}`); return; }
    const validItems = items.filter((i) => i.product_name.trim() && i.quantity > 0);
    if (validItems.length === 0) { toast.error("Adicione ao menos um item"); return; }
    const result: Preview[] = [];
    for (const it of validItems) {
      const name = it.product_name.trim();
      const { data: found } = await supabase
        .from("products")
        .select("id, stock_current")
        .eq("store_id", store.id)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      const current = found ? Number(found.stock_current ?? 0) : 0;
      result.push({
        name,
        quantity: Number(it.quantity),
        unit_cost: Number(it.unit_cost),
        exists: !!found,
        current_stock: current,
        new_stock: current + Number(it.quantity),
        product_id: found?.id ?? null,
      });
    }
    setPreview(result);
    setPreviewOpen(true);
  };

  const save = async () => {
    if (!store) return;
    const validItems = items.filter((i) => i.product_name.trim() && i.quantity > 0);
    if (validItems.length === 0) { toast.error("Adicione ao menos um item"); return; }
    setSaving(true);
    // Fornecedor: aceita cadastrado (id) OU digitado livre (nome).
    const typedName = ((form as any).supplier ?? "").toString().trim();
    const matched = suppliers.find(
      (s) => s.company_name.toLowerCase() === typedName.toLowerCase(),
    );
    const supplierId = form.supplier_id || matched?.id || null;
    const supplierName = matched?.company_name
      ?? (typedName || suppliers.find((s) => s.id === form.supplier_id)?.company_name)
      ?? null;
    const tagList = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const itemsPayload = validItems.map((it) => ({
      product_id: it.product_id || null,
      product_name: it.product_name.trim(),
      sku: it.sku || null,
      quantity: Number(it.quantity),
      unit_cost: Number(it.unit_cost),
      notes: it.notes || null,
    }));

    const isEdit = !!editingOrderId;
    toast.info(isEdit ? "Atualizando entrada e recalculando estoque…" : "Registrando entrada de mercadorias…");
    const { data, error } = isEdit
      ? await supabase.rpc("update_purchase_with_stock" as any, {
          _order_id: editingOrderId,
          _supplier_id: supplierId,
          _supplier_name: supplierName,
          _payment_method: form.payment_method || null,
          _payment_status: form.payment_status || "a_pagar",
          _due_date: form.due_date || null,
          _expected_delivery_at: form.expected_delivery_at || null,
          _notes: form.notes || null,
          _tags: tagList,
          _items: itemsPayload,
          _create_expense: true,
        })
      : await supabase.rpc("create_purchase_with_stock" as any, {
          _store_id: store.id,
          _supplier_id: supplierId,
          _supplier_name: supplierName,
          _payment_method: form.payment_method || null,
          _payment_status: form.payment_status || "a_pagar",
          _due_date: form.due_date || null,
          _expected_delivery_at: form.expected_delivery_at || null,
          _notes: form.notes || null,
          _tags: tagList,
          _items: itemsPayload,
          _create_expense: true,
        });
    if (error) {
      setSaving(false);
      const msg = error.message || "";
      if (/já foram vendidas/i.test(msg)) toast.error(msg);
      else toast.error(`Falha na entrada de mercadorias — nada foi gravado: ${msg}`);
      return;
    }
    const res = (data ?? {}) as { total_units?: number; created?: number; updated?: number };
    if (!isEdit) {
      const receivedAt = (form as any).received_at as string | undefined;
      const orderId = (data as any)?.order_id as string | undefined;
      if (receivedAt && orderId) {
        const iso = new Date(`${receivedAt}T12:00:00`).toISOString();
        await supabase.from("purchase_orders").update({ received_at: iso }).eq("id", orderId);
      }
      toast.success(`Entrada concluída · ${res.total_units ?? 0} un. no estoque`);
      if ((res.created ?? 0) > 0) toast.message(`${res.created} produto(s) novo(s) cadastrado(s)`);
      if ((res.updated ?? 0) > 0) toast.message(`${res.updated} produto(s) tiveram saldo atualizado`);
      if (form.payment_status === "pago" && orderTotal > 0) toast.message("Despesa lançada no financeiro");
    } else {
      toast.success("Entrada atualizada · estoque recalculado por delta");
      const summary = buildDeltaSummary(originalItems, items, orderTotal);
      if (summary) toast.message(summary);
    }
    setSaving(false);
    setPreviewOpen(false);
    setOpen(false);
    setEditingOrderId(null);
    load();
  };

  const updateStockOnReceive = async (_orderId: string, its: Item[]) => {
    for (const it of its) {
      if (!it.product_id) continue;
      const { data: prod } = await supabase.from("products").select("stock_current").eq("id", it.product_id).maybeSingle();
      if (!prod) continue;
      await supabase.from("products").update({ stock_current: Number(prod.stock_current ?? 0) + Number(it.quantity) }).eq("id", it.product_id);
    }
  };

  const markAsReceived = async (o: Order) => {
    const { data: its } = await supabase.from("purchase_order_items").select("*").eq("order_id", o.id);
    await supabase.from("purchase_orders").update({ status: "recebido", received_at: new Date().toISOString() }).eq("id", o.id);
    if (its) {
      toast.info("Sincronizando entrada de mercadorias com o estoque…");
      await updateStockOnReceive(o.id, its as any);
    }
    toast.success("Compra recebida e estoque atualizado");
    load();
  };

  const remove = async () => {
    if (!delTarget) return;
    await supabase.from("purchase_order_items").delete().eq("order_id", delTarget.id);
    const { error } = await supabase.from("purchase_orders").delete().eq("id", delTarget.id);
    setDelTarget(null);
    if (error) return toast.error(error.message);
    toast.success("Compra removida");
    load();
  };

  const can = canManageProducts(role);

  return (
    <div>
      <PageHeader
        title="Compras"
        actions={can && (
          <Button onClick={startNew} className="bg-gradient-primary shadow-glow">
            <PackagePlus className="h-4 w-4 mr-1" /> Entrada de mercadorias
          </Button>
        )}
      />

      {/* Resumo financeiro do mês — sincronizado com vendas, compras e despesas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card className="p-3 bg-card border-border">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground font-mono"><TrendingUp className="h-3 w-3 text-success" /> Vendas no mês</div>
          <div className="text-xl font-semibold mt-1 text-success">{brl(monthSales)}</div>
        </Card>
        <Card className="p-3 bg-card border-border">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground font-mono"><ShoppingCart className="h-3 w-3 text-primary" /> Compras no mês</div>
          <div className="text-xl font-semibold mt-1">{brl(monthPurchases)}</div>
        </Card>
        <Card className="p-3 bg-card border-border">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground font-mono"><Wallet className="h-3 w-3 text-warning" /> Despesas</div>
          <div className="text-xl font-semibold mt-1">{brl(monthExpenses)}</div>
        </Card>
        <Card className="p-3 bg-card border-border">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground font-mono"><TrendingDown className="h-3 w-3 text-danger" /> Todos os gastos</div>
          <div className="text-xl font-semibold mt-1 text-danger">{brl(monthPurchases + monthExpenses)}</div>
        </Card>
        <Card className="p-3 bg-card border-border ring-1 ring-primary/20">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground font-mono"><DollarSign className="h-3 w-3 text-primary" /> Lucro líquido</div>
          <div className={`text-xl font-semibold mt-1 ${(monthSales - monthPurchases - monthExpenses) >= 0 ? "text-success" : "text-danger"}`}>
            {brl(monthSales - monthPurchases - monthExpenses)}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Pedidos</div><div className="text-xl font-semibold mt-1">{totals.count}</div></Card>
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Valor comprado</div><div className="text-xl font-semibold mt-1">{brl(totals.purchased)}</div></Card>
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Fornecedores ativos</div><div className="text-xl font-semibold mt-1">{totals.activeSuppliers}</div></Card>
        <Card className="p-3 bg-card border-border">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Últimas compras</div>
          <div className="mt-1 text-[12px] text-muted-foreground space-y-0.5">
            {totals.lastOrders.length === 0 ? <div>—</div> : totals.lastOrders.slice(0, 3).map((o) => (
              <div key={o.id} className="truncate">{new Date(o.created_at).toLocaleDateString("pt-BR")} · {o.supplier ?? "Sem fornecedor"} · {brl(Number(o.total_cost ?? 0))}</div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar compras…" className="pl-9 h-10 bg-card border-border" />
        </div>
        <Select value={fSupplier} onValueChange={setFSupplier}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os fornecedores</SelectItem>
            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="md:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {(Object.keys(STATUS_LABEL) as Order["status"][]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fPeriod} onValueChange={setFPeriod}>
          <SelectTrigger className="md:w-36"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">3 meses</SelectItem>
            <SelectItem value="180">6 meses</SelectItem>
            <SelectItem value="365">12 meses</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-left px-4 py-3 font-medium">Fornecedor</th>
                <th className="text-left px-4 py-3 font-medium">Pagamento</th>
                <th className="text-left px-4 py-3 font-medium">Previsão</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center">
                  <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhuma compra encontrada.</p>
                  {can && <Button onClick={startNew} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" /> Registrar primeira compra</Button>}
                </td></tr>
              ) : filtered.map((o) => (
                <tr key={o.id} className="hover:bg-surface-elevated/40 transition-colors">
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3"><div className="font-medium">{o.supplier ?? "—"}</div></td>
                  <td className="px-4 py-3 text-[12px]">{o.payment_method ?? "—"}</td>
                  <td className="px-4 py-3 text-[12px]">{o.expected_delivery_at ? new Date(o.expected_delivery_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3 text-right metric font-semibold">{brl(Number(o.total_cost ?? 0))}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {can && o.status !== "recebido" && o.status !== "cancelado" && (
                        <Button size="sm" variant="ghost" onClick={() => markAsReceived(o)} title="Marcar como recebido">
                          <CheckCircle2 className="h-4 w-4 mr-1 text-success" /> Receber
                        </Button>
                      )}
                      {can && (
                        <Button size="icon" variant="ghost" onClick={() => startEdit(o)} title="Editar compra">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {can && (
                        <Button size="icon" variant="ghost" onClick={() => setDelTarget(o)} className="text-danger hover:text-danger">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrderId ? "Editar entrada de mercadorias" : "Entrada de mercadorias"}</DialogTitle>
            {editingOrderId && (
              <p className="text-xs text-muted-foreground mt-1">
                O estoque será recalculado pela diferença entre itens antigos e novos. Se algum produto já foi vendido, a redução é bloqueada.
              </p>
            )}
          </DialogHeader>
          {editingOrderId && (
            <LastEditFooter entity="purchase_order" entityId={editingOrderId} className="mb-3" />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Fornecedor</Label>
              <Input
                list="compras-fornecedores"
                placeholder="Digite ou selecione (pode não estar cadastrado)"
                value={(form as any).supplier ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const match = suppliers.find((s) => s.company_name.toLowerCase() === v.trim().toLowerCase());
                  setForm({ ...form, supplier: v, supplier_id: match?.id ?? null } as any);
                }}
              />
              <datalist id="compras-fornecedores">
                {suppliers.map((s) => <option key={s.id} value={s.company_name} />)}
              </datalist>
              {((form as any).supplier ?? "").trim() && !form.supplier_id && (
                <p className="text-[11px] text-warning mt-1">Fornecedor não cadastrado — será salvo apenas como nome nesta compra.</p>
              )}
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={form.payment_method ?? ""} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="mt-2 flex items-center gap-1 p-1 bg-surface-elevated border border-border rounded-md w-fit">
                <Button
                  size="sm"
                  variant={form.payment_status === "pago" ? "default" : "ghost"}
                  className={form.payment_status === "pago" ? "bg-success text-white hover:bg-success/90 h-7" : "h-7"}
                  onClick={() => setForm({ ...form, payment_status: "pago" })}
                  type="button"
                >
                  Pago
                </Button>
                <Button
                  size="sm"
                  variant={form.payment_status === "a_pagar" ? "default" : "ghost"}
                  className={form.payment_status === "a_pagar" ? "bg-warning text-white hover:bg-warning/90 h-7" : "h-7"}
                  onClick={() => setForm({ ...form, payment_status: "a_pagar" })}
                  type="button"
                >
                  A pagar
                </Button>
              </div>
              {form.payment_status === "a_pagar" && (
                <div className="mt-2">
                  <Label className="text-[11px] text-muted-foreground">Vencimento</Label>
                  <Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
              )}
            </div>
            <div>
              <Label>Previsão de entrega</Label>
              <Input type="date" value={form.expected_delivery_at ?? ""} onChange={(e) => setForm({ ...form, expected_delivery_at: e.target.value })} />
            </div>
            <div>
              <Label>Data de entrada da mercadoria</Label>
              <Input
                type="date"
                value={(form as any).received_at ?? ""}
                onChange={(e) => setForm({ ...form, received_at: e.target.value } as any)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Data em que os itens efetivamente entraram no estoque.</p>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "rascunho"} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(STATUS_LABEL) as Order["status"][]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label>Itens</Label>
              <Button size="sm" variant="outline" onClick={() => setItems((a) => [...a, { product_name: "", quantity: 0, unit_cost: 0 }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar item
              </Button>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-7 relative">
                    <Input
                      ref={(el) => { productInputsRef.current[idx] = el; }}
                      placeholder="Buscar produto por nome ou SKU…"
                      value={it.product_name}
                      onFocus={() => setOpenSuggestFor(idx)}
                      onBlur={() => setTimeout(() => setOpenSuggestFor((v) => v === idx ? null : v), 150)}
                      onKeyDown={(e) => {
                        if (openSuggestFor !== idx) return;
                        const sugg = suggestFor(debouncedTerm || it.product_name);
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setActiveSuggestIdx((i) => Math.min(i + 1, Math.max(sugg.length - 1, 0)));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setActiveSuggestIdx((i) => Math.max(i - 1, 0));
                        } else if (e.key === "Enter") {
                          if (sugg.length > 0) {
                            e.preventDefault();
                            const chosen = sugg[Math.min(activeSuggestIdx, sugg.length - 1)];
                            pickSuggestion(idx, chosen);
                            focusRow(idx, "qty");
                          } else if (it.product_name.trim().length >= 2) {
                            e.preventDefault();
                            openNewProductFor(idx);
                          }
                        } else if (e.key === "Escape") {
                          setOpenSuggestFor(null);
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        // Busca única: se o texto casar exatamente com um SKU do catálogo, vincula automaticamente.
                        const skuHit = catalog.find((p) => (p.sku ?? "").toLowerCase() === v.trim().toLowerCase());
                        if (skuHit) {
                          pickSuggestion(idx, skuHit);
                          return;
                        }
                        setItems((a) => a.map((x, i) => i === idx ? { ...x, product_name: v, sku: "", product_id: null } : x));
                        setOpenSuggestFor(idx);
                      }}
                    />
                    {it.product_id && it.sku && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30">
                        SKU {it.sku}
                      </div>
                    )}
                    {openSuggestFor === idx && (debouncedTerm || it.product_name).trim().length >= 2 && (() => {
                      const term = (debouncedTerm || it.product_name).trim();
                      const sugg = suggestFor(debouncedTerm || it.product_name);
                      return (
                        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                          {sugg.length === 0 ? (
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-[13px] hover:bg-accent flex items-center gap-2"
                              onMouseDown={(e) => { e.preventDefault(); openNewProductFor(idx); }}
                            >
                              <Plus className="h-3.5 w-3.5 text-primary" />
                              <span>Cadastrar <span className="font-medium">"{term}"</span> como novo produto</span>
                            </button>
                          ) : (
                            <>
                              {sugg.map((p, si) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-[13px] ${si === activeSuggestIdx ? "bg-accent" : "hover:bg-accent"}`}
                                  onMouseEnter={() => setActiveSuggestIdx(si)}
                                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(idx, p); }}
                                >
                                  <div className="font-medium truncate">{highlight(p.name, term)}</div>
                                  <div className="text-[11px] text-muted-foreground font-mono">
                                    {p.sku ? <>SKU {highlight(p.sku, term)}</> : "sem SKU"}{p.cost_price ? ` · ${brl(Number(p.cost_price))}` : ""}
                                  </div>
                                </button>
                              ))}
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-[12px] border-t border-border hover:bg-accent flex items-center gap-2 text-primary"
                                onMouseDown={(e) => { e.preventDefault(); openNewProductFor(idx); }}
                              >
                                <Plus className="h-3.5 w-3.5" /> Cadastrar novo produto
                              </button>
                            </>
                          )}
                          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border bg-surface-elevated/40 font-mono uppercase tracking-widest">
                            ↑ ↓ navegar · Enter selecionar · Esc fechar
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <NumberInput
                    ref={(el) => { qtyInputsRef.current[idx] = el; }}
                    className="col-span-2" allowDecimal={false} min={0} emptyBehavior="zero" placeholder="Qtd" value={it.quantity}
                    onValueChange={(n) => setItems((a) => a.map((x, i) => i === idx ? { ...x, quantity: n } : x))}
                  />
                  <NumberInput className="col-span-2" placeholder="0,00" value={it.unit_cost} onValueChange={(n) => setItems((a) => a.map((x, i) => i === idx ? { ...x, unit_cost: n } : x))} />
                  <Button size="icon" variant="ghost" className="col-span-1 text-danger" onClick={() => setItems((a) => a.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>

            <div className="mt-3 border border-dashed border-border rounded-md p-3">
              <Label className="text-[12px] text-muted-foreground">Adicionar em lote (uma linha por item: nome;qtd;custo)</Label>
              <Textarea rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Cabo USB-C;10;15,90\nPelícula iPhone 15;25;3,50"} />
              <Button size="sm" variant="outline" className="mt-2" onClick={applyBulk}><Package className="h-3 w-3 mr-1" /> Adicionar lote</Button>
            </div>

            <div className="mt-3 text-right text-sm">Total: <span className="font-semibold metric">{brl(orderTotal)}</span></div>
          </div>

          {/* Tags e Observações — abaixo dos itens da compra */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="ex.: capa, iPhone 15, importado" />
              {tagsInput.split(",").map((t) => t.trim()).filter(Boolean).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tagsInput.split(",").map((t) => t.trim()).filter(Boolean).map((t, i) => (
                    <Badge key={i} variant="outline" className="border-border text-[11px]">{t}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[12px] text-muted-foreground bg-success/5 border border-success/20 rounded-md p-2">
            <PackagePlus className="h-4 w-4 text-success mt-0.5 shrink-0" />
            <span>Ao salvar, as quantidades entram automaticamente no estoque geral da loja. Itens novos são cadastrados; itens existentes têm o saldo somado.</span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={buildPreview} className="bg-gradient-primary">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Salvar compra e adicionar ao estoque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação com prévia de impacto no estoque */}
      <Dialog open={previewOpen} onOpenChange={(o) => !saving && setPreviewOpen(o)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar entrada no estoque</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Revise como cada item afetará o estoque atual da loja antes de confirmar a compra.
          </p>
          <div className="mt-3 border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Item</th>
                  <th className="text-left px-3 py-2 font-medium">Situação</th>
                  <th className="text-right px-3 py-2 font-medium">Atual</th>
                  <th className="text-right px-3 py-2 font-medium">Entrada</th>
                  <th className="text-right px-3 py-2 font-medium">Saldo final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.map((p, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><div className="font-medium truncate max-w-[220px]">{p.name}</div></td>
                    <td className="px-3 py-2">
                      {p.exists
                        ? <Badge variant="outline" className="bg-success/10 text-success border-success/30">Já existe</Badge>
                        : <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Novo produto</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right metric text-muted-foreground">{p.current_stock}</td>
                    <td className="px-3 py-2 text-right metric text-success">+{p.quantity}</td>
                    <td className="px-3 py-2 text-right metric font-semibold">{p.new_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-[13px]">
            <div className="text-muted-foreground">
              {preview.filter((p) => p.exists).length} existente(s) · {preview.filter((p) => !p.exists).length} novo(s)
            </div>
            <div className="font-semibold">Total da compra: <span className="metric">{brl(orderTotal)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setPreviewOpen(false)}>Revisar itens</Button>
            <Button disabled={saving} onClick={save} className="bg-gradient-primary">
              {saving ? "Salvando…" : (<><CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar e dar entrada</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover compra?</AlertDialogTitle>
            <AlertDialogDescription>Os itens associados também serão removidos. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-danger hover:bg-danger/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cadastro rápido de produto sem sair do lançamento de compra */}
      <Dialog open={newProdOpen} onOpenChange={(o) => !newProdBusy && setNewProdOpen(o)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Cadastrar novo produto</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome do produto *</Label>
              <Input value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} />
            </div>
            <div>
              <Label>SKU (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  value={newProd.sku}
                  onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })}
                  placeholder="Digite ou clique em gerar"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Gerar SKU automaticamente"
                  title="Gerar SKU automaticamente"
                  disabled={newSkuBusy}
                  onClick={async () => {
                    if (!store) return;
                    if (!newProd.name.trim()) return toast.error("Preencha o nome do produto primeiro");
                    try {
                      setNewSkuBusy(true);
                      const sku = await generateUniqueSku(store.id, newProd.name);
                      setNewProd((p) => ({ ...p, sku }));
                      toast.success(`SKU gerado: ${sku}`);
                    } catch (e: any) {
                      toast.error(e?.message || "Erro ao gerar SKU");
                    } finally {
                      setNewSkuBusy(false);
                    }
                  }}
                >
                  <RefreshCw className={`h-4 w-4 ${newSkuBusy ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
            <div>
              <Label>Marca (opcional)</Label>
              <AutocompleteInput
                options={Array.from(new Set([
                  ...catalog.map((p) => p.brand ?? ""),
                  ...suppliers.flatMap((s) => s.brands ?? []),
                ]))}
                value={newProd.brand}
                onChange={(e) => setNewProd({ ...newProd, brand: e.target.value })}
                placeholder="Apple, Samsung…"
              />
            </div>
            <div>
              <Label>Categoria *</Label>
              <Select
                value={newProd.category}
                onValueChange={(v) => setNewProd((p) => ({ ...p, category: v, subcategory: NONE_SUBCATEGORY }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                <SelectContent>
                  {MAIN_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subcategoria (opcional)</Label>
              <Select
                value={newProd.subcategory}
                onValueChange={(v) => setNewProd((p) => ({ ...p, subcategory: v }))}
                disabled={!newProd.category}
              >
                <SelectTrigger>
                  <SelectValue placeholder={newProd.category ? "Selecione (opcional)" : "Escolha a categoria primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SUBCATEGORY}>— Sem subcategoria —</SelectItem>
                  {(SUBCATEGORIES_BY_MAIN[newProd.category] ?? []).map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Custo unitário</Label>
              <NumberInput placeholder="0,00" value={newProd.cost_price} onValueChange={(n) => setNewProd({ ...newProd, cost_price: n })} />
            </div>
            <div>
              <Label>Preço de venda (opcional)</Label>
              <NumberInput placeholder="0,00" value={newProd.sale_price} onValueChange={(n) => setNewProd({ ...newProd, sale_price: n })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={newProdBusy} onClick={() => setNewProdOpen(false)}>Cancelar</Button>
            <Button variant="outline" disabled={newProdBusy} onClick={() => saveNewProduct(true)}>
              <Plus className="h-4 w-4 mr-1" /> Salvar e continuar
            </Button>
            <Button disabled={newProdBusy} onClick={() => saveNewProduct(false)} className="bg-gradient-primary">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Salvar e vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}