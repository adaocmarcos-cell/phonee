import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldAlert, RefreshCw, ScrollText, Filter } from "lucide-react";

type LogRow = {
  id: string;
  created_at: string;
  store_id: string | null;
  store_name: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  target_id: string | null;
  target_email: string | null;
  target_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  module: string | null;
  screen: string | null;
  status: string | null;
  old_value: any;
  new_value: any;
  details: any;
};

type ActionOpt = { action: string; qtd: number };
type Store = { store_id: string; store_name: string };
type AuditIssue = {
  user_id: string; email: string | null; full_name: string | null;
  created_at: string; has_store: boolean; has_role: boolean;
  is_admin_master: boolean; issue: string;
};

const ISSUE_LABEL: Record<string, { label: string; tone: string }> = {
  ok: { label: "OK", tone: "bg-emerald-500/20 text-emerald-200" },
  ok_admin_master: { label: "Admin Master", tone: "bg-violet-500/20 text-violet-200" },
  sem_loja_e_sem_cargo: { label: "Sem loja e sem cargo", tone: "bg-rose-500/20 text-rose-200" },
  sem_vinculo_de_loja: { label: "Sem vínculo de loja", tone: "bg-amber-500/20 text-amber-200" },
  sem_cargo_atribuido: { label: "Sem cargo", tone: "bg-amber-500/20 text-amber-200" },
};

