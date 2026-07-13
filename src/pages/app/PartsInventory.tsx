import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeCost, canManageProducts } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Edit3, Trash2, FileDown, Wrench, AlertTriangle, X, ShoppingCart, Hammer, RefreshCw, Receipt } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import VendasPecas from "./VendasPecas";
import PartsPurchaseCenter from "./PartsPurchaseCenter";
import { NumberInput } from "@/components/NumberInput";

type Category =
  | "telas" | "baterias" | "tampas" | "cameras"
  | "flex" | "componentes" | "ferramentas" | "outros";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "telas", label: "Telas" },
  { value: "baterias", label: "Baterias" },
  { value: "tampas", label: "Tampas" },
  { value: "cameras", label: "Câmeras" },
  { value: "flex", label: "Flex" },
  { value: "componentes", label: "Componentes" },
  { value: "ferramentas", label: "Ferramentas" },
  { value: "outros", label: "Outros" },
];

const catLabel = (c: Category, other?: string | null) =>
  c === "outros" ? `Outros${other ? ` — ${other}` : ""}` : CATEGORIES.find(x => x.value === c)!.label;

type Part = {
  id: string;
  store_id: string;
  name: string;
  category: Category;
  category_other: string | null;
  sku: string | null;
  brand: string | null;
  compatible_models: string | null;
  cost_price: number;
  sale_price: number;
  stock_current: number;
  stock_min: number;
  supplier: string | null;
  location: string | null;
  notes: string | null;
};

type FormState = Omit<Part, "id" | "store_id" | "compatible_models"> & { models: string[] };

const emptyForm = (): FormState => ({
  name: "", category: "telas", category_other: "",
  sku: "", brand: "", models: [],
  cost_price: 0, sale_price: 0,
  stock_current: 0, stock_min: 0,
  supplier: "", location: "", notes: "",
});

