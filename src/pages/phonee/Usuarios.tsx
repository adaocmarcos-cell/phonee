import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Ban, Trash2, ShieldCheck, KeyRound, UserPlus, CalendarClock, Handshake, Copy, Link2, Lock, HardDrive, Package, ShoppingCart, DollarSign } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StoreRef = { id: string; name: string; is_owner: boolean };
type Row = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  stores_count: number;
  roles: string[];
  stores: StoreRef[];
  plan_name: string | null;
  subscription_status: string | null;
  is_admin_master: boolean;
};

type Action = "block" | "unblock" | "delete";

export default function PhoneeUsuarios() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  type Metric = { products: number; storage_bytes: number; sales_30: number; sales_90: number; sales_180: number; sales_365: number; revenue: number };
  const [metrics, setMetrics] = useState<Record<string, Metric>>({});
  const [salesWindow, setSalesWindow] = useState<30 | 90 | 180 | 365>(30);

  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", new_password: "", expires_at: "" });
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState<{ row: Row; action: Action } | null>(null);
  const [busy, setBusy] = useState(false);

  const [openNew, setOpenNew] = useState(false);
  const [newForm, setNewForm] = useState({
    full_name: "", email: "", phone: "", password: "",
    has_expiration: false, expires_at: "", send_recovery: true,
  });
  const [creating, setCreating] = useState(false);

  // ---- Partner user (7 days, password 1234567890, first-login change) ----
  const [openPartner, setOpenPartner] = useState(false);
  const [partnerForm, setPartnerForm] = useState({ full_name: "", email: "", whatsapp: "" });
  const [creatingPartner, setCreatingPartner] = useState(false);
  const [partnerResult, setPartnerResult] = useState<
    | { email: string; temp_password: string; access_url: string; expires_at: string }
    | null
  >(null);

  const load = async () => {
    setLoading(true);
    const [usersRes, metricsRes] = await Promise.all([
      supabase.rpc("phonee_users"),
      supabase.rpc("phonee_user_metrics"),
    ]);
    if (usersRes.error) toast.error(usersRes.error.message);
    if (metricsRes.error) toast.error(metricsRes.error.message);
    setRows(((usersRes.data ?? []) as unknown as Row[]).map((r) => ({
      ...r,
      stores: Array.isArray(r.stores) ? r.stores : [],
    })));
    setMetrics((metricsRes.data as Record<string, Metric>) ?? {});
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      r.email?.toLowerCase().includes(t) ||
      r.full_name?.toLowerCase().includes(t) ||
      (r.roles ?? []).some((x) => x.toLowerCase().includes(t)) ||
      (r.plan_name ?? "").toLowerCase().includes(t) ||
      r.stores.some((s) => s.name.toLowerCase().includes(t))
    );
  }, [rows, q]);

  const openEdit = (r: Row) => {
    setEditing(r);
    setEditForm({ full_name: r.full_name ?? "", email: r.email ?? "", new_password: "", expires_at: "" });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.full_name.trim() || !editForm.email.trim()) {
      toast.error("Nome e e-mail são obrigatórios.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("phonee-admin-user", {
      body: {
        action: "update",
        user_id: editing.user_id,
        full_name: editForm.full_name,
        email: editForm.email,
        new_password: editForm.new_password || undefined,
        expires_at: editForm.expires_at || undefined,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error(((data as any)?.error) || error?.message || "Falha ao salvar.");
      return;
    }
    toast.success("Usuário atualizado.");
    setEditing(null);
    load();
  };

  const createUser = async () => {
    if (!newForm.email.trim() || !newForm.full_name.trim()) {
      return toast.error("Nome e e-mail são obrigatórios.");
    }
    if (newForm.has_expiration && !newForm.expires_at) {
      return toast.error("Defina a data de expiração ou desmarque a opção.");
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("phonee-admin-user", {
      body: {
        action: "create_user",
        full_name: newForm.full_name,
        email: newForm.email,
        phone: newForm.phone || undefined,
        password: newForm.password || undefined,
        expires_at: newForm.has_expiration ? newForm.expires_at : null,
        send_recovery: newForm.send_recovery,
      },
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      return toast.error(((data as any)?.error) || error?.message || "Falha ao criar usuário.");
    }
    const tempPass = (data as any)?.password;
    const recovery = (data as any)?.recovery_link;
    toast.success("Usuário criado.");
    if (tempPass) {
      navigator.clipboard.writeText(tempPass);
      toast.message("Senha temporária copiada", { description: tempPass });
    }
    if (recovery) {
      navigator.clipboard.writeText(recovery);
      toast.message("Link de redefinição copiado para a área de transferência.");
    }
    setOpenNew(false);
    setNewForm({ full_name: "", email: "", phone: "", password: "", has_expiration: false, expires_at: "", send_recovery: true });
    load();
  };

  const runAction = async () => {
    if (!confirm) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("phonee-admin-user", {
      body: { action: confirm.action, user_id: confirm.row.user_id },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error(((data as any)?.error) || error?.message || "Falha na operação.");
      return;
    }
    toast.success(
      confirm.action === "delete" ? "Usuário excluído." :
      confirm.action === "block" ? "Usuário bloqueado." : "Usuário reativado."
    );
    setConfirm(null);
    load();
  };

  const copyText = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado.`); }
    catch { toast.error("Não foi possível copiar."); }
  };

  const createPartner = async () => {
    if (!partnerForm.email.trim() || !partnerForm.full_name.trim()) {
      return toast.error("Nome e e-mail são obrigatórios.");
    }
    setCreatingPartner(true);
    const { data, error } = await supabase.functions.invoke("phonee-admin-user", {
      body: {
        action: "create_partner_user",
        full_name: partnerForm.full_name,
        email: partnerForm.email,
        whatsapp: partnerForm.whatsapp || undefined,
        access_origin: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    setCreatingPartner(false);
    if (error || (data as any)?.error) {
      return toast.error(((data as any)?.error) || error?.message || "Falha ao criar parceiro.");
    }
    const d = data as any;
    setPartnerResult({
      email: d.email,
      temp_password: d.temp_password,
      access_url: d.access_url,
      expires_at: d.expires_at,
    });
    setOpenPartner(false);
    setPartnerForm({ full_name: "", email: "", whatsapp: "" });
    toast.success("Parceiro criado. Link de acesso disponível no topo da página.");
    load();
  };

  return (
    <div>
      {partnerResult && (
        <div className="mb-5 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-400" />
              <div>
                <div className="text-sm font-semibold text-amber-200">
                  Link de acesso privado do parceiro
                </div>
                <div className="text-xs text-amber-200/70">
                  Compartilhe somente com o parceiro aprovado. Senha padrão; troca obrigatória no primeiro login. Expira em {new Date(partnerResult.expires_at).toLocaleDateString("pt-BR")}.
                </div>
              </div>
            </div>
            <button
              onClick={() => setPartnerResult(null)}
              className="text-xs text-amber-200/70 hover:text-amber-100"
            >
              fechar
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="sm:col-span-3 flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-md px-3 py-2">
              <Link2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input readOnly value={partnerResult.access_url}
                className="flex-1 bg-transparent text-xs text-slate-200 outline-none" />
              <button onClick={() => copyText(partnerResult.access_url, "Link")}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-md px-3 py-2">
              <span className="text-[10px] uppercase text-slate-500">E-mail</span>
              <span className="text-xs text-slate-200 truncate flex-1">{partnerResult.email}</span>
              <button onClick={() => copyText(partnerResult.email, "E-mail")}
                className="p-1 rounded hover:bg-slate-800 text-slate-300">
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-md px-3 py-2">
              <span className="text-[10px] uppercase text-slate-500">Senha</span>
              <span className="text-xs font-mono text-slate-200 flex-1">{partnerResult.temp_password}</span>
              <button onClick={() => copyText(partnerResult.temp_password, "Senha")}
                className="p-1 rounded hover:bg-slate-800 text-slate-300">
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-md px-3 py-2">
              <span className="text-[10px] uppercase text-slate-500">Expira</span>
              <span className="text-xs text-slate-200 flex-1">
                {new Date(partnerResult.expires_at).toLocaleString("pt-BR")}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Usuários da plataforma</h1>
          <p className="text-sm text-slate-400">
            {filtered.length} de {rows.length} usuário(s).
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            placeholder="Buscar por nome, e-mail, loja, papel ou plano…"
            value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full sm:w-80 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100"
          />
          <Button onClick={() => setOpenPartner(true)} variant="outline"
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200">
            <Handshake className="h-4 w-4 mr-1.5" /> Adicionar Usuário Parceiro
          </Button>
          <Button onClick={() => setOpenNew(true)} className="bg-sky-600 hover:bg-sky-700">
            <UserPlus className="h-4 w-4 mr-1.5" /> Novo usuário
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Loja(s)</th>
              <th className="px-4 py-3">Papéis</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Cadastrado</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Carregando…</td></tr>
            )}
            {!loading && filtered.map((r) => {
              const blocked = (r.roles ?? []).length === 0 ? false : false; // placeholder, banned flag not in RPC
              return (
                <tr key={r.user_id} className="border-b border-slate-800/60 hover:bg-slate-800/40 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100 flex items-center gap-1.5">
                      {r.full_name || "—"}
                      {r.is_admin_master && (
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.email}</td>
                  <td className="px-4 py-3">
                    {r.stores.length === 0 ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.stores.map((s) => (
                          <span
                            key={s.id}
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              s.is_owner
                                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                : "bg-slate-800 text-slate-200"
                            }`}
                            title={s.is_owner ? "Dono" : "Vinculado"}
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(r.roles ?? []).map((p) => (
                        <span key={p} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-200">{p}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {r.plan_name ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        {r.plan_name}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(r)}
                        title="Editar dados / redefinir senha"
                        className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirm({ row: r, action: "block" })}
                        title="Bloquear / inativar usuário"
                        className="p-1.5 rounded-md hover:bg-amber-500/10 text-amber-400"
                        disabled={r.is_admin_master}
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirm({ row: r, action: "delete" })}
                        title="Excluir usuário"
                        className="p-1.5 rounded-md hover:bg-rose-500/10 text-rose-400"
                        disabled={r.is_admin_master}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Nenhum usuário encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome completo</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> Nova senha (opcional)
              </Label>
              <Input
                type="text"
                placeholder="Deixe em branco para manter"
                value={editForm.new_password}
                onChange={(e) => setEditForm((f) => ({ ...f, new_password: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Útil para ajudar usuários secundários no login. Mínimo 8 caracteres.
              </p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> Expiração do cadastro (opcional)
              </Label>
              <Input
                type="date"
                value={editForm.expires_at}
                onChange={(e) => setEditForm((f) => ({ ...f, expires_at: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Deixe em branco para não expirar. Registra a data nos extras do perfil.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New user dialog */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome completo *</Label>
              <Input value={newForm.full_name}
                onChange={(e) => setNewForm(f => ({...f, full_name: e.target.value}))}/>
            </div>
            <div>
              <Label>E-mail *</Label>
              <Input type="email" value={newForm.email}
                onChange={(e) => setNewForm(f => ({...f, email: e.target.value}))}/>
            </div>
            <div>
              <Label>WhatsApp / Telefone</Label>
              <Input value={newForm.phone}
                onChange={(e) => setNewForm(f => ({...f, phone: e.target.value}))}/>
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5"/> Senha (opcional)</Label>
              <Input type="text" placeholder="Em branco gera senha aleatória"
                value={newForm.password}
                onChange={(e) => setNewForm(f => ({...f, password: e.target.value}))}/>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={newForm.has_expiration}
                onChange={(e) => setNewForm(f => ({...f, has_expiration: e.target.checked}))}/>
              Definir data de expiração do cadastro
            </label>
            {newForm.has_expiration && (
              <div>
                <Label>Expira em</Label>
                <Input type="date" value={newForm.expires_at}
                  onChange={(e) => setNewForm(f => ({...f, expires_at: e.target.value}))}/>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={newForm.send_recovery}
                onChange={(e) => setNewForm(f => ({...f, send_recovery: e.target.checked}))}/>
              Gerar link de redefinição de senha (copiado ao criar)
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenNew(false)} disabled={creating}>Cancelar</Button>
            <Button onClick={createUser} disabled={creating} className="bg-sky-600 hover:bg-sky-700">
              {creating ? "Criando…" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partner user dialog */}
      <Dialog open={openPartner} onOpenChange={setOpenPartner}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-amber-400" /> Adicionar Usuário Parceiro
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200/90">
              Acesso de avaliação por <b>7 dias</b>. Senha padrão <b className="font-mono">1234567890</b>.
              No primeiro login o parceiro será obrigado a criar sua própria senha.
              O link de acesso será exibido somente para você nesta tela (não é público).
            </div>
            <div>
              <Label>Nome completo *</Label>
              <Input value={partnerForm.full_name}
                onChange={(e) => setPartnerForm(f => ({...f, full_name: e.target.value}))}/>
            </div>
            <div>
              <Label>E-mail *</Label>
              <Input type="email" value={partnerForm.email}
                onChange={(e) => setPartnerForm(f => ({...f, email: e.target.value}))}/>
            </div>
            <div>
              <Label>WhatsApp (opcional)</Label>
              <Input value={partnerForm.whatsapp}
                onChange={(e) => setPartnerForm(f => ({...f, whatsapp: e.target.value}))}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenPartner(false)} disabled={creatingPartner}>Cancelar</Button>
            <Button onClick={createPartner} disabled={creatingPartner}
              className="bg-amber-600 hover:bg-amber-700 text-white">
              {creatingPartner ? "Criando…" : "Criar parceiro (7 dias)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "delete" && "Excluir usuário?"}
              {confirm?.action === "block" && "Bloquear usuário?"}
              {confirm?.action === "unblock" && "Reativar usuário?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "delete" && (
                <>Esta ação é <b>permanente</b>. O usuário <b>{confirm.row.full_name || confirm.row.email}</b> será removido da plataforma junto com seus acessos.</>
              )}
              {confirm?.action === "block" && (
                <>O usuário <b>{confirm?.row.full_name || confirm?.row.email}</b> não conseguirá mais entrar até ser reativado.</>
              )}
              {confirm?.action === "unblock" && (
                <>O usuário <b>{confirm?.row.full_name || confirm?.row.email}</b> voltará a ter acesso à plataforma.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runAction}
              disabled={busy}
              className={confirm?.action === "delete" ? "bg-rose-600 hover:bg-rose-700" : ""}
            >
              {busy ? "Processando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}