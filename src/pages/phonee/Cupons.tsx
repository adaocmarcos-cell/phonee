import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Ticket, Percent, DollarSign } from "lucide-react";
import { toast } from "sonner";

type Coupon = {
  id: string; code: string; discount_type: "valor" | "percentual"; discount_value: number;
  valid_from: string | null; valid_until: string | null; usage_limit: number | null;
  times_used: number; partner_label: string | null; active: boolean; created_at: string;
};

const empty = {
  code: "", discount_type: "valor" as "valor" | "percentual", discount_value: "10",
  valid_until: "", usage_limit: "", partner_label: "", active: true,
};

export default function PhoneeCupons() {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Coupon | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Coupon[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    return !t || r.code.toLowerCase().includes(t) || (r.partner_label ?? "").toLowerCase().includes(t);
  });

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      discount_value: String(c.discount_value),
      valid_until: c.valid_until ? c.valid_until.slice(0, 10) : "",
      usage_limit: c.usage_limit?.toString() ?? "",
      partner_label: c.partner_label ?? "",
      active: c.active,
    });
    setOpen(true);
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    const value = Number(form.discount_value.replace(",", "."));
    if (!code) return toast.error("Informe o código.");
    if (!value || value <= 0) return toast.error("Valor inválido.");
    setSaving(true);
    const payload: any = {
      code,
      discount_type: form.discount_type,
      discount_value: value,
      valid_until: form.valid_until ? new Date(form.valid_until + "T23:59:59").toISOString() : null,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      partner_label: form.partner_label.trim() || null,
      active: form.active,
    };
    const res = editing
      ? await supabase.from("coupons").update(payload).eq("id", editing.id)
      : await supabase.from("coupons").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Cupom atualizado." : "Cupom criado.");
    setOpen(false); load();
  };

  const toggleActive = async (c: Coupon) => {
    await supabase.from("coupons").update({ active: !c.active }).eq("id", c.id);
    load();
  };

  const remove = async () => {
    if (!del) return;
    const { error } = await supabase.from("coupons").delete().eq("id", del.id);
    if (error) return toast.error(error.message);
    toast.success("Cupom removido.");
    setDel(null); load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Ticket className="h-6 w-6 text-[#00abfb]" /> Cupons de desconto</h1>
          <p className="text-sm text-slate-400">{filtered.length} de {rows.length} cupom(ns).</p>
        </div>
        <div className="flex gap-2">
          <input placeholder="Buscar código ou parceiro…" value={q} onChange={(e) => setQ(e.target.value)}
            className="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100" />
          <Button onClick={openNew} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90 font-semibold">
            <Plus className="h-4 w-4 mr-1" /> Novo cupom
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Desconto</th>
              <th className="px-4 py-3">Validade</th>
              <th className="px-4 py-3">Usos</th>
              <th className="px-4 py-3">Parceiro</th>
              <th className="px-4 py-3">Ativo</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Nenhum cupom cadastrado.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono font-semibold text-slate-100">{c.code}</td>
                <td className="px-4 py-3">
                  {c.discount_type === "valor"
                    ? <span className="inline-flex items-center gap-1 text-emerald-400"><DollarSign className="h-3.5 w-3.5" />R$ {Number(c.discount_value).toFixed(2)}</span>
                    : <span className="inline-flex items-center gap-1 text-indigo-300"><Percent className="h-3.5 w-3.5" />{Number(c.discount_value).toFixed(0)}%</span>}
                </td>
                <td className="px-4 py-3 text-slate-300">{c.valid_until ? new Date(c.valid_until).toLocaleDateString("pt-BR") : "Sem validade"}</td>
                <td className="px-4 py-3 text-slate-300">{c.times_used}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</td>
                <td className="px-4 py-3 text-slate-300">{c.partner_label ?? "—"}</td>
                <td className="px-4 py-3"><Switch checked={c.active} onCheckedChange={() => toggleActive(c)} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-slate-800 text-slate-300"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDel(c)} className="p-1.5 rounded hover:bg-rose-500/10 text-rose-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar cupom" : "Novo cupom"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Código</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Ex: BEMVINDO10" className="font-mono tracking-wider" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <select value={form.discount_type}
                  onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as any }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="valor">Valor (R$)</option>
                  <option value="percentual">Percentual (%)</option>
                </select>
              </div>
              <div>
                <Label>Valor</Label>
                <NumberInput min={0}
                  value={Number(String(form.discount_value).replace(",", ".")) || 0}
                  onValueChange={(n) => setForm((f) => ({ ...f, discount_value: String(n) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Validade (opcional)</Label>
                <Input type="date" value={form.valid_until}
                  onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))} />
              </div>
              <div>
                <Label>Limite de usos (opcional)</Label>
                <NumberInput allowDecimal={false} min={0}
                  value={Number(form.usage_limit) || 0}
                  onValueChange={(n) => setForm((f) => ({ ...f, usage_limit: n === 0 ? "" : String(n) }))} />
              </div>
            </div>
            <div>
              <Label>Parceiro associado (opcional)</Label>
              <Input value={form.partner_label}
                onChange={(e) => setForm((f) => ({ ...f, partner_label: e.target.value }))}
                placeholder="Ex: Brazilera Acessórios" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              <Label>Cupom ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90">
              {saving ? "Salvando…" : editing ? "Atualizar" : "Criar cupom"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>O cupom <b>{del?.code}</b> será removido. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-rose-600 hover:bg-rose-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}