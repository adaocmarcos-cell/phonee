import { useEffect, useMemo, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, UserPlus, Mail, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ROLE_CATALOG, roleLabel, canManageUsers, type AppRole } from "@/lib/roles";

type Row = {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: AppRole;
  job_title: string | null;
  status: "ativo" | "inativo" | "suspenso";
  last_login_at: string | null;
  created_at: string;
};

export default function Usuarios() {
  const { store, role: myRole } = useAuth();
  const allowed = canManageUsers(myRole as any);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role, created_at")
      .eq("store_id", store.id);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (ids.length === 0) { setRows([]); setLoading(false); return; }
    const [{ data: profiles }, { data: extras }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, phone").in("id", ids),
      supabase.from("user_profile_extras").select("user_id, job_title, status, last_login_at").in("user_id", ids),
    ]);
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const extraMap = new Map((extras ?? []).map((e: any) => [e.user_id, e]));
    // Pick the highest-priority role per user
    const roleByUser = new Map<string, { role: AppRole; created_at: string }>();
    (roles ?? []).forEach((r: any) => {
      const cur = roleByUser.get(r.user_id);
      if (!cur) roleByUser.set(r.user_id, { role: r.role, created_at: r.created_at });
    });
    const list: Row[] = ids.map((id) => {
      const p: any = profMap.get(id) ?? {};
      const e: any = extraMap.get(id) ?? {};
      const rr = roleByUser.get(id)!;
      return {
        user_id: id,
        full_name: p.full_name || p.email || "Sem nome",
        email: p.email || "",
        phone: p.phone || null,
        role: rr.role,
        job_title: e.job_title || null,
        status: e.status || "ativo",
        last_login_at: e.last_login_at || null,
        created_at: rr.created_at,
      };
    });
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, [store]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.full_name, r.email, r.phone ?? "", r.job_title ?? "", roleLabel(r.role)]
        .join(" ").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const toggleStatus = async (r: Row) => {
    if (!store) return;
    const next = r.status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase
      .from("user_profile_extras")
      .upsert({ user_id: r.user_id, store_id: store.id, status: next });
    if (error) return toast.error(error.message);
    toast.success(`Usuário ${next === "ativo" ? "ativado" : "desativado"}`);
    load();
  };

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Usuários" description="Acesso restrito." />
        <Card className="p-10 text-center bg-card border-border">
          <ShieldAlert className="h-8 w-8 text-warning mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Você não tem permissão para gerenciar usuários.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Gestão dos colaboradores da loja, cargos e status de acesso."
        actions={
          <InviteDialog open={open} setOpen={setOpen} onCreated={load} storeId={store?.id ?? ""} />
        }
      />

      <Card className="p-3 mb-4 bg-card border-border">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail, cargo ou função…"
            className="pl-9"
          />
        </div>
      </Card>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Colaborador</th>
                <th className="text-left px-4 py-3 font-medium">Contato</th>
                <th className="text-left px-4 py-3 font-medium">Cargo</th>
                <th className="text-left px-4 py-3 font-medium">Função</th>
                <th className="text-left px-4 py-3 font-medium">Último acesso</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-xs font-mono text-muted-foreground tracking-widest">CARREGANDO…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.user_id} className="hover:bg-surface-elevated/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">desde {new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{r.email}</div>
                    {r.phone && <div className="text-muted-foreground">{r.phone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="bg-primary/15 text-primary border-primary/30">{roleLabel(r.role)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.job_title || "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    {r.last_login_at ? new Date(r.last_login_at).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-2">
                      <Switch checked={r.status === "ativo"} onCheckedChange={() => toggleStatus(r)} />
                      <span className={`text-[11px] font-mono uppercase ${r.status === "ativo" ? "text-success" : "text-muted-foreground"}`}>
                        {r.status}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function InviteDialog({
  open, setOpen, onCreated, storeId,
}: { open: boolean; setOpen: (v: boolean) => void; onCreated: () => void; storeId: string }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", job_title: "", role: "vendedor" as AppRole | "outro" });
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    if (!form.email.trim()) return toast.error("Informe o e-mail.");
    setBusy(true);
    const { data, error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(`Não foi possível enviar o convite: ${error.message}`);
      return;
    }
    toast.success("Convite enviado por e-mail. O usuário definirá a senha pelo link.");
    toast.info("Após o primeiro acesso, ele aparecerá na lista para você confirmar o cargo.");
    setOpen(false);
    setForm({ full_name: "", email: "", phone: "", job_title: "", role: "vendedor" });
    onCreated();
    void data;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground">
          <UserPlus className="h-4 w-4 mr-1" /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Convidar colaborador</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Nome completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">E-mail *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label className="text-xs">Celular</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-0000" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cargo</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole | "outro" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_CATALOG.filter((r) => r.value !== "admin_master").map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label} — {r.description}</SelectItem>
                  ))}
                  <SelectItem value="outro">Outro — especificar cargo personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "outro" && (
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Especifique o cargo</Label>
                <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="Ex.: Coordenador de Marketing" />
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground border-t border-border pt-3 flex items-start gap-2">
            <Mail className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            Enviaremos um link de cadastro para o e-mail. Após o primeiro acesso, ele aparecerá nesta lista para você confirmar o cargo.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy} className="bg-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" />{busy ? "Enviando…" : "Enviar convite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}