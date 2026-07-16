import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, Users, Handshake, CheckCircle2, Clock, XCircle, DollarSign,
  ChevronDown, ChevronRight, Search, Pencil, ExternalLink, CreditCard, Package, ShoppingCart, HardDrive, Gift,
} from "lucide-react";
import { BonusDialog } from "@/components/phonee/BonusDialog";

type StoreRow = {
  store_id: string; store_name: string;
  owner_id: string | null; owner_email: string | null; owner_name: string | null;
  plan_name: string | null; billing_cycle: string | null; subscription_status: string | null;
  expires_at: string | null; created_at: string;
  total_sales: number; sales_count: number; avg_ticket: number;
};
type UserStore = { id: string; name: string; is_owner: boolean };
type UserRow = {
  user_id: string; email: string | null; full_name: string | null; created_at: string;
  stores_count: number; roles: string[]; stores: UserStore[];
  plan_name: string | null; subscription_status: string | null; is_admin_master: boolean;
};
type Metric = { products: number; storage_bytes: number; sales_30: number; sales_90: number; sales_180: number; sales_365: number; revenue: number };
type Trial = {
  id: string; user_id: string | null; email: string; full_name: string | null;
  whatsapp: string | null; store_name: string | null;
  status: "em_teste" | "teste_expirado" | "liberado" | "expirado" | "revogado";
  trial_ends_at: string | null; full_access_ends_at: string | null; days_left: number | null;
};
type Overview = {
  total_stores: number; active_subscriptions: number; trialing: number;
  total_users: number; mrr_estimate: number; gmv_30d: number;
};

type TabKey = "todos" | "ativos" | "teste" | "sem_plano";

