import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, Plus, Check, X, RefreshCw } from "lucide-react";

type Req = {
  id: string; subscription_id: string; requested_by: string; reviewed_by: string | null;
  changes: Record<string, any>; reason: string; review_notes: string | null;
  status: string; requested_at: string; decided_at: string | null; applied_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  applied: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  failed:   "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export default function AssinaturaSolicitacoes() {
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("subscription_change_requests")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Req[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: string) => {
    const notes = prompt("Observações (opcional):") ?? "";
    const { error } = await supabase.rpc("approve_subscription_change", { _request_id: id, _review_notes: notes });
    if (error) return toast.error(error.message);
    toast.success("Mudança aplicada com sucesso");
    load();
  };
  const reject = async (id: string) => {
    const notes = prompt("Motivo da recusa (obrigatório, mín. 3 caracteres):") ?? "";
    if (notes.trim().length < 3) return toast.error("Motivo obrigatório.");
    const { error } = await supabase.rpc("reject_subscription_change", { _request_id: id, _review_notes: notes });
    if (error) return toast.error(error.message);
    toast.success("Solicitação recusada");
    load();
  };

  const pending = useMemo(() => rows.filter(r => r.status === "pending"), [rows]);
  const decided = useMemo(() => rows.filter(r => r.status !== "pending"), [rows]);

  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400" /> Aprovações de assinatura
          </h1>
          <p className="text-sm text-slate-400">
            Mudanças de plano, status, validade ou valor exigem solicitação, motivo e aprovação por outro admin master.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} className="text-slate-300 hover:bg-slate-800">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Atualizar
          </Button>
          <Button onClick={() => setShowNew(true)} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90">
            <Plus className="h-4 w-4 mr-1.5" /> Nova solicitação
          </Button>
        </div>
      </div>

      <Section title={`Pendentes (${pending.length})`} rows={pending} onApprove={approve} onReject={reject} loading={loading} />
      <div className="h-6" />
      <Section title={`Histórico (${decided.length})`} rows={decided} loading={loading} />

      {showNew && <NewRequestDialog onClose={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function Section({ title, rows, onApprove, onReject, loading }:{
  title: string; rows: Req[];
  onApprove?: (id: string) => void; onReject?: (id: string) => void; loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
      <div className="px-4 py-3 border-b border-slate-800 font-semibold">{title}</div>
      <table className="w-full text-sm min-w-[900px]">
        <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
          <tr>
            <th className="px-4 py-2.5">Solicitado</th>
            <th className="px-4 py-2.5">Assinatura</th>
            <th className="px-4 py-2.5">Mudanças</th>
            <th className="px-4 py-2.5">Motivo</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Carregando…</td></tr>}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhuma solicitação.</td></tr>
          )}
          {rows.map(r => (
            <tr key={r.id} className="border-b border-slate-800/60">
              <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                {new Date(r.requested_at).toLocaleString("pt-BR")}
              </td>
              <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{r.subscription_id.slice(0, 8)}…</td>
              <td className="px-4 py-3">
                <pre className="text-[11px] bg-slate-950 border border-slate-800 rounded p-2 max-w-[280px] overflow-auto">
{JSON.stringify(r.changes, null, 2)}
                </pre>
              </td>
              <td className="px-4 py-3 text-xs text-slate-300 max-w-[260px]">
                {r.reason}
                {r.review_notes && <div className="mt-1 text-slate-500 italic">↳ {r.review_notes}</div>}
              </td>
              <td className="px-4 py-3">
                <Badge className={`border ${STATUS_TONE[r.status] ?? "bg-slate-700/40 text-slate-300 border-slate-600/40"}`}>
                  {r.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {r.status === "pending" && onApprove && onReject ? (
                  <div className="inline-flex gap-1.5">
                    <Button size="sm" onClick={() => onApprove(r.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white">
                      <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onReject(r.id)}
                      className="text-rose-300 hover:bg-rose-500/10">
                      <X className="h-3.5 w-3.5 mr-1" /> Recusar
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">
                    {r.decided_at ? new Date(r.decided_at).toLocaleString("pt-BR") : "—"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewRequestDialog({ onClose }: { onClose: () => void }) {
  const [subId, setSubId] = useState("");
  const [status, setStatus] = useState("");
  const [planId, setPlanId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [amountCents, setAmountCents] = useState("");
  const [billingCycle, setBillingCycle] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!subId) return toast.error("Informe o ID da assinatura.");
    if (reason.trim().length < 5) return toast.error("Motivo precisa ter pelo menos 5 caracteres.");
    const changes: Record<string, any> = {};
    if (status) changes.status = status;
    if (planId) changes.plan_id = planId;
    if (expiresAt) changes.expires_at = new Date(expiresAt).toISOString();
    if (amountCents) changes.amount_cents = Number(amountCents);
    if (billingCycle) changes.billing_cycle = billingCycle;
    if (Object.keys(changes).length === 0) return toast.error("Nenhuma mudança informada.");
    setSaving(true);
    const { error } = await supabase.rpc("request_subscription_change", {
      _subscription_id: subId, _changes: changes, _reason: reason.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Solicitação registrada. Outro admin master precisa aprovar.");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-5 space-y-3"
           onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Nova solicitação</h3>
        <p className="text-xs text-slate-400">
          A solicitação fica pendente. Outro admin master precisa revisar e aprovar — quem solicita não pode aprovar.
        </p>
        <div className="space-y-2">
          <label className="text-xs text-slate-400">ID da assinatura</label>
          <Input value={subId} onChange={(e) => setSubId(e.target.value)} placeholder="uuid da assinatura" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400">Novo status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                      className="w-full h-10 rounded-md bg-slate-950 border border-slate-800 px-2 text-sm">
                <option value="">— manter —</option>
                <option value="pending">pending</option>
                <option value="active">active</option>
                <option value="overdue">overdue</option>
                <option value="refunded">refunded</option>
                <option value="canceled">canceled</option>
                <option value="failed">failed</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Ciclo</label>
              <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)}
                      className="w-full h-10 rounded-md bg-slate-950 border border-slate-800 px-2 text-sm">
                <option value="">— manter —</option>
                <option value="trial">trial</option>
                <option value="annual">annual</option>
                <option value="lifetime">lifetime</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400">Nova validade</label>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400">Valor (centavos)</label>
              <Input type="number" value={amountCents} onChange={(e) => setAmountCents(e.target.value)} placeholder="ex: 19900" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400">Novo plano (id)</label>
            <Input value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="opcional — uuid do plano" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Motivo (obrigatório)</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva a razão da mudança (cliente, ticket, autorização…)" rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90">
            {saving ? "Enviando…" : "Enviar solicitação"}
          </Button>
        </div>
      </div>
    </div>
  );
}