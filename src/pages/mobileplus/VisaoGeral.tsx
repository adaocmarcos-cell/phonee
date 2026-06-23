import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Overview = {
  total_stores: number; active_subscriptions: number; trialing: number;
  total_users: number; mrr_estimate: number; avg_ticket: number;
  new_stores_30d: number; new_stores_prev_30d: number;
  growth_pct: number | null; gmv_30d: number; open_tickets: number;
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

export default function MobilePlusVisaoGeral() {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("mobileplus_overview");
      if (error) setErr(error.message);
      else setD(data as unknown as Overview);
    })();
  }, []);

  if (err) return <div className="text-red-400">Erro: {err}</div>;
  if (!d) return <div className="text-slate-400">Carregando…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Visão geral da plataforma</h1>
      <p className="text-sm text-slate-400 mb-6">Indicadores consolidados do Mobile+.</p>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
    </div>
  );
}