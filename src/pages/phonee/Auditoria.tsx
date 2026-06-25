import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldAlert, RefreshCw, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  status: string | null;
  details: any;
  old_value: any;
  new_value: any;
  ip: string | null;
  user_agent: string | null;
  actor_email?: string | null;
  actor_name?: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  user_create_manual: "Criação manual de usuário",
  user_update: "Edição de usuário",
  user_reset_password: "Redefinição de senha",
  user_block: "Bloqueio de usuário",
  user_unblock: "Desbloqueio de usuário",
  user_delete: "Exclusão de usuário",
  partner_create_trial: "Cadastro de parceiro (teste 7d)",
  partner_release_full: "Liberação manual (12 meses)",
  partner_revoke: "Revogação de parceiro",
  partner_regenerate_link: "Geração/rotação de link",
  partner_delete: "Remoção de parceiro do controle",
  delete_store: "Exclusão de loja",
  delete_store_failed: "Tentativa de exclusão (falhou)",
};

const actionTone = (a: string) =>
  /delete|revoke|block/.test(a) ? "text-rose-300 border-rose-500/30 bg-rose-500/10"
  : /release|unblock|create/.test(a) ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
  : /reset|regenerate|update/.test(a) ? "text-sky-300 border-sky-500/30 bg-sky-500/10"
  : "text-slate-300 border-slate-600/40 bg-slate-700/30";

export default function PhoneeAuditoria() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [open, setOpen] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_log")
      .select("id, created_at, user_id, action, entity, entity_id, status, details, old_value, new_value, ip, user_agent")
      .eq("module", "admin_master")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (data ?? []) as Row[];
    // Resolve actor emails
    const ids = Array.from(new Set(list.map(r => r.user_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, email, full_name").in("id", ids);
      const map = new Map((profs ?? []).map(p => [p.id, p]));
      list.forEach(r => {
        const p = r.user_id ? map.get(r.user_id) : null;
        r.actor_email = p?.email ?? null;
        r.actor_name = p?.full_name ?? null;
      });
    }
    setRows(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const actions = useMemo(() => Array.from(new Set(rows.map(r => r.action))), [rows]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(r => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (!term) return true;
      const blob = [
        r.actor_email, r.actor_name, r.action, r.entity, r.entity_id,
        JSON.stringify(r.details ?? {}), JSON.stringify(r.old_value ?? {}), JSON.stringify(r.new_value ?? {}),
      ].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(term);
    });
  }, [rows, q, actionFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-sky-400" /> Auditoria do admin master
          </h1>
          <p className="text-sm text-slate-400">
            Histórico completo de ações em usuários e parceiros: criação, geração/rotação de link,
            liberação, revogação e redefinição de senha.
          </p>
        </div>
        <Button variant="ghost" onClick={load} className="text-slate-300 hover:bg-slate-800">
          <RefreshCw className="h-4 w-4 mr-1.5" /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Buscar por e-mail, ação, ID, detalhes..." className="pl-8" />
        </div>
        <div className="relative">
          <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
                  className="h-10 pl-8 pr-3 rounded-md bg-slate-900 border border-slate-800 text-sm text-slate-200">
            <option value="all">Todas as ações</option>
            {actions.map(a => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Quando</th>
              <th className="px-4 py-3">Executado por</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Alvo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Carregando…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhum registro.</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{r.actor_name || "—"}</div>
                  <div className="text-xs text-slate-400">{r.actor_email || r.user_id?.slice(0,8)}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] border ${actionTone(r.action)}`}>
                    {ACTION_LABEL[r.action] ?? r.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-300">
                  <div className="text-slate-400">{r.entity ?? "—"}</div>
                  <div className="font-mono text-[11px] truncate max-w-[200px]">{r.entity_id ?? "—"}</div>
                  {r.details?.email && <div className="text-slate-400 mt-0.5">{String(r.details.email)}</div>}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className={r.status === "erro" ? "text-rose-300" : "text-emerald-300"}>
                    {r.status ?? "concluido"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setOpen(r)} className="text-xs text-sky-400 hover:underline">
                    Ver JSON
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto p-5"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{ACTION_LABEL[open.action] ?? open.action}</h3>
              <button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-200 text-sm">Fechar</button>
            </div>
            <div className="text-xs text-slate-400 mb-2">
              {new Date(open.created_at).toLocaleString("pt-BR")} · IP {open.ip ?? "—"}
            </div>
            <pre className="text-[11px] bg-slate-950 border border-slate-800 rounded p-3 overflow-auto whitespace-pre-wrap">
{JSON.stringify({ details: open.details, old_value: open.old_value, new_value: open.new_value, user_agent: open.user_agent }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}