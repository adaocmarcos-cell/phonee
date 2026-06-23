import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  store_id: string; store_name: string; owner_email: string | null; owner_name: string | null;
  plan_name: string | null; billing_cycle: string | null; subscription_status: string | null;
  expires_at: string | null; created_at: string;
  total_sales: number; sales_count: number; avg_ticket: number;
};

const brl = (n: number) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PhoneeLojas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("mobileplus_stores");
      setRows((data ?? []) as unknown as Row[]);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    return !t || r.store_name?.toLowerCase().includes(t)
      || r.owner_email?.toLowerCase().includes(t)
      || r.owner_name?.toLowerCase().includes(t);
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold leading-tight">Lojas da plataforma</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            {rows.length} loja(s) registrada(s).
          </p>
        </div>
        <input
          placeholder="Buscar por loja, dono ou e-mail…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-72 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:border-[#00abfb]"
        />
      </div>

      {/* Mobile: stacked cards with vertical labels */}
      <div className="md:hidden space-y-3">
        {filtered.map((r) => (
          <div
            key={r.store_id}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{r.store_name}</div>
                <div className="text-xs text-slate-400 truncate">
                  {r.owner_name ?? "—"}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {r.owner_email}
                </div>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-200 capitalize">
                {r.subscription_status ?? "sem assinatura"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Plano</span>
                <span className="truncate">{r.plan_name ?? "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Ciclo</span>
                <span className="capitalize truncate">{r.billing_cycle ?? "—"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Vendas</span>
                <span>{r.sales_count}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Ticket médio</span>
                <span className="truncate">{brl(Number(r.avg_ticket))}</span>
              </div>
              <div className="col-span-2 flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Faturamento</span>
                <span className="font-semibold text-[#00abfb]">{brl(Number(r.total_sales))}</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-8 text-center text-slate-500 text-sm">
            Nenhuma loja encontrada.
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Loja</th>
              <th className="px-4 py-3">Dono</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Ciclo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Vendas</th>
              <th className="px-4 py-3 text-right">Faturamento</th>
              <th className="px-4 py-3 text-right">Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.store_id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                <td className="px-4 py-3 font-medium">{r.store_name}</td>
                <td className="px-4 py-3 text-slate-300">
                  <div>{r.owner_name ?? "—"}</div>
                  <div className="text-xs text-slate-500">{r.owner_email}</div>
                </td>
                <td className="px-4 py-3">{r.plan_name ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{r.billing_cycle ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-200">
                    {r.subscription_status ?? "sem assinatura"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{r.sales_count}</td>
                <td className="px-4 py-3 text-right">{brl(Number(r.total_sales))}</td>
                <td className="px-4 py-3 text-right">{brl(Number(r.avg_ticket))}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Nenhuma loja encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}