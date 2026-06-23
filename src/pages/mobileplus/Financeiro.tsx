import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Overview = {
  mrr_estimate: number; gmv_30d: number; active_subscriptions: number; trialing: number;
};
type Growth = { month_start: string; new_stores: number; new_subscriptions: number; gmv: number };

const brl = (n: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function MobilePlusFinanceiro() {
  const [o, setO] = useState<Overview | null>(null);
  const [g, setG] = useState<Growth[]>([]);

  useEffect(() => {
    (async () => {
      const [ov, gr] = await Promise.all([
        supabase.rpc("mobileplus_overview"),
        supabase.rpc("mobileplus_growth"),
      ]);
      if (ov.data) setO(ov.data as unknown as Overview);
      if (gr.data) setG(gr.data as unknown as Growth[]);
    })();
  }, []);

  const totalGmv12m = g.reduce((s, x) => s + Number(x.gmv ?? 0), 0);
  const arr = (o?.mrr_estimate ?? 0) * 12;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Financeiro Mobile+</h1>
      <p className="text-sm text-slate-400 mb-6">Receita recorrente, GMV processado e séries mensais.</p>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-8">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">MRR estimado</div>
          <div className="mt-2 text-2xl font-semibold">{brl(o?.mrr_estimate ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">ARR estimado</div>
          <div className="mt-2 text-2xl font-semibold">{brl(arr)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">GMV últimos 30d</div>
          <div className="mt-2 text-2xl font-semibold">{brl(o?.gmv_30d ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">GMV últimos 12 meses</div>
          <div className="mt-2 text-2xl font-semibold">{brl(totalGmv12m)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="px-4 py-3 border-b border-slate-800">
          <h2 className="font-semibold">Série mensal — últimos 12 meses</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-4 py-3">Mês</th>
              <th className="px-4 py-3 text-right">Novas lojas</th>
              <th className="px-4 py-3 text-right">Novas assinaturas</th>
              <th className="px-4 py-3 text-right">GMV</th>
            </tr>
          </thead>
          <tbody>
            {g.map((r) => (
              <tr key={r.month_start} className="border-t border-slate-800/60">
                <td className="px-4 py-2.5">
                  {new Date(r.month_start).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                </td>
                <td className="px-4 py-2.5 text-right">{r.new_stores}</td>
                <td className="px-4 py-2.5 text-right">{r.new_subscriptions}</td>
                <td className="px-4 py-2.5 text-right">{brl(Number(r.gmv ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}