import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Overview = {
  total_stores: number; active_subscriptions: number; trialing: number;
  total_users: number; mrr_estimate: number; avg_ticket: number;
  new_stores_30d: number; new_stores_prev_30d: number;
  growth_pct: number | null; gmv_30d: number; open_tickets: number;
};

type VisitsStats = {
  total: number;
  unique_sessions: number;
  last_24h: number;
  last_7d: number;
  last_30d: number;
  today: number;
  today_unique: number;
};

const brl = (n: number) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Card({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="text-[11px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export default function PhoneeVisaoGeral() {
  const [d, setD] = useState<Overview | null>(null);
  const [v, setV] = useState<VisitsStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("phonee_overview");
      if (error) setErr(error.message);
      else setD(data as unknown as Overview);
    })();
    (async () => {
      // Admin master: lê page_visits direto (policy já permite)
      const nowIso = new Date().toISOString();
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const since24h = new Date(Date.now() - 24 * 3600000).toISOString();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();
      const [total, last30, last7, last24, today, unique30, todayUniqRows] = await Promise.all([
        (supabase as any).from("page_visits").select("id", { count: "exact", head: true }),
        (supabase as any).from("page_visits").select("id", { count: "exact", head: true }).gte("created_at", since30),
        (supabase as any).from("page_visits").select("id", { count: "exact", head: true }).gte("created_at", since7),
        (supabase as any).from("page_visits").select("id", { count: "exact", head: true }).gte("created_at", since24h),
        (supabase as any).from("page_visits").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
        (supabase as any).from("page_visits").select("session_id").gte("created_at", since30).limit(10000),
        (supabase as any).from("page_visits").select("session_id").gte("created_at", todayIso).limit(10000),
      ]);
      const uniq = new Set<string>();
      ((unique30.data as any[]) ?? []).forEach((r) => { if (r?.session_id) uniq.add(r.session_id); });
      const uniqToday = new Set<string>();
      ((todayUniqRows.data as any[]) ?? []).forEach((r) => { if (r?.session_id) uniqToday.add(r.session_id); });
      setV({
        total: total.count ?? 0,
        last_30d: last30.count ?? 0,
        last_7d: last7.count ?? 0,
        last_24h: last24.count ?? 0,
        today: today.count ?? 0,
        unique_sessions: uniq.size,
        today_unique: uniqToday.size,
      });
    })();
  }, []);

  if (err) return <div className="text-red-400">Erro: {err}</div>;
  if (!d) return <div className="text-slate-400">Carregando…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Visão geral da plataforma</h1>
      <p className="text-sm text-slate-400 mb-6">Indicadores consolidados do Phonee.</p>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <Card
          label="Visitantes hoje"
          value={v?.today ?? "…"}
          hint={v ? `${v.today_unique} sessões únicas` : undefined}
        />
        <Card label="Lojas totais" value={d.total_stores} />
        <Card label="Assinaturas ativas" value={d.active_subscriptions}
              hint={`${d.trialing} em trial`} />
        <Card label="Usuários da plataforma" value={d.total_users} />
        <Card label="MRR estimado" value={brl(d.mrr_estimate)} />
        <Card label="Ticket médio (vendas)" value={brl(d.avg_ticket)} />
        <Card label="GMV últimos 30 dias" value={brl(d.gmv_30d)} />
        <Card label="Novas lojas (30d)" value={d.new_stores_30d}
          hint={d.growth_pct === null ? "sem comparativo"
            : `${d.growth_pct > 0 ? "+" : ""}${d.growth_pct}% vs. 30d anteriores`} />
        <Card label="Tickets de suporte abertos" value={d.open_tickets} />
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-3">Visitantes do site</h2>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card label="Hoje" value={v?.today ?? "…"} hint={v ? `${v.today_unique} únicas` : undefined} />
        <Card label="Últimas 24h" value={v?.last_24h ?? "…"} />
        <Card label="Últimos 7 dias" value={v?.last_7d ?? "…"} />
        <Card label="Últimos 30 dias" value={v?.last_30d ?? "…"} />
        <Card label="Sessões únicas (30d)" value={v?.unique_sessions ?? "…"} />
        <Card label="Total acumulado" value={v?.total ?? "…"} />
      </div>
    </div>
  );
}