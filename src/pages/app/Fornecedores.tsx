import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canManageProducts } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Truck, Edit3, Trash2, Phone, Mail, MapPin, Star } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";

type Supplier = {
  id: string;
  store_id: string;
  company_name: string;
  representative_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  cnpj: string | null;
  notes: string | null;
  brands: string[];
  payment_terms: string | null;
  avg_delivery_days: number | null;
  active: boolean;
};

type Stats = { supplier_id: string | null; total: number; count: number };

const empty: Partial<Supplier> = {
  company_name: "", representative_name: "", phone: "", whatsapp: "",
  email: "", city: "", state: "", cnpj: "", notes: "",
  brands: [], payment_terms: "", avg_delivery_days: null, active: true,
};

export default function Fornecedores() {
  const { store, role } = useAuth();
  const [list, setList] = useState<Supplier[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [brandsInput, setBrandsInput] = useState("");
  const [delTarget, setDelTarget] = useState<Supplier | null>(null);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const [{ data: sData }, { data: pData }] = await Promise.all([
      supabase.from("suppliers").select("*").eq("store_id", store.id).order("company_name"),
      supabase.from("purchase_orders").select("supplier_id, total_cost").eq("store_id", store.id),
    ]);
    setList((sData ?? []) as Supplier[]);
    const agg = new Map<string, Stats>();
    (pData ?? []).forEach((r: any) => {
      const k = r.supplier_id ?? "_";
      const cur = agg.get(k) ?? { supplier_id: r.supplier_id, total: 0, count: 0 };
      cur.total += Number(r.total_cost ?? 0);
      cur.count += 1;
      agg.set(k, cur);
    });
    setStats(Array.from(agg.values()));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((s) =>
      `${s.company_name} ${s.representative_name ?? ""} ${s.cnpj ?? ""} ${(s.brands ?? []).join(" ")} ${s.city ?? ""}`.toLowerCase().includes(term)
    );
  }, [list, q]);

  const topSupplierId = useMemo(() => {
    let best: Stats | null = null;
    stats.forEach((s) => { if (s.supplier_id && (!best || s.count > best.count)) best = s; });
    return best?.supplier_id ?? null;
  }, [stats]);

  const startNew = () => { setEditing({ ...empty }); setBrandsInput(""); setOpen(true); };
  const startEdit = (s: Supplier) => {
    setEditing({ ...s });
    setBrandsInput((s.brands ?? []).join(", "));
    setOpen(true);
  };

  const save = async () => {
    if (!store || !editing) return;
    if (!editing.company_name?.trim()) { toast.error("Informe o nome da empresa"); return; }
    const brands = brandsInput.split(",").map((s) => s.trim()).filter(Boolean);
    const payload: any = {
      store_id: store.id,
      company_name: editing.company_name.trim(),
      representative_name: editing.representative_name || null,
      phone: editing.phone || null,
      whatsapp: editing.whatsapp || null,
      email: editing.email || null,
      city: editing.city || null,
      state: editing.state || null,
      cnpj: editing.cnpj || null,
      notes: editing.notes || null,
      brands,
      payment_terms: editing.payment_terms || null,
      avg_delivery_days: editing.avg_delivery_days ? Number(editing.avg_delivery_days) : null,
      active: editing.active ?? true,
    };
    const res = editing.id
      ? await supabase.from("suppliers").update(payload).eq("id", editing.id)
      : await supabase.from("suppliers").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing.id ? "Fornecedor atualizado" : "Fornecedor cadastrado");
    setOpen(false); setEditing(null); load();
  };

  const remove = async () => {
    if (!delTarget) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", delTarget.id);
    setDelTarget(null);
    if (error) return toast.error(error.message);
    toast.success("Fornecedor removido");
    load();
  };

  const totals = useMemo(() => ({
    active: list.filter((s) => s.active).length,
    total: list.length,
    purchased: stats.reduce((s, r) => s + r.total, 0),
    orders: stats.reduce((s, r) => s + r.count, 0),
  }), [list, stats]);

  const can = canManageProducts(role);

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        actions={can && (
          <Button onClick={startNew} className="bg-gradient-primary shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> Novo fornecedor
          </Button>
        )}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Ativos</div><div className="text-xl font-semibold mt-1">{totals.active}</div></Card>
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Total cadastrados</div><div className="text-xl font-semibold mt-1">{totals.total}</div></Card>
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Pedidos realizados</div><div className="text-xl font-semibold mt-1">{totals.orders}</div></Card>
        <Card className="p-3 bg-card border-border"><div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Valor comprado</div><div className="text-xl font-semibold mt-1">{brl(totals.purchased)}</div></Card>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por empresa, representante, CNPJ, marca ou cidade…" className="pl-9 h-10 bg-card border-border" />
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-xs font-mono tracking-widest py-12">CARREGANDO…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center bg-card border-border">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Nenhum fornecedor encontrado.</p>
          {can && <Button onClick={startNew} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro fornecedor</Button>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((s) => {
            const st = stats.find((x) => x.supplier_id === s.id);
            const isTop = topSupplierId === s.id;
            return (
              <Card key={s.id} className="p-4 bg-card border-border hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold truncate">{s.company_name}</div>
                      {isTop && <Badge className="bg-success/15 text-success border-success/30"><Star className="h-3 w-3 mr-1" />Mais usado</Badge>}
                      {!s.active && <Badge variant="outline">Inativo</Badge>}
                    </div>
                    {s.representative_name && <div className="text-[12px] text-muted-foreground mt-0.5">{s.representative_name}</div>}
                  </div>
                  {can && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(s)}><Edit3 className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDelTarget(s)} className="text-danger hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-1 text-[12px] text-muted-foreground">
                  {s.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{s.phone}{s.whatsapp ? ` · WhatsApp ${s.whatsapp}` : ""}</div>}
                  {s.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{s.email}</div>}
                  {(s.city || s.state) && <div className="flex items-center gap-2"><MapPin className="h-3 w-3" />{[s.city, s.state].filter(Boolean).join(" / ")}</div>}
                  {s.cnpj && <div className="font-mono text-[11px]">CNPJ {s.cnpj}</div>}
                </div>

                {s.brands?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {s.brands.map((b) => <Badge key={b} variant="outline" className="border-border text-[11px]">{b}</Badge>)}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div><div className="text-muted-foreground">Pagamento</div><div className="font-medium truncate">{s.payment_terms || "—"}</div></div>
                  <div><div className="text-muted-foreground">Entrega</div><div className="font-medium">{s.avg_delivery_days ? `${s.avg_delivery_days} dias` : "—"}</div></div>
                  <div><div className="text-muted-foreground">Compras</div><div className="font-medium">{st?.count ?? 0} · {brl(st?.total ?? 0)}</div></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><Label>Nome da empresa *</Label><Input value={editing.company_name ?? ""} onChange={(e) => setEditing({ ...editing, company_name: e.target.value })} /></div>
              <div><Label>Representante</Label><Input value={editing.representative_name ?? ""} onChange={(e) => setEditing({ ...editing, representative_name: e.target.value })} /></div>
              <div><Label>CNPJ</Label><Input value={editing.cnpj ?? ""} onChange={(e) => setEditing({ ...editing, cnpj: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div><Label>WhatsApp</Label><Input value={editing.whatsapp ?? ""} onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>E-mail</Label><Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><Label>Cidade</Label><Input value={editing.city ?? ""} onChange={(e) => setEditing({ ...editing, city: e.target.value })} /></div>
              <div><Label>Estado (UF)</Label><Input maxLength={2} value={editing.state ?? ""} onChange={(e) => setEditing({ ...editing, state: e.target.value.toUpperCase() })} /></div>
              <div className="md:col-span-2"><Label>Marcas fornecidas (separadas por vírgula)</Label><Input value={brandsInput} onChange={(e) => setBrandsInput(e.target.value)} placeholder="Apple, Samsung, Motorola" /></div>
              <div><Label>Condições de pagamento</Label><Input value={editing.payment_terms ?? ""} onChange={(e) => setEditing({ ...editing, payment_terms: e.target.value })} placeholder="ex.: 30/60/90" /></div>
              <div><Label>Prazo médio de entrega (dias)</Label><Input type="number" min={0} value={editing.avg_delivery_days ?? ""} onChange={(e) => setEditing({ ...editing, avg_delivery_days: e.target.value ? Number(e.target.value) : null })} /></div>
              <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
              <div className="md:col-span-2 flex items-center gap-2"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label className="!mb-0">Fornecedor ativo</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={save} className="bg-gradient-primary">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-danger hover:bg-danger/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}