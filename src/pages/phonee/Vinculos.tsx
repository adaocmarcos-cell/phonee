import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, UserPlus, Trash2, RefreshCw, Search, Link2, Users2, AlertCircle, CheckCircle2, XCircle } from "lucide-react";

type Store = { store_id: string; store_name: string; owner_email: string | null };
type Binding = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_owner: boolean;
  roles: string[];
};
type StorePermission = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  can_view_sales: boolean;
  can_edit_sales: boolean;
  can_view_purchases: boolean;
  can_edit_purchases: boolean;
};
type FeatureKey = "view_sales" | "edit_sales" | "view_purchases" | "edit_purchases";
const PERM_FEATURES: { key: FeatureKey; col: keyof StorePermission; label: string }[] = [
  { key: "view_sales", col: "can_view_sales", label: "Ver vendas" },
  { key: "edit_sales", col: "can_edit_sales", label: "Editar vendas" },
  { key: "view_purchases", col: "can_view_purchases", label: "Ver compras" },
  { key: "edit_purchases", col: "can_edit_purchases", label: "Editar compras" },
];
type AuditRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  has_store: boolean;
  has_role: boolean;
  is_admin_master: boolean;
  issue: string;
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "dono", label: "Dono" },
  { value: "administrador", label: "Administrador" },
  { value: "gerente", label: "Gerente" },
  { value: "financeiro", label: "Financeiro" },
  { value: "tecnico", label: "Técnico" },
  { value: "vendedor", label: "Vendedor" },
  { value: "estoquista", label: "Estoquista" },
  { value: "atendimento", label: "Atendimento" },
];

const ISSUE_LABEL: Record<string, { label: string; tone: string }> = {
  ok: { label: "OK", tone: "bg-emerald-500/20 text-emerald-200" },
  ok_admin_master: { label: "Admin Master", tone: "bg-violet-500/20 text-violet-200" },
  sem_loja_e_sem_cargo: { label: "Sem loja e sem cargo", tone: "bg-rose-500/20 text-rose-200" },
  sem_vinculo_de_loja: { label: "Sem vínculo de loja", tone: "bg-amber-500/20 text-amber-200" },
  sem_cargo_atribuido: { label: "Sem cargo", tone: "bg-amber-500/20 text-amber-200" },
};

