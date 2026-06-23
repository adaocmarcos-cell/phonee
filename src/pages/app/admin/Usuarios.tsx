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
import { Plus, UserPlus, Search, ShieldAlert, KeyRound, ShieldCheck, Settings2, Pencil, UserCog } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ROLE_CATALOG, roleLabel, canManageUsers, type AppRole } from "@/lib/roles";
import {
  PERMISSION_CATALOG,
  ACTION_LABEL,
  defaultsForRole,
  countAllowed,
  countTotal,
  type PermissionMap,
  type PermissionAction,
} from "@/lib/permissions";
import { Checkbox } from "@/components/ui/checkbox";

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
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

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
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/app/admin/cargos")}
              className="bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            >
              <UserCog className="h-4 w-4 mr-1" /> Cargos e Funções
            </Button>
            <InviteDialog open={open} setOpen={setOpen} onCreated={load} storeId={store?.id ?? ""} />
          </>
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
                <th className="text-right px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-xs font-mono text-muted-foreground tracking-widest">CARREGANDO…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado.</td></tr>
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
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <EditUserDialog
        row={editing}
        storeId={store?.id ?? ""}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}

function InviteDialog({
  open, setOpen, onCreated, storeId,
}: { open: boolean; setOpen: (v: boolean) => void; onCreated: () => void; storeId: string }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", role: "vendedor" as AppRole });
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<PermissionMap>(() => defaultsForRole("vendedor"));
  const [permOpen, setPermOpen] = useState(false);
  const [permTouched, setPermTouched] = useState(false);

  // Reset permissions to role defaults whenever role changes (unless user customized)
  useEffect(() => {
    if (!permTouched) setPermissions(defaultsForRole(form.role));
  }, [form.role, permTouched]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    if (!form.email.trim()) return toast.error("Informe o e-mail.");
    if (form.password.length < 8) return toast.error("Senha deve ter ao menos 8 caracteres.");
    setBusy(true);
    if (!form.full_name.trim()) { setBusy(false); return toast.error("Informe o nome completo."); }
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        role: form.role,
        store_id: storeId,
        permissions,
      },
    });
    setBusy(false);
    if (error || (data && (data as any).error)) {
      const msg = (data as any)?.error ?? error?.message ?? "Erro ao cadastrar.";
      toast.error(`Não foi possível cadastrar: ${msg}`);
      return;
    }
    toast.success("Colaborador cadastrado com sucesso.");
    setOpen(false);
    setForm({ full_name: "", email: "", phone: "", password: "", role: "vendedor" });
    setPermissions(defaultsForRole("vendedor"));
    setPermTouched(false);
    onCreated();
  };

  const allowedCount = countAllowed(permissions);
  const totalCount = countTotal();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground">
          <UserPlus className="h-4 w-4 mr-1" /> Cadastrar colaborador
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar colaborador</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Nome completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">E-mail *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label className="text-xs">Celular</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-0000" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Senha inicial *</Label><Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 8 caracteres" required /></div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Cargo</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_CATALOG.filter((r) => r.value !== "admin_master").map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label} — {r.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 mt-1 rounded-md border border-border bg-surface-elevated/40 p-3 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <div className="text-xs font-medium">Permissões do colaborador</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {allowedCount}/{totalCount} habilitadas {permTouched ? "· personalizadas" : "· padrão do cargo"}
                  </div>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setPermOpen(true)}>
                <Settings2 className="h-3.5 w-3.5 mr-1" /> Configurar
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t border-border pt-3 flex items-start gap-2">
            <KeyRound className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            O colaborador acessará com o e-mail e a senha definidos. Ele poderá alterar a senha após o primeiro login.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy} className="bg-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" />{busy ? "Cadastrando…" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
        <PermissionsDialog
          open={permOpen}
          setOpen={setPermOpen}
          value={permissions}
          onChange={(v) => { setPermissions(v); setPermTouched(true); }}
          onResetToRole={() => { setPermissions(defaultsForRole(form.role)); setPermTouched(false); }}
          roleLabelText={roleLabel(form.role)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  row, storeId, onClose, onSaved,
}: { row: Row | null; storeId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "",
    role: "vendedor" as AppRole, status: "ativo" as Row["status"], new_password: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!row) return;
    setForm({
      full_name: row.full_name === "Sem nome" ? "" : row.full_name,
      email: row.email,
      phone: row.phone ?? "",
      role: row.role,
      status: row.status,
      new_password: "",
    });
  }, [row]);

  if (!row) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return toast.error("Informe o nome completo.");
    if (!form.email.trim()) return toast.error("Informe o e-mail.");
    if (form.new_password && form.new_password.length < 8) return toast.error("Senha mínima de 8 caracteres.");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-update-user", {
      body: {
        user_id: row.user_id,
        store_id: storeId,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        status: form.status,
        new_password: form.new_password || undefined,
      },
    });
    setBusy(false);
    if (error || (data && (data as any).error)) {
      const msg = (data as any)?.error ?? error?.message ?? "Erro ao salvar.";
      return toast.error(`Não foi possível atualizar: ${msg}`);
    }
    toast.success("Colaborador atualizado.");
    onSaved();
  };

  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar colaborador</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome completo *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Celular</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-0000" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Função no sistema</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_CATALOG.filter((r) => r.value !== "admin_master").map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label} — {r.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Row["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nova senha (opcional)</Label>
              <Input type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} placeholder="Mín. 8 caracteres" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t border-border pt-3 flex items-start gap-2">
            <KeyRound className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            Alterações em nome, e-mail, função e status são registradas nos Logs.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy} className="bg-primary text-primary-foreground">
              {busy ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({
  open, setOpen, value, onChange, onResetToRole, roleLabelText,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  value: PermissionMap;
  onChange: (v: PermissionMap) => void;
  onResetToRole: () => void;
  roleLabelText: string;
}) {
  const toggle = (modKey: string, action: PermissionAction) => {
    const next: PermissionMap = JSON.parse(JSON.stringify(value));
    next[modKey] = next[modKey] || ({} as Record<PermissionAction, boolean>);
    next[modKey][action] = !next[modKey][action];
    onChange(next);
  };
  const toggleModule = (modKey: string, allOn: boolean) => {
    const next: PermissionMap = JSON.parse(JSON.stringify(value));
    const mod = PERMISSION_CATALOG.find((m) => m.key === modKey);
    if (!mod) return;
    next[modKey] = next[modKey] || ({} as Record<PermissionAction, boolean>);
    mod.actions.forEach((a) => (next[modKey][a] = !allOn));
    onChange(next);
  };
  const allOn = (modKey: string) => {
    const mod = PERMISSION_CATALOG.find((m) => m.key === modKey);
    if (!mod) return false;
    return mod.actions.every((a) => !!value[modKey]?.[a]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Permissões — {roleLabelText}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Marque apenas o que o colaborador pode acessar. As escolhas substituem as permissões padrão do cargo.
          </p>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Módulo</th>
                  <th className="text-center px-3 py-2 font-medium w-20">Visualizar</th>
                  <th className="text-center px-3 py-2 font-medium w-16">Criar</th>
                  <th className="text-center px-3 py-2 font-medium w-16">Editar</th>
                  <th className="text-center px-3 py-2 font-medium w-16">Excluir</th>
                  <th className="text-center px-3 py-2 font-medium w-20">Tudo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PERMISSION_CATALOG.map((mod) => {
                  const everyOn = allOn(mod.key);
                  return (
                    <tr key={mod.key} className="hover:bg-surface-elevated/40">
                      <td className="px-3 py-2">
                        <div className="font-medium text-xs">{mod.label}</div>
                        {mod.description && (
                          <div className="text-[10px] text-muted-foreground">{mod.description}</div>
                        )}
                      </td>
                      {(["view", "create", "edit", "delete"] as PermissionAction[]).map((a) => (
                        <td key={a} className="px-3 py-2 text-center">
                          {mod.actions.includes(a) ? (
                            <Checkbox
                              checked={!!value[mod.key]?.[a]}
                              onCheckedChange={() => toggle(mod.key, a)}
                              aria-label={`${mod.label} — ${ACTION_LABEL[a]}`}
                            />
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center">
                        <Checkbox
                          checked={everyOn}
                          onCheckedChange={() => toggleModule(mod.key, everyOn)}
                          aria-label={`Marcar/desmarcar todas em ${mod.label}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter className="pt-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={onResetToRole}>
            Restaurar padrão do cargo
          </Button>
          <Button type="button" className="bg-primary text-primary-foreground" onClick={() => setOpen(false)}>
            Aplicar permissões
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}