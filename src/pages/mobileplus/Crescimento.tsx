import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from "recharts";

type Overview = {
  total_stores: number; active_subscriptions: number; trialing: number;
  new_stores_30d: number; new_stores_prev_30d: number;
  growth_pct: number | null; avg_ticket: number;
};
type StoreRow = {
  store_id: string; store_name: string; owner_email: string | null;
  subscription_status: string | null; total_sales: number; avg_ticket: number;
};
type CouponsRevenue = {
  dias: number; receita_total: number; desconto_total: number; usos: number;
  by_day: { day: string; receita: number; desconto: number; qtd: number }[];
  by_coupon: { code: string; receita: number; desconto: number; qtd: number }[];
};

const brl = (n: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PhoneeCrescimento() {
  const [o, setO] = useState<Overview | null>(null);
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [cup, setCup] = useState<CouponsRevenue | null>(null);
  const [cupDays, setCupDays] = useState<number>(90);

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

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("mobileplus_coupons_revenue", { _days: cupDays });
      if (data) setCup(data as unknown as CouponsRevenue);
    })();
  }, [cupDays]);

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
        <div className="rounded-xl border border-slate-800 bg-slate-900 md:col-span-2">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold">Receita gerada por cupons</h2>
              <p className="text-xs text-slate-500">
                Receita líquida (após desconto) atribuída a vendas com cupom — últimos {cup?.dias ?? cupDays} dias.
              </p>
            </div>
            <div className="flex gap-1">
              {[7, 30, 90, 180].map((d) => (
                <button key={d} onClick={() => setCupDays(d)}
                  className={`px-2.5 py-1 rounded-md text-xs border ${cupDays === d ? "bg-slate-800 border-slate-600 text-white" : "border-slate-800 text-slate-400 hover:text-white"}`}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3 p-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-[11px] uppercase tracking-widest text-slate-500">Receita c/ cupons</div>
              <div className="text-xl font-semibold mt-1">{brl(cup?.receita_total ?? 0)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-[11px] uppercase tracking-widest text-slate-500">Desconto concedido</div>
              <div className="text-xl font-semibold mt-1 text-amber-400">{brl(cup?.desconto_total ?? 0)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-[11px] uppercase tracking-widest text-slate-500">Usos de cupom</div>
              <div className="text-xl font-semibold mt-1">{cup?.usos ?? 0}</div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 px-4 pb-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-xs text-slate-400 mb-2">Receita por período</div>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <AreaChart data={cup?.by_day ?? []}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="day" stroke="#64748b" fontSize={10}
                      tickFormatter={(v) => new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} />
                    <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                      labelFormatter={(v) => new Date(v as string).toLocaleDateString("pt-BR")}
                      formatter={(v: number, n) => [brl(v), n === "receita" ? "Receita" : "Desconto"]}
                    />
                    <Area type="monotone" dataKey="receita" stroke="#10b981" fill="url(#rev)" strokeWidth={2} />
                    <Area type="monotone" dataKey="desconto" stroke="#f59e0b" fill="transparent" strokeWidth={1.5} strokeDasharray="3 3" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-xs text-slate-400 mb-2">Receita por cupom</div>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={(cup?.by_coupon ?? []).slice(0, 8)} layout="vertical" margin={{ left: 12 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis type="number" stroke="#64748b" fontSize={10} tickFormatter={(v) => `R$${v}`} />
                    <YAxis type="category" dataKey="code" stroke="#94a3b8" fontSize={11} width={110} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number, n) => [brl(v), n === "receita" ? "Receita" : n === "desconto" ? "Desconto" : "Usos"]}
                    />
                    <Bar dataKey="receita" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {(cup?.by_coupon ?? []).length === 0 && (
                <div className="text-xs text-slate-500 text-center py-4">Nenhum cupom resgatado no período.</div>
              )}
            </div>
          </div>
        </div>

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