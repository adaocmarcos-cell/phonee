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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">Lojas da plataforma</h1>
          <p className="text-sm text-slate-400">{rows.length} loja(s) registrada(s).</p>
        </div>
        <input placeholder="Buscar por loja, dono ou e-mail…"
          value={q} onChange={(e) => setQ(e.target.value)}
          className="w-72 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
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