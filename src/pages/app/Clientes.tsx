import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Users, Edit3, Trash2, Phone, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";

type Customer = {
  id: string;
  store_id: string;
  name: string;
  doc_type: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  birthdate: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_uf: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
};

const EMPTY: Partial<Customer> = {
  name: "", doc_type: "cpf", document: "", email: "", phone: "", whatsapp: "",
  birthdate: "", address_zip: "", address_street: "", address_number: "",
  address_complement: "", address_neighborhood: "", address_city: "", address_uf: "",
  notes: "",
};

export default function Clientes() {
  const { store } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const [delTarget, setDelTarget] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data } = await (supabase.from("customers") as any)
      .select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setItems((data as Customer[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store?.id]);

  // Abre o registro automaticamente quando chega via /clientes?edit=<id> (vindo da venda)
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || items.length === 0) return;
    const target = items.find((c) => c.id === editId);
    if (target) {
      setEditing(target);
      searchParams.delete("edit");
      setSearchParams(searchParams, { replace: true });
    }
  }, [items, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((c) =>
      `${c.name} ${c.document ?? ""} ${c.email ?? ""} ${c.phone ?? ""} ${c.whatsapp ?? ""}`.toLowerCase().includes(s)
    );
  }, [items, q]);

  const save = async () => {
    if (!store || !editing) return;
    if (!editing.name || editing.name.trim().length < 2) {
      toast.error("Informe o nome do cliente");
      return;
    }
    setSaving(true);
    const payload: any = {
      store_id: store.id,
      name: editing.name?.trim(),
      doc_type: editing.doc_type || null,
      document: editing.document?.trim() || null,
      email: editing.email?.trim() || null,
      phone: editing.phone?.trim() || null,
      whatsapp: editing.whatsapp?.trim() || null,
      birthdate: editing.birthdate || null,
      address_zip: editing.address_zip?.trim() || null,
      address_street: editing.address_street?.trim() || null,
      address_number: editing.address_number?.trim() || null,
      address_complement: editing.address_complement?.trim() || null,
      address_neighborhood: editing.address_neighborhood?.trim() || null,
      address_city: editing.address_city?.trim() || null,
      address_uf: editing.address_uf?.trim() || null,
      notes: editing.notes?.trim() || null,
    };
    let error;
    if (editing.id) {
      ({ error } = await (supabase.from("customers") as any).update(payload).eq("id", editing.id));
    } else {
      ({ error } = await (supabase.from("customers") as any).insert(payload));
    }
    setSaving(false);
    if (error) {
      const isUnique =
        (error as any).code === "23505" ||
        /customers_store_document_uidx|duplicate key|unique/i.test(error.message ?? "");
      if (isUnique && payload.document && store) {
        const { data: existente } = await (supabase.from("customers") as any)
          .select("id, name")
          .eq("store_id", store.id)
          .eq("document", payload.document)
          .maybeSingle();
        toast.error("Já existe um cliente com este documento nesta loja", {
          description: existente?.name ? `Cliente: ${existente.name}` : undefined,
          action: existente
            ? {
                label: "Abrir cadastro",
                onClick: () => setEditing(existente as any),
              }
            : undefined,
        });
        return;
      }
      toast.error(error.message);
      return;
    }
    toast.success(editing.id ? "Cliente atualizado" : "Cliente cadastrado");
    setEditing(null);
    load();
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    const { error } = await (supabase.from("customers") as any).delete().eq("id", delTarget.id);
    setDelTarget(null);
    if (error) return toast.error(error.message);
    toast.success("Cliente removido");
    load();
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={`${items.length} cliente${items.length === 1 ? "" : "s"} cadastrado${items.length === 1 ? "" : "s"} · CRM unificado para vendas, OS e financeiro.`}
        actions={
          <Button onClick={() => setEditing({ ...EMPTY })} className="bg-gradient-primary shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> Novo cliente
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, CPF, e-mail ou telefone…" className="pl-9 h-10 bg-card border-border" />
      </div>

      <Card className="bg-card border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Documento</th>
                <th className="text-left px-4 py-3 font-medium">Contato</th>
                <th className="text-left px-4 py-3 font-medium">Cidade</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-16 text-center">
                  <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhum cliente {q ? "encontrado" : "cadastrado"}.</p>
                  <Button onClick={() => setEditing({ ...EMPTY })} className="bg-gradient-primary">
                    <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro cliente
                  </Button>
                </td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} className="hover:bg-surface-elevated/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    {c.email && <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" />{c.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {c.document ? (
                      <>
                        <Badge variant="outline" className="text-[10px] uppercase">{c.doc_type || "doc"}</Badge>
                        <div className="text-xs metric mt-1">{c.document}</div>
                      </>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{c.phone}</div>}
                    {c.whatsapp && (
                      <a
                        href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-success mt-0.5 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Phone className="h-3 w-3" />WhatsApp: {c.whatsapp}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.address_city ? (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.address_city}{c.address_uf ? `/${c.address_uf}` : ""}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(c)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDelTarget(c)} className="text-danger hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-5">
              <section>
                <h4 className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground mb-2">Identificação</h4>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Label>Nome completo *</Label>
                    <Input value={editing.name ?? ""} maxLength={120} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Data de nascimento</Label>
                    <Input type="date" value={editing.birthdate ?? ""} onChange={(e) => setEditing({ ...editing, birthdate: e.target.value })} />
                  </div>
                  <div>
                    <Label>Tipo de documento</Label>
                    <Select value={editing.doc_type ?? "cpf"} onValueChange={(v) => setEditing({ ...editing, doc_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpf">CPF</SelectItem>
                        <SelectItem value="cnpj">CNPJ</SelectItem>
                        <SelectItem value="rg">RG</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Número do documento</Label>
                    <Input value={editing.document ?? ""} maxLength={32} onChange={(e) => setEditing({ ...editing, document: e.target.value })} />
                  </div>
                </div>
              </section>

              <section>
                <h4 className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground mb-2">Contato</h4>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div><Label>E-mail</Label><Input type="email" value={editing.email ?? ""} maxLength={120} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={editing.phone ?? ""} maxLength={20} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
                  <div><Label>WhatsApp</Label><Input value={editing.whatsapp ?? ""} maxLength={20} onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })} placeholder="55119..." /></div>
                </div>
              </section>

              <section>
                <h4 className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground mb-2">Endereço</h4>
                <div className="grid sm:grid-cols-6 gap-3">
                  <div className="sm:col-span-2"><Label>CEP</Label><Input value={editing.address_zip ?? ""} maxLength={10} onChange={(e) => setEditing({ ...editing, address_zip: e.target.value })} /></div>
                  <div className="sm:col-span-3"><Label>Rua / logradouro</Label><Input value={editing.address_street ?? ""} maxLength={120} onChange={(e) => setEditing({ ...editing, address_street: e.target.value })} /></div>
                  <div><Label>Número</Label><Input value={editing.address_number ?? ""} maxLength={10} onChange={(e) => setEditing({ ...editing, address_number: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label>Complemento</Label><Input value={editing.address_complement ?? ""} maxLength={80} onChange={(e) => setEditing({ ...editing, address_complement: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label>Bairro</Label><Input value={editing.address_neighborhood ?? ""} maxLength={80} onChange={(e) => setEditing({ ...editing, address_neighborhood: e.target.value })} /></div>
                  <div className="sm:col-span-1"><Label>UF</Label><Input value={editing.address_uf ?? ""} maxLength={2} onChange={(e) => setEditing({ ...editing, address_uf: e.target.value.toUpperCase() })} /></div>
                  <div className="sm:col-span-3"><Label>Cidade</Label><Input value={editing.address_city ?? ""} maxLength={80} onChange={(e) => setEditing({ ...editing, address_city: e.target.value })} /></div>
                </div>
              </section>

              <section>
                <Label>Observações</Label>
                <Textarea rows={3} value={editing.notes ?? ""} maxLength={2000} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Preferências, histórico, condições especiais..." />
              </section>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-gradient-primary">
              {saving ? "Salvando..." : editing?.id ? "Salvar alterações" : "Cadastrar cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-foreground">{delTarget?.name}</strong> será removido da sua base. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-danger hover:bg-danger/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}