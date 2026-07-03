import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, UserPlus, RefreshCw, Trash2, Pencil, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Master = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_super: boolean;
  permissions: string[];
  granted_by: string | null;
  granted_by_email: string | null;
  granted_at: string;
  updated_at: string;
  notes: string | null;
};

const ALL_PERMS: { key: string; label: string; desc: string }[] = [
  { key: "manage_admins",        label: "Gerir admins master",  desc: "Adicionar, remover e ajustar permissões de outros admins master." },
  { key: "change_plans",         label: "Alterar planos",        desc: "Pode trocar o plano/validade/status de assinaturas de usuários." },
  { key: "manage_subscriptions", label: "Aprovar assinaturas",   desc: "Aprovar/recusar solicitações de mudança de assinatura." },
  { key: "manage_users",         label: "Gerir usuários",        desc: "Editar dados de usuários, redefinir senha, bloquear." },
  { key: "manage_coupons",       label: "Gerir cupons",          desc: "Criar, editar e desativar cupons promocionais." },
  { key: "manage_marketing",     label: "Marketing & Tráfego",   desc: "Acessar dashboard, investimentos e pixel/CAPI." },
  { key: "view_financial",       label: "Ver financeiro",        desc: "Visualizar receita, repasses e relatórios financeiros." },
  { key: "view_audit",           label: "Ver auditoria",         desc: "Acesso ao log de auditoria de toda a plataforma." },
];

export default function PhoneeAdminMasters() {
  const [list, setList] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Master | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_masters");
    if (error) toast.error(error.message);
    setList((data as Master[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const revoke = async (m: Master) => {
    if (m.is_super) return toast.error("Super admin não pode ser removido.");
    const reason = prompt(`Motivo para remover ${m.email} (mín. 5 caracteres):`);
    if (!reason || reason.trim().length < 5) return;
    const { error } = await supabase.rpc("admin_revoke_master", { _user_id: m.user_id, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Admin removido.");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> Admins Master
          </h1>
          <p className="text-sm text-slate-400">Gestão de administradores autorizados e suas permissões. Toda alteração é registrada em auditoria.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />Atualizar</Button>
          <Button size="sm" onClick={() => setCreating(true)}><UserPlus className="w-4 h-4 mr-1" />Novo admin</Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-300">
            <tr>
              <th className="text-left px-3 py-2">Usuário</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Permissões</th>
              <th className="text-left px-3 py-2">Concedido por</th>
              <th className="text-left px-3 py-2">Quando</th>
              <th className="text-right px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-3 py-6 text-slate-500" colSpan={6}>Carregando…</td></tr>}
            {!loading && list.length === 0 && <tr><td className="px-3 py-6 text-slate-500" colSpan={6}>Nenhum admin master cadastrado.</td></tr>}
            {list.map(m => (
              <tr key={m.user_id} className="border-t border-slate-800/80">
                <td className="px-3 py-2 text-white">
                  <div className="font-medium">{m.full_name || "—"}</div>
                  <div className="text-xs text-slate-400">{m.email}</div>
                </td>
                <td className="px-3 py-2">
                  {m.is_super ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      <Crown className="w-3 h-3" /> Super
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-sky-500/15 text-sky-300 border border-sky-500/30">Admin</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {m.is_super ? <span className="text-slate-400 text-xs">Acesso total</span> : (
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {(m.permissions || []).map(p => (
                        <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">{p}</span>
                      ))}
                      {(!m.permissions || m.permissions.length === 0) && <span className="text-slate-500 text-xs">Nenhuma</span>}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-300 text-xs">{m.granted_by_email || "—"}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">{new Date(m.granted_at).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={m.is_super} onClick={() => setEditing(m)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="text-rose-300 border-rose-500/40 hover:bg-rose-500/10" disabled={m.is_super} onClick={() => revoke(m)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={load} />}
      {editing && <EditDialog master={editing} onClose={() => setEditing(null)} onDone={load} />}
    </div>
  );
}

function PermissionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (k: string) =>
    onChange(value.includes(k) ? value.filter(x => x !== k) : [...value, k]);
  return (
    <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-auto pr-1">
      {ALL_PERMS.map(p => (
        <label key={p.key} className="flex gap-2 items-start rounded-lg border border-slate-700/60 bg-slate-900/40 p-2 cursor-pointer hover:border-sky-500/40">
          <Checkbox checked={value.includes(p.key)} onCheckedChange={() => toggle(p.key)} className="mt-0.5" />
          <div>
            <div className="text-sm text-white">{p.label}</div>
            <div className="text-xs text-slate-400">{p.desc}</div>
          </div>
        </label>
      ))}
    </div>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<string[]>(["change_plans"]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!email.trim()) return toast.error("Informe o e-mail.");
    if (reason.trim().length < 5) return toast.error("Motivo precisa ter ao menos 5 caracteres.");
    setSaving(true);
    const { error } = await supabase.rpc("admin_grant_master", {
      _email: email.trim(), _permissions: perms, _reason: reason, _notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Admin master cadastrado.");
    onDone(); onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Novo admin master</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400">E-mail do usuário (deve já ter conta na plataforma)</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Permissões</label>
            <PermissionPicker value={perms} onChange={setPerms} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Motivo (auditoria)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: novo gestor financeiro" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Observações (opcional)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ master, onClose, onDone }: { master: Master; onClose: () => void; onDone: () => void }) {
  const [perms, setPerms] = useState<string[]>(master.permissions || []);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (reason.trim().length < 5) return toast.error("Motivo precisa ter ao menos 5 caracteres.");
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_master_permissions", {
      _user_id: master.user_id, _permissions: perms, _reason: reason,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Permissões atualizadas.");
    onDone(); onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Editar permissões — {master.email}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <PermissionPicker value={perms} onChange={setPerms} />
          <div>
            <label className="text-xs text-slate-400">Motivo (auditoria)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: ajuste de escopo" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}