const actionTone = (a: string) =>
  /delete|revoke|block|fail|denied/.test(a) ? "bg-rose-500/15 text-rose-200 border-rose-500/30"
  : /permission|bulk_bind|release|unblock|create|insert/.test(a) ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
  : /reset|regenerate|update|change/.test(a) ? "bg-sky-500/15 text-sky-200 border-sky-500/30"
  : "bg-slate-700/40 text-slate-200 border-slate-600/40";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function PhoneeAuditLog() {
  const [tab, setTab] = useState("timeline");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [actions, setActions] = useState<ActionOpt[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [offset, setOffset] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);
  const LIMIT = 100;

  const [f, setF] = useState({
    store_id: "", actor_email: "", action: "", from: "", to: "",
  });

  const loadStores = async () => {
    const { data, error } = await (supabase.rpc as any)("phonee_stores");
    if (error) return;
    setStores(((data ?? []) as any[])
      .map((s) => ({ store_id: s.store_id, store_name: s.store_name }))
      .sort((a, b) => a.store_name.localeCompare(b.store_name)));
  };

  const loadActions = async () => {
    const { data, error } = await (supabase.rpc as any)("phonee_audit_log_actions");
    if (error) return;
    setActions((data ?? []) as ActionOpt[]);
  };

  const loadIssues = async () => {
    setLoadingIssues(true);
    const { data, error } = await (supabase.rpc as any)("phonee_permission_audit");
    if (error) toast.error(error.message);
    else setIssues((data ?? []) as AuditIssue[]);
    setLoadingIssues(false);
  };

  const resolveActorId = async (): Promise<string | null> => {
    const q = f.actor_email.trim().toLowerCase();
    if (!q) return null;
    const { data } = await supabase
      .from("profiles").select("id").ilike("email", `%${q}%`).limit(1);
    return (data?.[0] as any)?.id ?? "__none__";
  };

  const load = async (append = false) => {
    setLoading(true);
    const actorId = await resolveActorId();
    if (actorId === "__none__") {
      setRows([]); setReachedEnd(true); setLoading(false); return;
    }
    const nextOffset = append ? offset : 0;
    const { data, error } = await (supabase.rpc as any)("phonee_audit_log_search", {
      _store_id: f.store_id || null,
      _actor_id: actorId,
      _action: f.action || null,
      _from: f.from ? new Date(f.from).toISOString() : null,
      _to: f.to ? new Date(f.to).toISOString() : null,
      _limit: LIMIT,
      _offset: nextOffset,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const arr = (data ?? []) as LogRow[];
    setRows((prev) => append ? [...prev, ...arr] : arr);
    setOffset(nextOffset + arr.length);
    setReachedEnd(arr.length < LIMIT);
  };

  useEffect(() => { loadStores(); loadActions(); loadIssues(); load(); }, []);

  const applyFilters = () => { setOffset(0); setReachedEnd(false); load(false); };
  const clearFilters = () => {
    setF({ store_id: "", actor_email: "", action: "", from: "", to: "" });
    setTimeout(() => { setOffset(0); setReachedEnd(false); load(false); }, 0);
  };

  const problems = useMemo(
    () => issues.filter((a) => a.issue !== "ok" && a.issue !== "ok_admin_master"),
    [issues],
  );

  return (
    <div className="p-4 md:p-6 space-y-6 text-slate-100">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScrollText className="h-5 w-5" /> Audit Log
          </h1>
          <p className="text-sm text-slate-400">
            Timeline unificada de eventos do sistema com filtros por loja, autor e motivo.
          </p>
        </div>
        <Button variant="outline" onClick={() => { load(false); loadIssues(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-900 border border-slate-800">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="issues">
            Vínculos inconsistentes
            {problems.length > 0 && (
              <Badge className="ml-2 bg-amber-500/20 text-amber-200 border-0">{problems.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4 mt-4">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-300">
              <Filter className="h-4 w-4" />
              <span className="font-medium">Filtros</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Loja</Label>
                <Select value={f.store_id} onValueChange={(v) => setF((s) => ({ ...s, store_id: v === "__all__" ? "" : v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    <SelectItem value="__all__">Todas as lojas</SelectItem>
                    {stores.map((s) => (
                      <SelectItem key={s.store_id} value={s.store_id}>{s.store_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Autor (e-mail)</Label>
                <Input
                  placeholder="parte do e-mail"
                  value={f.actor_email}
                  onChange={(e) => setF((s) => ({ ...s, actor_email: e.target.value }))}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Motivo / ação</Label>
                <Select value={f.action} onValueChange={(v) => setF((s) => ({ ...s, action: v === "__all__" ? "" : v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    <SelectItem value="__all__">Todos os motivos</SelectItem>
                    {actions.map((a) => (
                      <SelectItem key={a.action} value={a.action}>{a.action} ({a.qtd})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">De</Label>
                <Input type="datetime-local" value={f.from}
                  onChange={(e) => setF((s) => ({ ...s, from: e.target.value }))}
                  className="bg-slate-800 border-slate-700" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Até</Label>
                <Input type="datetime-local" value={f.to}
                  onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))}
                  className="bg-slate-800 border-slate-700" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={clearFilters}>Limpar</Button>
              <Button onClick={applyFilters}>Aplicar filtros</Button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="max-h-[65vh] overflow-auto divide-y divide-slate-800">
              {loading && rows.length === 0 && (
                <div className="p-6 text-center text-slate-500">Carregando…</div>
              )}
              {!loading && rows.length === 0 && (
                <div className="p-6 text-center text-slate-500">Nenhum evento encontrado com os filtros atuais.</div>
              )}
              {rows.map((r) => (
                <article key={r.id} className="p-4 hover:bg-slate-800/40">
                  <header className="flex items-center gap-2 flex-wrap">
                    <Badge className={`border ${actionTone(r.action)}`}>{r.action}</Badge>
                    {r.module && <span className="text-xs text-slate-500">{r.module}{r.screen ? ` · ${r.screen}` : ""}</span>}
                    <span className="ml-auto text-xs text-slate-400">{fmt(r.created_at)}</span>
                  </header>
                  <div className="mt-2 grid md:grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-slate-500">Loja</div>
                      <div className="text-slate-200">{r.store_name ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Autor</div>
                      <div className="text-slate-200">{r.actor_name ?? "—"} <span className="text-slate-500">{r.actor_email ?? ""}</span></div>
                    </div>
                    <div>
                      <div className="text-slate-500">Alvo</div>
                      <div className="text-slate-200">
                        {r.target_name ?? r.entity ?? "—"} <span className="text-slate-500">{r.target_email ?? ""}</span>
                      </div>
                    </div>
                  </div>
                  {(r.old_value || r.new_value || r.details) && (
                    <details className="mt-2 group">
                      <summary className="cursor-pointer text-xs text-sky-300 hover:text-sky-200">Ver detalhes</summary>
                      <div className="grid md:grid-cols-2 gap-3 mt-2 text-xs">
                        {r.old_value && (
                          <pre className="p-2 rounded bg-slate-950 border border-slate-800 overflow-auto text-rose-200">
{JSON.stringify(r.old_value, null, 2)}
                          </pre>
                        )}
                        {r.new_value && (
                          <pre className="p-2 rounded bg-slate-950 border border-slate-800 overflow-auto text-emerald-200">
{JSON.stringify(r.new_value, null, 2)}
                          </pre>
                        )}
                        {r.details && !r.old_value && !r.new_value && (
                          <pre className="p-2 rounded bg-slate-950 border border-slate-800 overflow-auto md:col-span-2 text-slate-300">
{JSON.stringify(r.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </details>
                  )}
                </article>
              ))}
            </div>
            <div className="p-3 border-t border-slate-800 flex justify-center">
              <Button variant="outline" onClick={() => load(true)} disabled={loading || reachedEnd}>
                {reachedEnd ? "Fim da lista" : loading ? "Carregando…" : "Carregar mais"}
              </Button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="issues" className="mt-4">
          <section className="rounded-lg border border-slate-800 bg-slate-900">
            <header className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              <h2 className="font-semibold">Vínculos inconsistentes agora</h2>
              <Badge className="bg-amber-500/20 text-amber-200 border-0">{problems.length}</Badge>
            </header>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-400 bg-slate-900 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">Usuário</th>
                    <th className="text-left px-4 py-2">Cadastro</th>
                    <th className="text-left px-4 py-2">Loja</th>
                    <th className="text-left px-4 py-2">Cargo</th>
                    <th className="text-left px-4 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingIssues && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Carregando…</td></tr>
                  )}
                  {!loadingIssues && problems.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Sem inconsistências agora. 🎉</td></tr>
                  )}
                  {problems.map((r) => {
                    const tag = ISSUE_LABEL[r.issue] ?? { label: r.issue, tone: "bg-slate-700 text-slate-100" };
                    return (
                      <tr key={r.user_id} className="border-t border-slate-800">
                        <td className="px-4 py-2">
                          <div className="font-medium">{r.full_name ?? "—"}</div>
                          <div className="text-xs text-slate-400">{r.email}</div>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-400">{fmt(r.created_at)}</td>
                        <td className="px-4 py-2">{r.has_store ? "Sim" : <span className="text-rose-300">Não</span>}</td>
                        <td className="px-4 py-2">{r.has_role ? "Sim" : <span className="text-rose-300">Não</span>}</td>
                        <td className="px-4 py-2"><Badge className={`${tag.tone} border-0`}>{tag.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
