import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil, Trash2, AlertTriangle } from "lucide-react";

type Row = {
  store_id: string; store_name: string;
  owner_id: string | null;
  owner_email: string | null; owner_name: string | null;
  plan_name: string | null; billing_cycle: string | null; subscription_status: string | null;
  expires_at: string | null; created_at: string;
  total_sales: number; sales_count: number; avg_ticket: number;
};

const brl = (n: number) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PhoneeLojas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ store_name: "", owner_name: "", owner_email: "", new_password: "" });
  const [saving, setSaving] = useState(false);
  const [confirmPwd, setConfirmPwd] = useState(false);

  // Exclusão com dupla confirmação
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteUnderstood, setDeleteUnderstood] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openDelete = (r: Row) => {
    setDeleting(r);
    setDeleteStep(1);
    setDeleteTyped("");
    setDeleteUnderstood(false);
  };

  const runDelete = async () => {
    if (!deleting) return;
    if (deleteTyped.trim() !== deleting.store_name) {
      toast.error("Digite o nome exato da loja para confirmar.");
      return;
    }
    setDeleteBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("phonee-admin-user", {
        body: { action: "delete_store", store_id: deleting.store_id, confirm_name: deleteTyped.trim() },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message);
      toast.success(`Loja "${deleting.store_name}" excluída.`);
      setDeleting(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir loja.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const load = async () => {
    const { data } = await supabase.rpc("phonee_stores");
    setRows((data ?? []) as unknown as Row[]);
  };
  useEffect(() => { load(); }, []);

  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      store_name: r.store_name ?? "",
      owner_name: r.owner_name ?? "",
      owner_email: r.owner_email ?? "",
      new_password: "",
    });
    setConfirmPwd(false);
  };

  const save = async () => {
    if (!editing) return;
    if (!form.store_name.trim()) return toast.error("Nome da loja é obrigatório.");
    if (form.new_password && form.new_password.length < 8)
      return toast.error("Senha mínima de 8 caracteres.");
    if (form.new_password && !confirmPwd)
      return toast.error("Confirme a redefinição de senha marcando a caixa.");

    setSaving(true);
    try {
      // 1) Update store name (if changed)
      if (form.store_name.trim() !== (editing.store_name ?? "")) {
        const { data, error } = await supabase.functions.invoke("phonee-admin-user", {
          body: { action: "update_store", store_id: editing.store_id, store_name: form.store_name.trim() },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message);
      }
      // 2) Update owner (name/email/password) if owner exists and any changed
      if (editing.owner_id) {
        const ownerPatch: Record<string, unknown> = { action: "update", user_id: editing.owner_id };
        let dirty = false;
        if (form.owner_name.trim() !== (editing.owner_name ?? "")) { ownerPatch.full_name = form.owner_name.trim(); dirty = true; }
        if (form.owner_email.trim().toLowerCase() !== (editing.owner_email ?? "").toLowerCase()) { ownerPatch.email = form.owner_email.trim(); dirty = true; }
        if (form.new_password) { ownerPatch.new_password = form.new_password; dirty = true; }
        if (dirty) {
          const { data, error } = await supabase.functions.invoke("phonee-admin-user", { body: ownerPatch });
          if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message);
        }
      }
      toast.success("Dados atualizados.");
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    return !t || r.store_name?.toLowerCase().includes(t)
      || r.owner_email?.toLowerCase().includes(t)
      || r.owner_name?.toLowerCase().includes(t);
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold leading-tight">Lojas da plataforma</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            {rows.length} loja(s) registrada(s).
          </p>
        </div>
        <input
          placeholder="Buscar por loja, dono ou e-mail…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-72 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:border-[#00abfb]"
        />
      </div>

      {/* Mobile: stacked cards with vertical labels */}
      <div className="md:hidden space-y-3">
        {filtered.map((r) => (
          <div
            key={r.store_id}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{r.store_name}</div>
                <div className="text-xs text-slate-400 truncate">
                  {r.owner_name ?? "—"}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {r.owner_email}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-200 capitalize">
                  {r.subscription_status ?? "sem assinatura"}
                </span>
                <button
                  onClick={() => openEdit(r)}
                  className="inline-flex items-center gap-1 text-[11px] text-[#00abfb] hover:underline"
                >
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <button
                  onClick={() => openDelete(r)}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> Excluir
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Plano</span>
                <span className="truncate">{r.plan_name ?? "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Ciclo</span>
                <span className="capitalize truncate">{r.billing_cycle ?? "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Vendas</span>
                <span>{r.sales_count}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Ticket médio</span>
                <span className="truncate">{brl(Number(r.avg_ticket))}</span>
              </div>
              <div className="col-span-2 flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Faturamento</span>
                <span className="font-semibold text-[#00abfb]">{brl(Number(r.total_sales))}</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-8 text-center text-slate-500 text-sm">
            Nenhuma loja encontrada.
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Loja</th>
              <th className="px-4 py-3">Dono</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Ciclo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Vendas</th>
              <th className="px-4 py-3 text-right">Faturamento</th>
              <th className="px-4 py-3 text-right">Ticket médio</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.store_id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium">{r.store_name}</td>
                <td className="px-4 py-3 text-slate-300">
                  <div>{r.owner_name ?? "—"}</div>
                  <div className="text-xs text-slate-500">{r.owner_email}</div>
                </td>
                <td className="px-4 py-3">{r.plan_name ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{r.billing_cycle ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-200">
                    {r.subscription_status ?? "sem assinatura"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{r.sales_count}</td>
                <td className="px-4 py-3 text-right">{brl(Number(r.total_sales))}</td>
                <td className="px-4 py-3 text-right">{brl(Number(r.avg_ticket))}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-3">
                    <button
                      onClick={() => openEdit(r)}
                      className="inline-flex items-center gap-1 text-[#00abfb] hover:underline text-xs"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    <button
                      onClick={() => openDelete(r)}
                      className="inline-flex items-center gap-1 text-rose-400 hover:underline text-xs"
                    >
                      <Trash2 className="h-3 w-3" /> Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Nenhuma loja encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle>Editar loja</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400">Nome da loja</Label>
              <Input
                value={form.store_name}
                onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                className="bg-slate-950 border-slate-700"
              />
            </div>
            <div className="border-t border-slate-800 pt-3">
              <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Dono</div>
              {!editing?.owner_id ? (
                <div className="text-xs text-slate-400">Esta loja não tem dono vinculado.</div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-slate-400">Nome do dono</Label>
                    <Input
                      value={form.owner_name}
                      onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                      className="bg-slate-950 border-slate-700"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400">E-mail (login)</Label>
                    <Input
                      type="email"
                      value={form.owner_email}
                      onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                      className="bg-slate-950 border-slate-700"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400">Redefinir senha (opcional)</Label>
                    <Input
                      type="text"
                      placeholder="Mínimo 8 caracteres — deixe em branco para não alterar"
                      value={form.new_password}
                      onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                      className="bg-slate-950 border-slate-700 font-mono"
                    />
                    {form.new_password && (
                      <label className="mt-2 flex items-start gap-2 text-xs text-amber-300">
                        <input
                          type="checkbox"
                          checked={confirmPwd}
                          onChange={(e) => setConfirmPwd(e.target.checked)}
                          className="mt-0.5"
                        />
                        Confirmo que desejo redefinir a senha deste dono — ele perderá o acesso atual.
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-[#00abfb] hover:bg-[#0095dd] text-white">
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exclusão de loja — dupla confirmação */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && !deleteBusy && setDeleting(null)}>
        <DialogContent className="max-w-md bg-slate-900 border-rose-900/60 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              {deleteStep === 1 ? "Excluir loja?" : "Confirmação final"}
            </DialogTitle>
          </DialogHeader>

          {deleteStep === 1 && deleting && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-300">
                Você está prestes a excluir <b className="text-white">{deleting.store_name}</b>
                {deleting.owner_email && <> (dono: <span className="text-slate-400">{deleting.owner_email}</span>)</>}.
              </p>
              <div className="rounded-md border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-200 space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Esta ação é irreversível.
                </div>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Todos os dados desta loja (vendas, estoque, OS, financeiro, etc.) serão removidos.</li>
                  <li>Assinaturas vinculadas serão canceladas.</li>
                  <li>Sua identidade será registrada na auditoria.</li>
                </ul>
              </div>
              <label className="flex items-start gap-2 text-xs text-amber-200">
                <input
                  type="checkbox"
                  checked={deleteUnderstood}
                  onChange={(e) => setDeleteUnderstood(e.target.checked)}
                  className="mt-0.5"
                />
                Entendo as consequências e quero prosseguir.
              </label>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
                <Button
                  disabled={!deleteUnderstood}
                  onClick={() => setDeleteStep(2)}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Continuar
                </Button>
              </DialogFooter>
            </div>
          )}

          {deleteStep === 2 && deleting && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-300">
                Para confirmar, digite o nome exato da loja:
              </p>
              <div className="rounded-md bg-slate-950 border border-slate-700 px-3 py-2 font-mono text-sm text-rose-300">
                {deleting.store_name}
              </div>
              <Input
                autoFocus
                value={deleteTyped}
                onChange={(e) => setDeleteTyped(e.target.value)}
                placeholder="Digite o nome da loja"
                className="bg-slate-950 border-slate-700"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteStep(1)} disabled={deleteBusy}>Voltar</Button>
                <Button
                  onClick={runDelete}
                  disabled={deleteBusy || deleteTyped.trim() !== deleting.store_name}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {deleteBusy ? "Excluindo…" : "Excluir definitivamente"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}