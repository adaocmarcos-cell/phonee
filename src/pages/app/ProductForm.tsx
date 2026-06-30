import { useEffect, useState, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeCost } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import { z } from "zod";
import { MAIN_CATEGORIES, SUBCATEGORIES_BY_MAIN } from "@/lib/categories";
import { brl } from "@/lib/format";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

function buildSkuPrefix(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.map((w) => w[0]!.toUpperCase()).join("").slice(0, 6);
  return initials || "SKU";
}

async function generateUniqueSku(storeId: string, name: string): Promise<string> {
  const prefix = buildSkuPrefix(name);
  for (let attempt = 0; attempt < 8; attempt++) {
    const digits = Math.floor(1000 + Math.random() * 9000).toString();
    const candidate = `${prefix}-${digits}`;
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .eq("store_id", storeId)
      .eq("sku", candidate)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw error;
    if (!data) return candidate;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

const schema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  sku: z.string().trim().max(60).optional(),
  brand: z.string().trim().max(60).optional(),
  compatible_model: z.string().trim().max(80).optional(),
  cost_price: z.number().min(0),
  sale_price: z.number().min(0),
  stock_current: z.number().int().min(0),
  stock_min: z.number().int().min(0),
  stock_max: z.number().int().min(0),
  location: z.string().trim().max(60).optional(),
});

type FormState = {
  name: string; sku: string; ean: string; brand: string; compatible_model: string;
  category: string; subcategory: string; condition: string;
  supplier: string; cost_price: number; sale_price: number;
  stock_current: number; stock_min: number; stock_max: number;
  location: string; visible_in_catalog: boolean; status: string;
  data_entrada: string;
};

const empty: FormState = {
  name: "", sku: "", ean: "", brand: "", compatible_model: "",
  category: "", subcategory: "", condition: "novo",
  supplier: "", cost_price: 0, sale_price: 0,
  stock_current: 0, stock_min: 3, stock_max: 0,
  location: "", visible_in_catalog: false, status: "ativo",
  data_entrada: new Date().toISOString().slice(0, 10),
};

