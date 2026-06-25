import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Handshake, Copy, RefreshCw, Trash2, ShieldCheck, MessageCircle, Calendar, Ban, Plus, AlertTriangle, Send, Link2, Play,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Trial = {
  id: string; user_id: string | null; email: string; full_name: string | null;
  whatsapp: string | null; notes: string | null; instagram: string | null;
  invited_at: string; activated_at: string | null;
  trial_days: number; trial_ends_at: string | null;
  full_access_granted_at: string | null; full_access_months: number;
  full_access_ends_at: string | null;
  status: "em_teste" | "teste_expirado" | "liberado" | "expirado" | "revogado";
  invite_link: string | null; days_left: number | null;
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const waLink = (n?: string | null) =>
  n ? `https://wa.me/${onlyDigits(n).startsWith("55") ? onlyDigits(n) : "55" + onlyDigits(n)}` : "";
const waSendLink = (n: string, text: string) =>
  `https://wa.me/${onlyDigits(n).startsWith("55") ? onlyDigits(n) : "55" + onlyDigits(n)}?text=${encodeURIComponent(text)}`;
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR") : "—";

const DEFAULT_WA_TEMPLATE = (p: { name: string; link: string; days: number }) =>
`Olá ${p.name || "parceiro(a)"}! 👋

Liberei seu acesso ao *Phonee* para avaliação por ${p.days} dias.
Acesse pelo link abaixo e crie sua senha:

${p.link}

Qualquer dúvida me chame por aqui. Boa avaliação! 🚀`;

const statusStyles: Record<Trial["status"], string> = {
  em_teste: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  teste_expirado: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  liberado: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  expirado: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  revogado: "bg-slate-700/40 text-slate-300 border-slate-500/30",
};
const statusLabel: Record<Trial["status"], string> = {
  em_teste: "Em teste (7d)",
  teste_expirado: "Teste expirado",
  liberado: "12 meses liberado",
  expirado: "Expirado",
  revogado: "Revogado",
};

export default function PhoneeParceiros() {
  const [rows, setRows] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({
    email: "", full_name: "", whatsapp: "", trial_days: 7, full_access_months: 12, notes: "",
  });
  const [saving, setSaving] = useState(false);

  const [releaseFor, setReleaseFor] = useState<Trial | null>(null);
  const [releaseForm, setReleaseForm] = useState({ months: 12, start_at: "" });

  const [waFor, setWaFor] = useState<Trial | null>(null);
  const [waMsg, setWaMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("phonee_partner_trials_list");
    if (error) toast.error(error.message);
    const list = ((data ?? []) as Trial[]).map((r) => {
      // refine status against now()
      const now = Date.now();
      let st = r.status;
      if (st === "em_teste" && r.trial_ends_at && new Date(r.trial_ends_at).getTime() < now) st = "teste_expirado";
      if (st === "liberado" && r.full_access_ends_at && new Date(r.full_access_ends_at).getTime() < now) st = "expirado";
      return { ...r, status: st };
    });
    setRows(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado!");
  };

  const submitNew = async () => {
    if (!form.email.trim()) return toast.error("Informe o e-mail.");
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("phonee-admin-user", {
      body: { action: "partner_create_trial", ...form },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      return toast.error(((data as any)?.error) || error?.message || "Falha ao criar parceiro.");
    }
    toast.success("Parceiro cadastrado. Link de acesso gerado.");
    setOpenNew(false);
    setForm({ email: "", full_name: "", whatsapp: "", trial_days: 7, full_access_months: 12, notes: "" });
    load();
  };

  const regen = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("phonee-admin-user", {
      body: { action: "partner_regenerate_link", trial_id: id },
    });
    if (error || (data as any)?.error) return toast.error("Falha ao gerar novo link.");
    toast.success("Novo link gerado.");
    load();
  };

  const release = async () => {
    if (!releaseFor) return;
    const { data, error } = await supabase.functions.invoke("phonee-admin-user", {
      body: {
        action: "partner_release_full",
        trial_id: releaseFor.id,
        months: releaseForm.months,
        start_at: releaseForm.start_at || undefined,
      },
    });
    if (error || (data as any)?.error) return toast.error("Falha ao liberar acesso.");
    toast.success(`Acesso liberado por ${releaseForm.months} meses.`);
    setReleaseFor(null);
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revogar o acesso deste parceiro?")) return;
    const { error } = await supabase.functions.invoke("phonee-admin-user", {
      body: { action: "partner_revoke", trial_id: id },
    });
    if (error) return toast.error("Falha ao revogar.");
    toast.success("Parceiro revogado.");
    load();
  };

  const removeRow = async (id: string) => {
    if (!confirm("Remover este parceiro do controle? (a conta de usuário será mantida)")) return;
    const { error } = await supabase.functions.invoke("phonee-admin-user", {
      body: { action: "partner_delete", trial_id: id, delete_user: false },
    });
    if (error) return toast.error("Falha ao remover.");
    load();
  };

  const reactivate = async (id: string) => {
    const { error } = await supabase.functions.invoke("phonee-admin-user", {
      body: { action: "partner_reactivate", trial_id: id, trial_days: 7 },
    });
    if (error) return toast.error("Falha ao reativar.");
    toast.success("Parceiro reativado por mais 7 dias.");
    load();
  };

  const publicSignupUrl =
    (typeof window !== "undefined" ? window.location.origin : "https://phonee.com.br") + "/parceiros";

  const openWa = (r: Trial) => {
    if (!r.whatsapp) { toast.error("Parceiro sem WhatsApp cadastrado."); return; }
    if (!r.invite_link) { toast.error("Sem link de acesso. Gere um novo link primeiro."); return; }
    setWaFor(r);
    setWaMsg(DEFAULT_WA_TEMPLATE({
      name: r.full_name || r.email.split("@")[0],
      link: r.invite_link,
      days: r.trial_days || 7,
    }));
  };
  const sendWa = () => {
    if (!waFor?.whatsapp) return;
    window.open(waSendLink(waFor.whatsapp, waMsg), "_blank");
    setWaFor(null);
  };

  // Alertas automáticos
  const now = Date.now();
  const D7 = 7 * 86400_000;
  const trialEndingSoon = rows.filter(r =>
    r.status === "em_teste" && r.trial_ends_at &&
    new Date(r.trial_ends_at).getTime() - now > 0 &&
    new Date(r.trial_ends_at).getTime() - now <= D7
  );
  const awaitingRelease = rows.filter(r =>
    (r.status === "teste_expirado") ||
    (r.status === "em_teste" && r.trial_ends_at && new Date(r.trial_ends_at).getTime() <= now && !r.full_access_granted_at)
  );
  const autoBlocked = rows.filter(r => r.status === "teste_expirado");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="h-6 w-6 text-sky-400" /> Parceiros · Avaliação
          </h1>
          <p className="text-sm text-slate-400">
            Envie acesso de 7 dias a parceiros. Após esse período os acessos são bloqueados automaticamente.
            Libere manualmente os 12 meses contados a partir do fim do teste.
          </p>
        </div>
        <Button onClick={() => setOpenNew(true)} className="bg-sky-600 hover:bg-sky-700">
          <Plus className="h-4 w-4 mr-1.5" /> Novo parceiro
        </Button>
      </div>

      <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sky-300 text-sm font-semibold">
          <Link2 className="h-4 w-4" /> Link público de cadastro de parceiros
        </div>
        <code className="px-2 py-1 rounded bg-slate-900/70 border border-slate-700 text-xs text-slate-200 truncate max-w-[420px]">
          {publicSignupUrl}
        </code>
        <Button size="sm" variant="outline" onClick={() => copy(publicSignupUrl)} className="h-8">
          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
        </Button>
        <a href={publicSignupUrl} target="_blank" rel="noreferrer"
           className="text-xs text-slate-400 hover:text-slate-200 underline">abrir página</a>
        <span className="text-[11px] text-slate-400 ml-auto">
          Cadastros enviados por este link são aprovados automaticamente (7 dias). Use os botões da tabela para ativar/inativar.
        </span>
      </div>

      {(trialEndingSoon.length > 0 || awaitingRelease.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          {trialEndingSoon.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4" />
                {trialEndingSoon.length} parceiro(s) a menos de 7 dias do fim do teste
              </div>
              <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
                {trialEndingSoon.slice(0, 5).map(p => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="truncate">{p.full_name || p.email}</span>
                    <span className="opacity-80 shrink-0">
                      vence {fmtDate(p.trial_ends_at)} · {Math.ceil((p.days_left ?? 0))}d
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {awaitingRelease.length > 0 && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
              <div className="flex items-center gap-2 text-sky-300 font-semibold text-sm">
                <ShieldCheck className="h-4 w-4" />
                {awaitingRelease.length} parceiro(s) aguardando liberação manual (12 meses)
              </div>
              <ul className="mt-2 space-y-1 text-xs text-sky-100/90">
                {awaitingRelease.slice(0, 5).map(p => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="truncate">{p.full_name || p.email}</span>
                    <button
                      onClick={() => {
                        const start = p.trial_ends_at ?? new Date().toISOString();
                        setReleaseForm({ months: p.full_access_months || 12, start_at: start.slice(0,10) });
                        setReleaseFor(p);
                      }}
                      className="shrink-0 text-emerald-300 hover:underline"
                    >Liberar 12m</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {autoBlocked.length > 0 && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
          <div className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
            <AlertTriangle className="h-4 w-4" />
            {autoBlocked.length} parceiro(s) bloqueado(s) automaticamente após 7 dias de teste
          </div>
          <p className="mt-1 text-xs text-rose-100/80">
            O acesso foi revogado e registrado na auditoria. Libere manualmente os 12 meses para reativar o parceiro.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Parceiro</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Período concedido</th>
              <th className="px-4 py-3">Restante</th>
              <th className="px-4 py-3">Link de acesso</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Carregando…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                Nenhum parceiro cadastrado ainda.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/40 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{r.full_name || "—"}</div>
                  <div className="text-xs text-slate-400">{r.email}</div>
                </td>
                <td className="px-4 py-3">
                  {r.whatsapp ? (
                    <a href={waLink(r.whatsapp)} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300">
                      <MessageCircle className="h-3.5 w-3.5" /> {r.whatsapp}
                    </a>
                  ) : <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] border ${statusStyles[r.status]}`}>
                    {statusLabel[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                    <span>{fmtDate(r.activated_at)} → {fmtDate(r.trial_ends_at)}</span>
                  </div>
                  {r.full_access_granted_at && (
                    <div className="flex items-center gap-1.5 mt-1 text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{fmtDate(r.full_access_granted_at)} → {fmtDate(r.full_access_ends_at)} ({r.full_access_months}m)</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.days_left == null
                    ? <span className="text-slate-500">—</span>
                    : r.days_left > 0
                      ? <span className="text-emerald-300">{Math.ceil(r.days_left)} dias</span>
                      : <span className="text-rose-300">expirado</span>}
                </td>
                <td className="px-4 py-3">
                  {r.invite_link ? (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => copy(r.invite_link!)} title="Copiar link"
                              className="p-1 rounded hover:bg-slate-800 text-slate-300">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <span className="truncate max-w-[160px] text-xs text-slate-400">{r.invite_link}</span>
                    </div>
                  ) : <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openWa(r)} title="Reenviar link via WhatsApp"
                            disabled={!r.whatsapp || !r.invite_link}
                            className="p-1.5 rounded-md hover:bg-emerald-500/10 text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Send className="h-4 w-4" />
                    </button>
                    <button onClick={() => regen(r.id)} title="Gerar novo link"
                            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300">
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        const start = r.trial_ends_at ?? new Date().toISOString();
                        setReleaseForm({ months: r.full_access_months || 12, start_at: start.slice(0,10) });
                        setReleaseFor(r);
                      }}
                      title="Liberar 12 meses"
                      className="p-1.5 rounded-md hover:bg-emerald-500/10 text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                    </button>
                    <button onClick={() => revoke(r.id)} title="Revogar acesso"
                            className="p-1.5 rounded-md hover:bg-amber-500/10 text-amber-400">
                      <Ban className="h-4 w-4" />
                    </button>
                    <button onClick={() => reactivate(r.id)} title="Reativar (novo período de 7 dias)"
                            className="p-1.5 rounded-md hover:bg-sky-500/10 text-sky-400">
                      <Play className="h-4 w-4" />
                    </button>
                    <button onClick={() => removeRow(r.id)} title="Remover do controle"
                            className="p-1.5 rounded-md hover:bg-rose-500/10 text-rose-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New partner dialog */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar novo parceiro avaliador</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.full_name} onChange={(e) => setForm(f => ({...f, full_name: e.target.value}))}/>
            </div>
            <div>
              <Label>E-mail *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm(f => ({...f, email: e.target.value}))}/>
            </div>
            <div>
              <Label>WhatsApp (com DDD)</Label>
              <Input placeholder="(11) 9 9999-9999" value={form.whatsapp}
                     onChange={(e) => setForm(f => ({...f, whatsapp: e.target.value}))}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Dias de teste</Label>
                <Input type="number" min={1} value={form.trial_days}
                       onChange={(e) => setForm(f => ({...f, trial_days: Number(e.target.value) || 7}))}/>
              </div>
              <div>
                <Label>Meses (liberação manual)</Label>
                <Input type="number" min={1} value={form.full_access_months}
                       onChange={(e) => setForm(f => ({...f, full_access_months: Number(e.target.value) || 12}))}/>
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({...f, notes: e.target.value}))}/>
            </div>
            <p className="text-xs text-slate-400">
              Será criado um usuário com link de acesso único para enviar pelo WhatsApp.
              Após {form.trial_days} dias, o acesso é bloqueado automaticamente.
              Você poderá liberar manualmente os {form.full_access_months} meses depois disso.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenNew(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={submitNew} disabled={saving} className="bg-sky-600 hover:bg-sky-700">
              {saving ? "Cadastrando…" : "Cadastrar e gerar link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release dialog */}
      <Dialog open={!!releaseFor} onOpenChange={(o) => !o && setReleaseFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar acesso completo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Conceda manualmente o período de uso ao parceiro <b>{releaseFor?.full_name || releaseFor?.email}</b>.
              Por padrão, 12 meses a partir do término do teste de 7 dias.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="date" value={releaseForm.start_at}
                       onChange={(e) => setReleaseForm(f => ({...f, start_at: e.target.value}))}/>
              </div>
              <div>
                <Label>Meses</Label>
                <Input type="number" min={1} value={releaseForm.months}
                       onChange={(e) => setReleaseForm(f => ({...f, months: Number(e.target.value) || 12}))}/>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReleaseFor(null)}>Cancelar</Button>
            <Button onClick={release} className="bg-emerald-600 hover:bg-emerald-700">
              Liberar período
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp resend dialog */}
      <Dialog open={!!waFor} onOpenChange={(o) => !o && setWaFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-400" />
              Reenviar link via WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-slate-400">
              Enviando para <b className="text-slate-200">{waFor?.full_name || waFor?.email}</b>
              {" · "}<span className="text-emerald-300">{waFor?.whatsapp}</span>
            </div>
            <div>
              <Label>Mensagem (personalize se quiser)</Label>
              <Textarea rows={9} value={waMsg} onChange={(e) => setWaMsg(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button onClick={() => setWaMsg(DEFAULT_WA_TEMPLATE({
                name: waFor?.full_name || waFor?.email.split("@")[0] || "",
                link: waFor?.invite_link || "",
                days: waFor?.trial_days || 7,
              }))} className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700">
                Restaurar modelo padrão
              </button>
              <button onClick={() => setWaMsg(m => m + "\n\nQualquer dúvida estou à disposição.")}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700">
                + assinatura cordial
              </button>
              <button onClick={() => setWaMsg(`Oi! Renovei seu link de acesso ao Phonee.\n\n${waFor?.invite_link}\n\nValidade do teste: ${waFor?.trial_days || 7} dias.`)}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700">
                Versão curta
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWaFor(null)}>Cancelar</Button>
            <Button onClick={sendWa} className="bg-emerald-600 hover:bg-emerald-700">
              <Send className="h-4 w-4 mr-1.5" /> Abrir WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}