export default function PhoneeVinculos() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [storeQ, setStoreQ] = useState("");
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingBindings, setLoadingBindings] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(true);

  const [openAdd, setOpenAdd] = useState(false);
  const [addForm, setAddForm] = useState({ user_id: "", role: "vendedor" });
  const [saving, setSaving] = useState(false);

  const [confirmDel, setConfirmDel] = useState<Binding | null>(null);
  const [perms, setPerms] = useState<StorePermission[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [isAdminMaster, setIsAdminMaster] = useState(false);
  const [addValidation, setAddValidation] = useState<{ ok: boolean; reason: string | null } | null>(null);

  // Bulk state
  const [openBulk, setOpenBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkRole, setBulkRole] = useState("vendedor");
  const [bulkResults, setBulkResults] = useState<Array<{ email: string; role: string; user_id: string | null; status: string; reason: string | null }>>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase
        .from("admin_master_profile" as any)
        .select("user_id").eq("user_id", user.user.id).maybeSingle();
      setIsAdminMaster(!!data);
    })();
  }, []);

  const loadStores = async () => {
    setLoadingStores(true);
    const { data, error } = await (supabase.rpc as any)("phonee_stores");
    if (error) toast.error(error.message);
    else setStores(((data ?? []) as Store[]).sort((a, b) => a.store_name.localeCompare(b.store_name)));
    setLoadingStores(false);
  };

  const loadAudit = async () => {
    setLoadingAudit(true);
    const { data, error } = await (supabase.rpc as any)("phonee_permission_audit");
    if (error) toast.error(error.message);
    else setAudit((data ?? []) as AuditRow[]);
    setLoadingAudit(false);
  };

  const loadBindings = async (id: string) => {
    if (!id) { setBindings([]); return; }
    setLoadingBindings(true);
    const { data, error } = await (supabase.rpc as any)("phonee_store_bindings", { _store_id: id });
    if (error) toast.error(error.message);
    else setBindings((data ?? []) as Binding[]);
    setLoadingBindings(false);
  };

  const loadPerms = async (id: string) => {
    if (!id) { setPerms([]); return; }
    setLoadingPerms(true);
    const { data, error } = await (supabase.rpc as any)("phonee_list_store_permissions", { _store_id: id });
    if (error) toast.error(error.message);
    else setPerms((data ?? []) as StorePermission[]);
    setLoadingPerms(false);
  };

  useEffect(() => { loadStores(); loadAudit(); }, []);
  useEffect(() => { loadBindings(storeId); loadPerms(storeId); }, [storeId]);

  const filteredStores = useMemo(() => {
    const q = storeQ.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) =>
      s.store_name.toLowerCase().includes(q) || (s.owner_email ?? "").toLowerCase().includes(q),
    );
  }, [stores, storeQ]);

  const problems = useMemo(
    () => audit.filter((a) => a.issue !== "ok" && a.issue !== "ok_admin_master"),
    [audit],
  );

  const handleAdd = async () => {
    if (!addForm.user_id.trim() || !storeId) {
      toast.error("Informe o user_id e selecione a loja.");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.rpc as any)("phonee_bind_user_to_store", {
      _user_id: addForm.user_id.trim(),
      _store_id: storeId,
      _role: addForm.role,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Vínculo criado.");
    setOpenAdd(false);
    setAddForm({ user_id: "", role: "vendedor" });
    loadBindings(storeId); loadAudit();
  };

  const handleSetRole = async (b: Binding, role: string) => {
    const { error } = await (supabase.rpc as any)("phonee_set_user_role", {
      _user_id: b.user_id, _store_id: storeId, _role: role,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Cargo atualizado para ${role}.`);
    loadBindings(storeId); loadAudit();
  };

  const handleUnbind = async () => {
    if (!confirmDel) return;
    const { error } = await (supabase.rpc as any)("phonee_unbind_user_from_store", {
      _user_id: confirmDel.user_id, _store_id: storeId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Usuário desvinculado.");
    setConfirmDel(null);
    loadBindings(storeId); loadAudit(); loadPerms(storeId);
  };

  const handleTogglePerm = async (userId: string, feature: FeatureKey, col: keyof StorePermission, allowed: boolean) => {
    setPerms((prev) => prev.map((p) => p.user_id === userId ? { ...p, [col]: allowed } : p));
    const { error } = await (supabase.rpc as any)("phonee_set_store_permission", {
      _user_id: userId, _store_id: storeId, _feature: feature, _allowed: allowed,
    });
    if (error) {
      toast.error(error.message);
      setPerms((prev) => prev.map((p) => p.user_id === userId ? { ...p, [col]: !allowed } : p));
      return;
    }
    toast.success(allowed ? "Permissão liberada." : "Permissão removida.");
  };

  const prefillFromAudit = (userId: string) => {
    setAddForm({ user_id: userId, role: "vendedor" });
    setOpenAdd(true);
  };

  // Compute disabled reasons for role options in the "Add" dialog
  const roleDisabledReason = (role: string): string | null => {
    if (role === "admin_master") return "Cargo Admin Master é gerenciado em outra tela.";
    if (role === "administrador" && !isAdminMaster) return "Somente Admin Master pode atribuir este cargo.";
    if (role === "dono") {
      const already = bindings.find((b) => b.is_owner);
      if (already && already.user_id !== addForm.user_id.trim())
        return "A loja já possui dono. Remova o atual antes de atribuir outro.";
    }
    if (addForm.user_id.trim()) {
      const existing = bindings.find((b) => b.user_id === addForm.user_id.trim());
      if (existing && existing.roles.includes(role))
        return "Usuário já possui este cargo nesta loja.";
    }
    return null;
  };

  // Server-side pre-validation on submit
  const validateAndAdd = async () => {
    if (!addForm.user_id.trim() || !storeId) {
      toast.error("Informe o user_id e selecione a loja.");
      return;
    }
    setSaving(true);
    const { data, error } = await (supabase.rpc as any)("phonee_validate_role_assignment", {
      _user_id: addForm.user_id.trim(), _store_id: storeId, _role: addForm.role,
    });
    if (error) { setSaving(false); toast.error(error.message); return; }
    const v = data as { ok: boolean; reason: string | null };
    setAddValidation(v);
    if (!v.ok) {
      setSaving(false);
      toast.error(v.reason ?? "Atribuição bloqueada");
      return;
    }
    await handleAdd();
    setSaving(false);
  };

  // Bulk actions
  const parseBulk = () => {
    return bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const [rawEmail, rawRole] = line.split(",").map((s) => s?.trim());
      return { email: rawEmail ?? "", role: (rawRole || bulkRole).toLowerCase() };
    });
  };

  const runBulkValidate = async () => {
    if (!storeId) { toast.error("Selecione uma loja."); return; }
    const rows = parseBulk();
    if (rows.length === 0) { toast.error("Informe pelo menos um e-mail."); return; }
    setBulkLoading(true);
    const { data, error } = await (supabase.rpc as any)("phonee_bulk_validate_bindings", {
      _store_id: storeId, _rows: rows,
    });
    setBulkLoading(false);
    if (error) { toast.error(error.message); return; }
    setBulkResults((data ?? []) as any);
  };

  const runBulkApply = async () => {
    if (!storeId) return;
    const rows = parseBulk();
    setBulkApplying(true);
    const { data, error } = await (supabase.rpc as any)("phonee_bulk_bind_users", {
      _store_id: storeId, _rows: rows,
    });
    setBulkApplying(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { inserted: number; skipped: number; errors: any[] };
    toast.success(`${r.inserted} vinculado(s), ${r.skipped} ignorado(s).`);
    setOpenBulk(false);
    setBulkText(""); setBulkResults([]);
    loadBindings(storeId); loadAudit(); loadPerms(storeId);
  };

  const bulkOkCount = bulkResults.filter((r) => r.status === "ok").length;

  return (
    <div className="p-4 md:p-6 space-y-6 text-slate-100">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Vínculos de usuários
          </h1>
          <p className="text-sm text-slate-400">
            Gerencie manualmente quem tem acesso a cada loja e qual o cargo.
          </p>
        </div>
        <Button variant="outline" onClick={() => { loadStores(); loadAudit(); loadBindings(storeId); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>

      {/* Auditoria de permissões */}
      <section className="rounded-lg border border-slate-800 bg-slate-900">
        <header className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            <h2 className="font-semibold">Auditoria de permissões</h2>
            <Badge className="bg-amber-500/20 text-amber-200 border-0">
              {problems.length} com problema
            </Badge>
          </div>
          <span className="text-xs text-slate-400">{audit.length} usuários no total</span>
        </header>
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-400 bg-slate-900 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2">Usuário</th>
                <th className="text-left px-4 py-2">Loja</th>
                <th className="text-left px-4 py-2">Cargo</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loadingAudit && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Carregando…</td></tr>
              )}
              {!loadingAudit && problems.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Nenhum usuário com problema de vínculo. 🎉
                </td></tr>
              )}
              {problems.map((r) => {
                const tag = ISSUE_LABEL[r.issue] ?? { label: r.issue, tone: "bg-slate-700 text-slate-100" };
                return (
                  <tr key={r.user_id} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.full_name ?? "—"}</div>
                      <div className="text-xs text-slate-400">{r.email}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{r.user_id}</div>
                    </td>
                    <td className="px-4 py-2">{r.has_store ? "Sim" : <span className="text-rose-300">Não</span>}</td>
                    <td className="px-4 py-2">{r.has_role ? "Sim" : <span className="text-rose-300">Não</span>}</td>
                    <td className="px-4 py-2">
                      <Badge className={`${tag.tone} border-0`}>{tag.label}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => prefillFromAudit(r.user_id)}>
                        Vincular…
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Permissões de vendas e compras */}
      <section className="rounded-lg border border-slate-800 bg-slate-900">
        <header className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Permissões de Vendas e Compras</h2>
            <p className="text-xs text-slate-400">
              Por padrão, todo membro da loja pode ver e editar. Desligue individualmente quando precisar restringir.
              Toda mudança fica registrada no log do sistema.
            </p>
          </div>
        </header>
        <div className="p-4">
          {!storeId && (
            <p className="text-sm text-slate-400">Selecione uma loja abaixo para gerenciar permissões.</p>
          )}
          {storeId && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">Usuário</th>
                    {PERM_FEATURES.map((f) => (
                      <th key={f.key} className="text-center px-3 py-2">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingPerms && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Carregando…</td></tr>
                  )}
                  {!loadingPerms && perms.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      Nenhum usuário vinculado a esta loja.
                    </td></tr>
                  )}
                  {perms.map((p) => (
                    <tr key={p.user_id} className="border-t border-slate-800 hover:bg-slate-800/40">
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.full_name ?? "—"}</div>
                        <div className="text-xs text-slate-400">{p.email}</div>
                      </td>
                      {PERM_FEATURES.map((f) => (
                        <td key={f.key} className="px-3 py-2 text-center">
                          <Switch
                            checked={Boolean(p[f.col])}
                            onCheckedChange={(v) => handleTogglePerm(p.user_id, f.key, f.col, v)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Vínculos por loja */}
      <section className="rounded-lg border border-slate-800 bg-slate-900">
        <header className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar loja por nome ou e-mail do dono…"
              value={storeQ}
              onChange={(e) => setStoreQ(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 max-w-md"
            />
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
                <SelectValue placeholder={loadingStores ? "Carregando lojas…" : "Selecione uma loja"} />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {filteredStores.map((s) => (
                  <SelectItem key={s.store_id} value={s.store_id}>
                    {s.store_name} — {s.owner_email ?? "sem dono"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setOpenAdd(true)} disabled={!storeId}>
            <UserPlus className="h-4 w-4 mr-2" /> Adicionar vínculo
          </Button>
        </header>

        <div className="p-4">
          {!storeId && (
            <p className="text-sm text-slate-400">Selecione uma loja para ver os usuários vinculados.</p>
          )}
          {storeId && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">Usuário</th>
                    <th className="text-left px-3 py-2">Cargo atual</th>
                    <th className="text-left px-3 py-2">Alterar cargo</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingBindings && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Carregando…</td></tr>
                  )}
                  {!loadingBindings && bindings.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      Nenhum usuário vinculado a esta loja.
                    </td></tr>
                  )}
                  {bindings.map((b) => (
                    <tr key={b.user_id} className="border-t border-slate-800 hover:bg-slate-800/40">
                      <td className="px-3 py-2">
                        <div className="font-medium flex items-center gap-2">
                          {b.full_name ?? "—"}
                          {b.is_owner && (
                            <Badge className="bg-violet-500/20 text-violet-200 border-0">Dono da loja</Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">{b.email}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{b.user_id}</div>
                      </td>
                      <td className="px-3 py-2">
                        {b.roles.length === 0
                          ? <span className="text-rose-300">sem cargo</span>
                          : b.roles.map((r) => (
                              <Badge key={r} className="bg-slate-700 text-slate-100 border-0 mr-1">{r}</Badge>
                            ))}
                      </td>
                      <td className="px-3 py-2">
                        <Select onValueChange={(v) => handleSetRole(b, v)}>
                          <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700 text-slate-100">
                            <SelectValue placeholder="Definir cargo…" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm" variant="ghost"
                          className="text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
                          onClick={() => setConfirmDel(b)}
                          disabled={b.is_owner}
                          title={b.is_owner ? "O dono não pode ser desvinculado" : "Desvincular"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Dialog: adicionar */}
      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar vínculo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>User ID</Label>
              <Input
                placeholder="uuid do usuário"
                value={addForm.user_id}
                onChange={(e) => setAddForm((f) => ({ ...f, user_id: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Copie o UUID do usuário na auditoria acima ou na tela de Usuários.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Cargo</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenAdd(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? "Salvando…" : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove o acesso de <b>{confirmDel?.email}</b> a esta loja e apaga todos os cargos atribuídos.
              A conta em si não é excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnbind}>Desvincular</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}