export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id || id === "novo";
  const navigate = useNavigate();
  const { store, role } = useAuth();
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);
  const [entryOpen, setEntryOpen] = useState(true);

  useEffect(() => {
    if (isNew || !store) return;
    (async () => {
      const { data } = await supabase.from("products").select("*").eq("id", id!).single();
      if (data) setForm({
        ...empty,
        ...(data as any),
        cost_price: Number(data.cost_price),
        sale_price: Number(data.sale_price),
        data_entrada: (data as any).data_entrada || empty.data_entrada,
      });
    })();
  }, [id, isNew, store]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const margin = form.sale_price > 0 ? ((form.sale_price - form.cost_price) / form.sale_price) * 100 : 0;
  const marginBrl = Number(form.sale_price) - Number(form.cost_price);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!store) return;
    if (!form.category) {
      return toast.error("Selecione uma categoria");
    }
    const parsed = schema.safeParse({
      name: form.name, sku: form.sku, brand: form.brand, compatible_model: form.compatible_model,
      cost_price: Number(form.cost_price), sale_price: Number(form.sale_price),
      stock_current: Number(form.stock_current), stock_min: Number(form.stock_min), stock_max: Number(form.stock_max),
      location: form.location,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);

    const payload: any = {
      store_id: store.id,
      name: form.name.trim(),
      sku: form.sku || null,
      ean: form.ean || null,
      brand: form.brand || null,
      compatible_model: form.compatible_model || null,
      category: form.category,
      subcategory: form.subcategory || null,
      condition: form.condition,
      supplier: form.supplier || null,
      cost_price: Number(form.cost_price),
      sale_price: Number(form.sale_price),
      stock_current: Number(form.stock_current),
      stock_min: Number(form.stock_min),
      stock_max: Number(form.stock_max),
      location: form.location || null,
      visible_in_catalog: form.visible_in_catalog,
      status: form.status,
      data_entrada: form.data_entrada || null,
    };

    const { error } = isNew
      ? await supabase.from("products").insert(payload)
      : await supabase.from("products").update(payload).eq("id", id!);

    setBusy(false);
    if (error) {
      if ((error as any).code === "23505") return toast.error("Este SKU já está em uso. Use outro ou gere automaticamente.");
      return toast.error(error.message);
    }
    toast.success(isNew ? "Produto cadastrado" : "Produto atualizado");
    navigate("/painel/estoque");
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={isNew ? "Novo produto" : "Editar produto"}
        description={isNew ? "Cadastre um item para começar a controlar seu estoque." : "Atualize os dados do produto."}
        actions={<Button variant="outline" onClick={() => navigate("/painel/estoque")}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="p-6 bg-card border-border shadow-card">
          <h3 className="font-semibold mb-4">Identificação</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Capa silicone iPhone 15 Pro" /></Field>
            <Field label="SKU">
              <div className="flex gap-2">
                <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="SKU-001" />
                <Button
                  type="button"
                  variant="outline"
                  title="Gerar SKU automaticamente"
                  onClick={async () => {
                    if (!store) return;
                    if (!form.name.trim()) return toast.error("Preencha o nome do produto primeiro");
                    try {
                      const sku = await generateUniqueSku(store.id, form.name);
                      set("sku", sku);
                      toast.success(`SKU gerado: ${sku}`);
                    } catch (e: any) {
                      toast.error(e.message || "Erro ao gerar SKU");
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />Gerar
                </Button>
              </div>
            </Field>
            <Field label="EAN / Código de barras"><Input value={form.ean} onChange={(e) => set("ean", e.target.value)} /></Field>
            <Field label="Marca"><Input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Apple, Samsung, Generic…" /></Field>
            <Field label="Modelo compatível"><Input value={form.compatible_model} onChange={(e) => set("compatible_model", e.target.value)} placeholder="iPhone 15 Pro" /></Field>
            <Field label="Fornecedor"><Input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></Field>
          </div>
        </Card>

        <Card className="p-6 bg-card border-border shadow-card">
          <h3 className="font-semibold mb-4">Classificação</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Categoria *">
              <Select
                value={form.category}
                onValueChange={(v) => {
                  set("category", v);
                  // limpa subcategoria ao trocar de categoria principal
                  set("subcategory", "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {MAIN_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subcategoria (opcional)">
              {(() => {
                const subs = SUBCATEGORIES_BY_MAIN[form.category] ?? [{ value: "outros", label: "Outros" }];
                return (
                  <Select
                    value={form.subcategory || "__none__"}
                    onValueChange={(v) => set("subcategory", v === "__none__" ? "" : v)}
                    disabled={!form.category}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={form.category ? "Selecione (opcional)" : "Escolha a categoria primeiro"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sem subcategoria —</SelectItem>
                      {subs.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </Field>
            <Field label="Condição">
              <Select value={form.condition} onValueChange={(v) => set("condition", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="seminovo">Seminovo</SelectItem>
                  <SelectItem value="recondicionado">Recondicionado</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="p-6 bg-card border-border shadow-card">
          <h3 className="font-semibold mb-4">Preço & Estoque</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {canSeeCost(role) && (
              <Field label="Preço de custo (R$)"><Input type="number" step="0.01" value={form.cost_price} onChange={(e) => set("cost_price", e.target.value)} /></Field>
            )}
            <Field label="Preço de venda (R$)"><Input type="number" step="0.01" value={form.sale_price} onChange={(e) => set("sale_price", e.target.value)} /></Field>
            {canSeeCost(role) && (
              <Field label="Margem">
                <div className={`metric h-10 px-3 flex items-center rounded-md border border-border bg-muted/30 ${margin >= 30 ? "text-success" : margin >= 15 ? "text-warning" : "text-danger"}`}>
                  {margin.toFixed(1)}%
                </div>
              </Field>
            )}
            <Field label="Estoque atual"><Input type="number" value={form.stock_current} onChange={(e) => set("stock_current", e.target.value)} /></Field>
            <Field label="Estoque mínimo"><Input type="number" value={form.stock_min} onChange={(e) => set("stock_min", e.target.value)} /></Field>
            <Field label="Estoque máximo"><Input type="number" value={form.stock_max} onChange={(e) => set("stock_max", e.target.value)} /></Field>
            <Field label="Localização física"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Prateleira A3" /></Field>
          </div>
        </Card>

        {canSeeCost(role) && (
          <Card className="p-0 bg-card border-border shadow-card overflow-hidden">
            <Collapsible open={entryOpen} onOpenChange={setEntryOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-6 hover:bg-surface-elevated/30 transition">
                <div className="text-left">
                  <h3 className="font-semibold">Dados de Entrada</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Quanto você pagou, origem do aparelho e quando entrou no estoque.</p>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${entryOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-6 pb-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Custo de aquisição (R$)">
                      <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => set("cost_price", e.target.value)} placeholder="Quanto você pagou?" />
                    </Field>
                    <Field label="Fornecedor / Origem">
                      <Input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Nome ou telefone" />
                    </Field>
                    <Field label="Data de entrada">
                      <Input type="date" value={form.data_entrada} onChange={(e) => set("data_entrada", e.target.value)} />
                    </Field>
                  </div>
                  <div className="rounded-md border border-border bg-surface-elevated/40 px-4 py-3 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-muted-foreground">Margem estimada:</span>
                    <span className={`metric font-semibold ${marginBrl > 0 ? "text-success" : marginBrl < 0 ? "text-danger" : ""}`}>{brl(marginBrl)}</span>
                    <span className={`text-xs ${margin >= 30 ? "text-success" : margin >= 15 ? "text-warning" : "text-danger"}`}>({margin.toFixed(0)}% de margem)</span>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )}

        <Card className="p-6 bg-card border-border shadow-card">
          <h3 className="font-semibold mb-4">Visibilidade</h3>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 p-3 rounded-md border border-border bg-surface-elevated/50">
              <div>
                <Label>Visível no catálogo público</Label>
                <p className="text-xs text-muted-foreground mt-1">Aparece no minisite da sua loja para clientes finais.</p>
              </div>
              <Switch checked={form.visible_in_catalog} onCheckedChange={(v) => set("visible_in_catalog", v)} />
            </div>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="md:max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="promocao">Em promoção</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2 sticky bottom-0 py-3">
          <Button type="button" variant="outline" onClick={() => navigate("/painel/estoque")}>Cancelar</Button>
          <Button type="submit" disabled={busy} className="bg-gradient-primary shadow-glow"><Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}