export default function PartsInventory() {
  const { store, role } = useAuth();
  const canManage = canManageProducts(role as any);
  const showCost = canSeeCost(role as any);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as "pecas" | "ferramentas" | "utilizadas" | "compras") || "pecas";
  const setTab = (t: string) => setSearchParams({ tab: t });

  const [parts, setParts] = useState<Part[]>([]);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<"all" | Category>("all");
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Part | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const [delTarget, setDelTarget] = useState<Part | null>(null);
  const [osTarget, setOsTarget] = useState<Part | null>(null);
  const [osList, setOsList] = useState<{ id: string; os_number: number; customer_name: string | null }[]>([]);
  const [osPick, setOsPick] = useState<string>("");
  const [osQty, setOsQty] = useState<number>(1);
  const [modelInput, setModelInput] = useState("");

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("parts_inventory")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setParts((data ?? []) as Part[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  const filtered = useMemo(() => {
    return parts.filter((p) => {
      // Escopo do tab: peças exclui ferramentas; ferramentas mostra somente ferramentas
      if (tab === "pecas" && p.category === "ferramentas") return false;
      if (tab === "ferramentas" && p.category !== "ferramentas") return false;
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (q) {
        const s = q.toLowerCase();
        if (!`${p.name} ${p.sku ?? ""} ${p.brand ?? ""} ${p.compatible_models ?? ""}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [parts, q, catFilter, tab]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setModelInput("");
    setDialogOpen(true);
  };

  const openEdit = (p: Part) => {
    setEditing(p);
    setForm({
      name: p.name, category: p.category, category_other: p.category_other ?? "",
      sku: p.sku ?? "", brand: p.brand ?? "",
      models: (p.compatible_models ?? "").split(",").map(s => s.trim()).filter(Boolean),
      cost_price: Number(p.cost_price) || 0, sale_price: Number(p.sale_price) || 0,
      stock_current: p.stock_current, stock_min: p.stock_min,
      supplier: p.supplier ?? "", location: p.location ?? "", notes: p.notes ?? "",
    });
    setModelInput("");
    setDialogOpen(true);
  };

  const commitModelInput = (raw: string) => {
    const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setForm((f) => ({ ...f, models: Array.from(new Set([...f.models, ...parts])) }));
    setModelInput("");
  };

  const save = async () => {
    if (!store) return;
    if (!form.name.trim()) { toast.error("Informe o nome"); return; }
    if (form.category === "outros" && !form.category_other?.trim()) {
      toast.error("Descreva a categoria 'Outros'"); return;
    }
    const { models, ...rest } = form;
    // include any unsubmitted tag still in the input
    const allModels = modelInput.trim()
      ? Array.from(new Set([...models, ...modelInput.split(",").map(s => s.trim()).filter(Boolean)]))
      : models;
    const payload = {
      ...rest,
      store_id: store.id,
      category_other: form.category === "outros" ? form.category_other : null,
      sku: form.sku || null,
      brand: form.brand || null,
      compatible_models: allModels.length ? allModels.join(", ") : null,
      supplier: form.supplier || null,
      location: form.location || null,
      notes: form.notes || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("parts_inventory").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("parts_inventory").insert(payload));
    }
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Peça atualizada" : "Peça cadastrada");
    setDialogOpen(false);
    load();
  };

  const remove = async () => {
    if (!delTarget) return;
    const { error } = await supabase.from("parts_inventory").delete().eq("id", delTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removida");
    setDelTarget(null);
    load();
  };

  const openLinkOS = async (p: Part) => {
    if (!store) return;
    setOsTarget(p);
    setOsQty(1);
    setOsPick("");
    const { data } = await supabase
      .from("service_orders")
      .select("id, os_number, customer_name, status")
      .eq("store_id", store.id)
      .neq("status", "entregue")
      .order("created_at", { ascending: false })
      .limit(50);
    setOsList((data ?? []) as any);
  };

  const confirmLinkOS = async () => {
    if (!osTarget || !osPick || !store) return;
    if (osQty < 1 || osQty > osTarget.stock_current) {
      toast.error("Quantidade inválida"); return;
    }
    const { error: e1 } = await supabase.from("service_order_parts").insert({
      service_order_id: osPick,
      part_id: osTarget.id,
      store_id: store.id,
      qty: osQty,
      unit_price: osTarget.sale_price,
    });
    if (e1) { toast.error(e1.message); return; }
    const { error: e2 } = await supabase
      .from("parts_inventory")
      .update({ stock_current: osTarget.stock_current - osQty })
      .eq("id", osTarget.id);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Peça vinculada à OS");
    setOsTarget(null);
    load();
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Estoque de Peças e Ferramentas — ${store?.name ?? ""}`, 14, 16);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleString("pt-BR"), 14, 22);
    const head = [["Nome", "Categoria", "Marca", "Estoque", "Mín.", showCost ? "Custo" : "", "Venda"].filter(Boolean)];
    const body = filtered.map((p) => {
      const row = [
        p.name,
        catLabel(p.category, p.category_other),
        p.brand ?? "—",
        String(p.stock_current),
        String(p.stock_min),
      ];
      if (showCost) row.push(brl(Number(p.cost_price)));
      row.push(brl(Number(p.sale_price)));
      return row;
    });
    autoTable(doc, { head, body, startY: 28, styles: { fontSize: 8 } });
    doc.save(`estoque-pecas-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title={
          tab === "ferramentas" ? "Ferramentas"
          : tab === "utilizadas" ? "Peças utilizadas em OS"
          : tab === "compras" ? "Centro de compras de peças"
          : "Peças"
        }
        description="Estoque dedicado à assistência técnica — separado do estoque de vendas."
        actions={
          <div className="flex gap-2">
            {(tab === "pecas" || tab === "ferramentas") && (
              <>
                <Button variant="outline" onClick={exportPdf}>
                  <FileDown className="h-4 w-4 mr-2" /> PDF
                </Button>
                {canManage && (
                  <Button onClick={() => { setForm({ ...emptyForm(), category: tab === "ferramentas" ? "ferramentas" : "telas" }); setEditing(null); setModelInput(""); setDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" /> {tab === "ferramentas" ? "Nova ferramenta" : "Nova peça"}
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pecas" className="gap-2"><Hammer className="h-3.5 w-3.5" />Peças</TabsTrigger>
          <TabsTrigger value="ferramentas" className="gap-2"><Wrench className="h-3.5 w-3.5" />Ferramentas</TabsTrigger>
          <TabsTrigger value="utilizadas" className="gap-2"><Receipt className="h-3.5 w-3.5" />Peças utilizadas</TabsTrigger>
          <TabsTrigger value="compras" className="gap-2"><ShoppingCart className="h-3.5 w-3.5" />Centro de compras</TabsTrigger>
        </TabsList>

        <TabsContent value="utilizadas" className="mt-4">
          <VendasPecas />
        </TabsContent>

        <TabsContent value="compras" className="mt-4">
          <PartsPurchaseCenter />
        </TabsContent>

        <TabsContent value={tab === "ferramentas" ? "ferramentas" : "pecas"} className="mt-4 space-y-4">
          <Card className="p-3 flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, SKU, marca ou modelo…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {tab === "pecas" && (
          <Select value={catFilter} onValueChange={(v) => setCatFilter(v as any)}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {CATEGORIES.filter((c) => c.value !== "ferramentas").map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Nome</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Marca</th>
                <th className="p-3 text-right">Estoque</th>
                {showCost && <th className="p-3 text-right">Custo</th>}
                <th className="p-3 text-right">Venda</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-6 text-center text-muted-foreground" colSpan={7}>Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="p-6 text-center text-muted-foreground" colSpan={7}>Nenhuma peça cadastrada.</td></tr>
              ) : filtered.map((p) => {
                const low = p.stock_current <= p.stock_min;
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku || "sem SKU"}{p.compatible_models ? ` · ${p.compatible_models}` : ""}
                      </div>
                    </td>
                    <td className="p-3">{catLabel(p.category, p.category_other)}</td>
                    <td className="p-3">{p.brand ?? "—"}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {low && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                        <span className={low ? "text-amber-600 font-semibold" : ""}>{p.stock_current}</span>
                        <span className="text-xs text-muted-foreground">/ {p.stock_min}</span>
                      </div>
                    </td>
                    {showCost && <td className="p-3 text-right">{brl(Number(p.cost_price))}</td>}
                    <td className="p-3 text-right">{brl(Number(p.sale_price))}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {p.stock_current > 0 && (
                          <Button size="icon" variant="ghost" title="Lançar em OS" onClick={() => openLinkOS(p)}>
                            <Wrench className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDelTarget(p)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
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
      </Card>
        </TabsContent>
      </Tabs>

      {/* New/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar peça" : "Nova peça / ferramenta"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Categoria *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.category === "outros" && (
              <div>
                <Label>Descrever categoria *</Label>
                <Input value={form.category_other ?? ""} onChange={(e) => setForm({ ...form, category_other: e.target.value })} />
              </div>
            )}
            <div>
              <Label>SKU</Label>
              <Input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <Label>Marca</Label>
              <Input value={form.brand ?? ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Modelos compatíveis</Label>
              <div className="rounded-md border bg-background px-2 py-1.5 min-h-10 flex flex-wrap gap-1 items-center">
                {form.models.map((m) => (
                  <Badge key={m} variant="secondary" className="gap-1 pr-1">
                    {m}
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, models: form.models.filter((x) => x !== m) })}
                      className="hover:bg-muted rounded-sm p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-1"
                  value={modelInput}
                  placeholder={form.models.length === 0 ? "Ex.: iPhone 11, 12, 13" : "Adicionar…"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.includes(",")) commitModelInput(v);
                    else setModelInput(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitModelInput(modelInput); }
                    if (e.key === "Backspace" && !modelInput && form.models.length) {
                      setForm({ ...form, models: form.models.slice(0, -1) });
                    }
                  }}
                  onBlur={() => modelInput.trim() && commitModelInput(modelInput)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Separe por vírgulas para criar uma tag.</p>
            </div>
            <div>
              <Label>Custo (R$)</Label>
              <NumberInput value={form.cost_price}
                onValueChange={(n) => setForm({ ...form, cost_price: n })} />
            </div>
            <div>
              <Label>Venda (R$)</Label>
              <NumberInput value={form.sale_price}
                onValueChange={(n) => setForm({ ...form, sale_price: n })} />
            </div>
            <div>
              <Label>Estoque atual</Label>
              <NumberInput allowDecimal={false} value={form.stock_current}
                onValueChange={(n) => setForm({ ...form, stock_current: n })} />
            </div>
            <div>
              <Label>Estoque mínimo</Label>
              <NumberInput allowDecimal={false} value={form.stock_min}
                onValueChange={(n) => setForm({ ...form, stock_min: n })} />
            </div>
            <div>
              <Label>Fornecedor</Label>
              <Input value={form.supplier ?? ""} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div>
              <Label>Localização no estoque</Label>
              <Input value={form.location ?? ""} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex.: Gaveta A2" />
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to OS */}
      <Dialog open={!!osTarget} onOpenChange={(v) => !v && setOsTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar em OS</DialogTitle>
          </DialogHeader>
          {osTarget && (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="font-medium">{osTarget.name}</div>
                <div className="text-muted-foreground">Disponível: {osTarget.stock_current}</div>
              </div>
              <div>
                <Label>OS</Label>
                <Select value={osPick} onValueChange={setOsPick}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma OS aberta" /></SelectTrigger>
                  <SelectContent>
                    {osList.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        #{o.os_number} — {o.customer_name ?? "Sem cliente"}
                      </SelectItem>
                    ))}
                    {osList.length === 0 && <div className="px-2 py-1 text-sm text-muted-foreground">Nenhuma OS aberta</div>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantidade</Label>
                <NumberInput allowDecimal={false} min={0} max={osTarget.stock_current}
                  emptyBehavior="zero" value={osQty}
                  onValueChange={setOsQty} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOsTarget(null)}>Cancelar</Button>
            <Button onClick={confirmLinkOS} disabled={!osPick}>Confirmar e baixar estoque</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(v) => !v && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover peça?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}