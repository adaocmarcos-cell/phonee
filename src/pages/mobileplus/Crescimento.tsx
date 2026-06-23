import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Overview = {
  total_stores: number; active_subscriptions: number; trialing: number;
  new_stores_30d: number; new_stores_prev_30d: number;
  growth_pct: number | null; avg_ticket: number;
};
type StoreRow = {
  store_id: string; store_name: string; owner_email: string | null;
  subscription_status: string | null; total_sales: number; avg_ticket: number;
};

const brl = (n: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PhoneeCrescimento() {
  const [o, setO] = useState<Overview | null>(null);
  const [rows, setRows] = useState<StoreRow[]>([]);

  useEffect(() => {
    (async () => {
      const [ov, st] = await Promise.all([
        supabase.rpc("mobileplus_overview"),
        supabase.rpc("mobileplus_stores"),
      ]);
      if (ov.data) setO(ov.data as unknown as Overview);
      if (st.data) setRows(st.data as unknown as StoreRow[]);
    })();
  }, []);

  const topTicket = [...rows].sort((a, b) => Number(b.avg_ticket) - Number(a.avg_ticket)).slice(0, 10);
  const topGmv    = [...rows].sort((a, b) => Number(b.total_sales) - Number(a.total_sales)).slice(0, 10);
  const semAss    = rows.filter((r) => !r.subscription_status || r.subscription_status === "trialing");

  const conv = o && o.total_stores
    ? ((o.active_subscriptions / o.total_stores) * 100).toFixed(1)
    : "0";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Análise de crescimento</h1>
      <p className="text-sm text-slate-400 mb-6">
        Use para identificar oportunidades de upgrade e aumentar a base de assinaturas.
      </p>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">Conversão para assinante</div>
          <div className="mt-2 text-2xl font-semibold">{conv}%</div>
          <div className="text-xs text-slate-400 mt-1">
            {o?.active_subscriptions ?? 0} de {o?.total_stores ?? 0} lojas
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">Crescimento de lojas (30d)</div>
          <div className="mt-2 text-2xl font-semibold">
            {o?.new_stores_30d ?? 0}
            {o?.growth_pct !== null && o?.growth_pct !== undefined && (
              <span className={`ml-2 text-sm ${(o.growth_pct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {(o.growth_pct ?? 0) > 0 ? "+" : ""}{o.growth_pct}%
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1">vs. {o?.new_stores_prev_30d ?? 0} no período anterior</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">Ticket médio da plataforma</div>
          <div className="mt-2 text-2xl font-semibold">{brl(o?.avg_ticket ?? 0)}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="font-semibold">Top 10 — maior ticket médio</h2>
            <p className="text-xs text-slate-500">Lojas-modelo para vender plano superior.</p>
          </div>
          <ul className="divide-y divide-slate-800/60 text-sm">
            {topTicket.map((r) => (
              <li key={r.store_id} className="px-4 py-2.5 flex justify-between">
                <div>
                  <div className="font-medium">{r.store_name}</div>
                  <div className="text-xs text-slate-500">{r.owner_email}</div>
                </div>
                <div>{brl(Number(r.avg_ticket))}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="font-semibold">Top 10 — maior faturamento</h2>
            <p className="text-xs text-slate-500">Mais sensíveis a recursos premium.</p>
          </div>
          <ul className="divide-y divide-slate-800/60 text-sm">
            {topGmv.map((r) => (
              <li key={r.store_id} className="px-4 py-2.5 flex justify-between">
                <div>
                  <div className="font-medium">{r.store_name}</div>
                  <div className="text-xs text-slate-500">{r.owner_email}</div>
                </div>
                <div>{brl(Number(r.total_sales))}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 md:col-span-2">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="font-semibold">Lojas para converter ({semAss.length})</h2>
            <p className="text-xs text-slate-500">Sem assinatura paga ativa — alvo de campanha de conversão.</p>
          </div>
          <ul className="divide-y divide-slate-800/60 text-sm">
            {semAss.slice(0, 30).map((r) => (
              <li key={r.store_id} className="px-4 py-2.5 flex justify-between">
                <div>
                  <div className="font-medium">{r.store_name}</div>
                  <div className="text-xs text-slate-500">{r.owner_email}</div>
                </div>
                <div className="text-xs text-slate-400">
                  {r.subscription_status === "trialing" ? "em trial" : "sem assinatura"} · faturamento {brl(Number(r.total_sales))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}