const brl = (n: number) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBytes = (b: number) => {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 2 : 1)} ${u[i]}`;
};

function isActive(s?: string | null) {
  return s === "active" || s === "ativa" || s === "ativo";
}
function isTrial(s?: string | null) {
  return s === "trialing" || s === "trial" || s === "em_teste";
}

export default function PhoneeContas() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metric>>({});
  const [trials, setTrials] = useState<Trial[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("todos");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bonusTarget, setBonusTarget] = useState<{ email: string; store?: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, u, m, t, o] = await Promise.all([
        supabase.rpc("phonee_stores"),
        supabase.rpc("phonee_users"),
        supabase.rpc("phonee_user_metrics"),
        supabase.rpc("phonee_partner_trials_list"),
        supabase.rpc("phonee_overview"),
      ]);
      setStores(((s.data ?? []) as unknown) as StoreRow[]);
      setUsers(((u.data ?? []) as unknown as UserRow[]).map((r) => ({
        ...r, stores: Array.isArray(r.stores) ? r.stores : [],
      })));
      setMetrics((m.data as Record<string, Metric>) ?? {});
      setTrials(((t.data ?? []) as unknown) as Trial[]);
      setOverview((o.data as unknown) as Overview);
      setLoading(false);
    })();
  }, []);

  // Group users by store
  const usersByStore = useMemo(() => {
    const map = new Map<string, UserRow[]>();
    users.forEach((u) => {
      u.stores.forEach((s) => {
        const arr = map.get(s.id) ?? [];
        arr.push(u);
        map.set(s.id, arr);
      });
    });
    return map;
  }, [users]);

  const usersWithoutStore = useMemo(
    () => users.filter((u) => !u.stores?.length),
    [users],
  );

  const trialsByEmail = useMemo(() => {
    const map = new Map<string, Trial>();
    trials.forEach((t) => { if (t.email) map.set(t.email.toLowerCase(), t); });
    return map;
  }, [trials]);

  // Filter stores by tab + search
  const filteredStores = useMemo(() => {
    const term = q.trim().toLowerCase();
    return stores.filter((s) => {
      if (tab === "ativos" && !isActive(s.subscription_status)) return false;
      if (tab === "teste" && !isTrial(s.subscription_status) && !trialsByEmail.has((s.owner_email ?? "").toLowerCase())) return false;
      if (tab === "sem_plano" && (isActive(s.subscription_status) || isTrial(s.subscription_status))) return false;
      if (!term) return true;
      return (
        s.store_name?.toLowerCase().includes(term) ||
        s.owner_email?.toLowerCase().includes(term) ||
        s.owner_name?.toLowerCase().includes(term) ||
        (s.plan_name ?? "").toLowerCase().includes(term) ||
        (usersByStore.get(s.store_id) ?? []).some((u) =>
          u.email?.toLowerCase().includes(term) || u.full_name?.toLowerCase().includes(term),
        )
      );
    });
  }, [stores, tab, q, trialsByEmail, usersByStore]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  const counts = useMemo(() => ({
    todos: stores.length,
    ativos: stores.filter((s) => isActive(s.subscription_status)).length,
    teste: stores.filter((s) => isTrial(s.subscription_status) || trialsByEmail.has((s.owner_email ?? "").toLowerCase())).length,
    sem_plano: stores.filter((s) => !isActive(s.subscription_status) && !isTrial(s.subscription_status)).length,
  }), [stores, trials, trialsByEmail]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Contas da plataforma</h1>
        <p className="text-sm text-slate-400">
          Visão unificada — cada loja aparece com seus usuários dentro. Use os filtros para separar assinantes, testes e contas sem plano.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi icon={Building2} label="Lojas" value={overview?.total_stores ?? stores.length} />
        <Kpi icon={CheckCircle2} label="Assinantes ativos" value={overview?.active_subscriptions ?? counts.ativos} tone="emerald" />
        <Kpi icon={Clock} label="Em teste" value={overview?.trialing ?? counts.teste} tone="sky" />
        <Kpi icon={Users} label="Usuários" value={overview?.total_users ?? users.length} />
        <Kpi icon={DollarSign} label="MRR estimado" value={brl(overview?.mrr_estimate ?? 0)} tone="emerald" />
        <Kpi icon={DollarSign} label="GMV 30d" value={brl(overview?.gmv_30d ?? 0)} />
      </div>

      {/* Tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap gap-1.5">
          <TabBtn active={tab === "todos"} onClick={() => setTab("todos")} label="Todas" count={counts.todos} />
          <TabBtn active={tab === "ativos"} onClick={() => setTab("ativos")} label="Assinantes ativos" count={counts.ativos} tone="emerald" />
          <TabBtn active={tab === "teste"} onClick={() => setTab("teste")} label="Em teste" count={counts.teste} tone="sky" />
          <TabBtn active={tab === "sem_plano"} onClick={() => setTab("sem_plano")} label="Sem plano" count={counts.sem_plano} tone="amber" />
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            placeholder="Buscar loja, dono, usuário, plano…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-[#00abfb]"
          />
        </div>
      </div>

      {loading && <div className="text-slate-400 py-8 text-center">Carregando contas…</div>}

      {/* Stores list */}
      {!loading && (
        <div className="space-y-2">
          {filteredStores.map((s) => {
            const members = usersByStore.get(s.store_id) ?? [];
            const trial = trialsByEmail.get((s.owner_email ?? "").toLowerCase());
            const owner = members.find((m) => m.user_id === s.owner_id);
            const ownerMetric = owner ? metrics[owner.user_id] : undefined;
            const isOpen = expanded.has(s.store_id);
            return (
              <div key={s.store_id} className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <button
                  onClick={() => toggle(s.store_id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition"
                >
                  <div className="mt-0.5 text-slate-400">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <Building2 className="h-5 w-5 text-[#00abfb] mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-100 truncate">{s.store_name}</span>
                      <StatusPill status={s.subscription_status} trial={trial?.status} />
                      <PlanPill
                        plan={s.plan_name}
                        cycle={s.billing_cycle}
                        status={s.subscription_status}
                        expiresAt={s.expires_at}
                      />
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {s.owner_name ?? "—"} <span className="text-slate-600">·</span> {s.owner_email ?? "—"}
                    </div>
                  </div>
                  <div className="hidden md:grid grid-cols-4 gap-4 text-right shrink-0">
                    <Stat icon={Users} label="Usuários" value={members.length || (s.owner_id ? 1 : 0)} />
                    <Stat icon={Package} label="Produtos" value={ownerMetric?.products ?? 0} />
                    <Stat icon={ShoppingCart} label="Vendas 30d" value={ownerMetric?.sales_30 ?? s.sales_count} />
                    <Stat icon={DollarSign} label="Receita" value={brl(ownerMetric?.revenue ?? s.total_sales)} strong />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-800 bg-slate-950/40 px-4 py-3 space-y-3">
                    {/* Metrics row on mobile */}
                    <div className="grid grid-cols-2 md:hidden gap-3">
                      <Stat icon={Users} label="Usuários" value={members.length || (s.owner_id ? 1 : 0)} />
                      <Stat icon={Package} label="Produtos" value={ownerMetric?.products ?? 0} />
                      <Stat icon={ShoppingCart} label="Vendas 30d" value={ownerMetric?.sales_30 ?? s.sales_count} />
                      <Stat icon={DollarSign} label="Receita" value={brl(ownerMetric?.revenue ?? s.total_sales)} strong />
                    </div>

                    {/* Trial banner */}
                    {trial && (
                      <div className="flex items-center gap-2 text-xs rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-200 px-3 py-2">
                        <Handshake className="h-3.5 w-3.5" />
                        Parceiro / teste — status <b>{trial.status}</b>
                        {trial.days_left != null && <> · {trial.days_left} dia(s) restantes</>}
                        {trial.trial_ends_at && <> · termina em {new Date(trial.trial_ends_at).toLocaleDateString("pt-BR")}</>}
                      </div>
                    )}

                    {/* Users list */}
                    <div className="rounded-lg border border-slate-800">
                      <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800 flex items-center justify-between">
                        <span>Usuários da loja ({members.length})</span>
                        <Link to="/phonee/usuarios" className="text-[10px] text-[#00abfb] hover:underline inline-flex items-center gap-1">
                          Gerir usuários <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                      {members.length === 0 && (
                        <div className="px-3 py-3 text-xs text-slate-500">Nenhum usuário vinculado.</div>
                      )}
                      {members.map((u) => {
                        const um = metrics[u.user_id];
                        return (
                          <div key={u.user_id} className="px-3 py-2 flex flex-wrap items-center gap-3 border-t border-slate-800/60 first:border-t-0 text-sm">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-slate-100 truncate">{u.full_name ?? "—"}</span>
                                {u.user_id === s.owner_id && (
                                  <span className="text-[9px] uppercase tracking-widest text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
                                    Dono
                                  </span>
                                )}
                                {u.is_admin_master && (
                                  <span className="text-[9px] uppercase tracking-widest text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded px-1.5 py-0.5">
                                    Admin Master
                                  </span>
                                )}
                                {(u.roles ?? []).map((r) => (
                                  <span key={r} className="text-[9px] uppercase tracking-widest text-slate-300 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
                                    {r}
                                  </span>
                                ))}
                              </div>
                              <div className="text-xs text-slate-500 truncate">{u.email}</div>
                            </div>
                            <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
                              <span className="inline-flex items-center gap-1"><HardDrive className="h-3 w-3" />{fmtBytes(um?.storage_bytes ?? 0)}</span>
                              <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />{um?.products ?? 0}</span>
                              <span className="inline-flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{um?.sales_30 ?? 0}</span>
                              <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" />{brl(um?.revenue ?? 0)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Quick links */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link to="/phonee/lojas" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800">
                        <Pencil className="h-3 w-3" /> Editar loja
                      </Link>
                      <Link to="/phonee/assinaturas" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800">
                        <CreditCard className="h-3 w-3" /> Assinatura
                      </Link>
                      {s.owner_email && (
                        <button
                          onClick={() => setBonusTarget({ email: s.owner_email!, store: s.store_name })}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
                        >
                          <Gift className="h-3 w-3" /> Bonificar acesso
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredStores.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-10 text-center text-slate-500">
              Nenhuma conta encontrada para este filtro.
            </div>
          )}

          {/* Users without store */}
          {tab === "todos" && usersWithoutStore.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
                <Users className="h-3 w-3" /> Usuários sem loja vinculada ({usersWithoutStore.length})
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {usersWithoutStore.map((u) => (
                  <div key={u.user_id} className="text-sm rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div className="text-slate-100 truncate">{u.full_name ?? "—"}</div>
                    <div className="text-xs text-slate-500 truncate">{u.email}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <BonusDialog
        open={!!bonusTarget}
        onOpenChange={(o) => !o && setBonusTarget(null)}
        email={bonusTarget?.email ?? ""}
        storeLabel={bonusTarget?.store}
      />
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, tone,
}: { icon: any; label: string; value: React.ReactNode; tone?: "emerald" | "sky" }) {
  const color =
    tone === "emerald" ? "text-emerald-300"
    : tone === "sky" ? "text-sky-300"
    : "text-slate-100";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function TabBtn({
  active, onClick, label, count, tone,
}: { active: boolean; onClick: () => void; label: string; count: number; tone?: "emerald" | "sky" | "amber" }) {
  const activeStyle = active
    ? "bg-[#00abfb] text-slate-900 border-[#00abfb]"
    : "border-slate-700 text-slate-300 hover:bg-slate-800";
  const badgeColor = active ? "bg-slate-900/20 text-slate-900"
    : tone === "emerald" ? "bg-emerald-500/15 text-emerald-300"
    : tone === "sky" ? "bg-sky-500/15 text-sky-300"
    : tone === "amber" ? "bg-amber-500/15 text-amber-300"
    : "bg-slate-800 text-slate-400";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${activeStyle}`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[10px] font-mono ${badgeColor}`}>{count}</span>
    </button>
  );
}

function StatusPill({ status, trial }: { status: string | null; trial?: Trial["status"] }) {
  const st = (status ?? "").toLowerCase();
  const label =
    trial === "em_teste" ? "Em teste"
    : trial === "liberado" ? "Parceiro liberado"
    : trial === "teste_expirado" ? "Teste expirado"
    : isActive(st) ? "Ativa"
    : isTrial(st) ? "Trial"
    : st === "canceled" || st === "cancelada" ? "Cancelada"
    : status || "Sem plano";
  const cls =
    trial === "em_teste" ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
    : trial === "liberado" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : isActive(st) ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : isTrial(st) ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
    : "bg-slate-800 text-slate-300 border-slate-700";
  return <span className={`text-[10px] uppercase tracking-widest rounded-full border px-2 py-0.5 ${cls}`}>{label}</span>;
}

function Stat({
  icon: Icon, label, value, strong,
}: { icon: any; label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1 justify-end">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`text-sm ${strong ? "font-semibold text-[#00abfb]" : "text-slate-200"}`}>{value}</div>
    </div>
  );
}

function PlanPill({
  plan, cycle, status, expiresAt,
}: { plan: string | null; cycle: string | null; status: string | null; expiresAt: string | null }) {
  if (!plan && !cycle) return null;
  const c = (cycle ?? "").toLowerCase();
  const st = (status ?? "").toLowerCase();
  const cycleLabel =
    c === "trial" ? "Teste"
    : c === "annual" || c === "anual" ? "Anual"
    : c === "lifetime" || c === "vitalicio" ? "Vitalício"
    : c === "monthly" || c === "mensal" ? "Mensal"
    : cycle || "";
  const isTrialPaid = c === "trial" || st === "trial" || st === "trialing";
  const tone = isTrialPaid
    ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
    : c === "lifetime" || c === "vitalicio"
    ? "border-purple-500/30 bg-purple-500/10 text-purple-200"
    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  const expires = expiresAt ? new Date(expiresAt) : null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest rounded-md border px-2 py-0.5 ${tone}`}>
      <span className="font-semibold">{plan ?? "Plano"}</span>
      {cycleLabel && <span className="opacity-80">· {cycleLabel}</span>}
      {expires && c !== "lifetime" && c !== "vitalicio" && (
        <span className="opacity-70 normal-case tracking-normal">
          · até {expires.toLocaleDateString("pt-BR")}
        </span>
      )}
    </span>
  );
}