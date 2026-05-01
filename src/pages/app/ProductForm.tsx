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
import { ArrowLeft, Save } from "lucide-react";
import { z } from "zod";

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
};

const empty: FormState = {
  name: "", sku: "", ean: "", brand: "", compatible_model: "",
  category: "acessorio", subcategory: "", condition: "novo",
  supplier: "", cost_price: 0, sale_price: 0,
  stock_current: 0, stock_min: 0, stock_max: 0,
  location: "", visible_in_catalog: false, status: "ativo",
};

export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id || id === "novo";
  const navigate = useNavigate();
  const { store, role } = useAuth();
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew || !store) return;
    (async () => {
      const { data } = await supabase.from("products").select("*").eq("id", id!).single();
      if (data) setForm({ ...empty, ...data, cost_price: Number(data.cost_price), sale_price: Number(data.sale_price) });
    })();
  }, [id, isNew, store]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const margin = form.sale_price > 0 ? ((form.sale_price - form.cost_price) / form.sale_price) * 100 : 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!store) return;
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
    };

    const { error } = isNew
      ? await supabase.from("products").insert(payload)
      : await supabase.from("products").update(payload).eq("id", id!);

    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(isNew ? "Produto cadastrado" : "Produto atualizado");
    navigate("/app/estoque");
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={isNew ? "Novo produto" : "Editar produto"}
        description={isNew ? "Cadastre um item para começar a controlar seu estoque." : "Atualize os dados do produto."}
        actions={<Button variant="outline" onClick={() => navigate("/app/estoque")}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="p-6 bg-card border-border shadow-card">
          <h3 className="font-semibold mb-4">Identificação</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Capa silicone iPhone 15 Pro" /></Field>
            <Field label="SKU"><Input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="SKU-001" /></Field>
            <Field label="EAN / Código de barras"><Input value={form.ean} onChange={(e) => set("ean", e.target.value)} /></Field>
            <Field label="Marca"><Input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Apple, Samsung, Generic…" /></Field>
            <Field label="Modelo compatível"><Input value={form.compatible_model} onChange={(e) => set("compatible_model", e.target.value)} placeholder="iPhone 15 Pro" /></Field>
            <Field label="Fornecedor"><Input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></Field>
          </div>
        </Card>

        <Card className="p-6 bg-card border-border shadow-card">
          <h3 className="font-semibold mb-4">Classificação</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Categoria">
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="acessorio">Acessório</SelectItem>
                  <SelectItem value="peca">Peça</SelectItem>
                  <SelectItem value="aparelho_novo">Aparelho novo</SelectItem>
                  <SelectItem value="aparelho_seminovo">Aparelho seminovo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subcategoria"><Input value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} placeholder="Capa, Película, Cabo…" /></Field>
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
          <Button type="button" variant="outline" onClick={() => navigate("/app/estoque")}>Cancelar</Button>
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