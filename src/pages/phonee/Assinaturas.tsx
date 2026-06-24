import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  store_id: string; store_name: string; owner_email: string | null;
  plan_name: string | null; billing_cycle: string | null;
  subscription_status: string | null; expires_at: string | null;
};

export default function PhoneeAssinaturas() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("phonee_stores");
      setRows((data ?? []) as unknown as Row[]);
    })();
  }, []);

  const groups = {
    ativas: rows.filter((r) => ["active","ativa","vitalicio"].includes(r.subscription_status ?? "")),
    trial:  rows.filter((r) => r.subscription_status === "trialing"),
    expirando: rows.filter((r) => {
      if (!r.expires_at) return false;
      const d = new Date(r.expires_at).getTime() - Date.now();
      return d > 0 && d < 30 * 86400000;
    }),
    sem: rows.filter((r) => !r.subscription_status),
  };

  const Bloco = ({ title, items }: { title: string; items: Row[] }) => (
    <div className="rounded-xl border border-slate-800 bg-slate-900">
      <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-slate-400">{items.length}</span>
      </div>
      <ul className="divide-y divide-slate-800/60">
        {items.slice(0, 30).map((r) => (
          <li key={r.store_id} className="px-4 py-2.5 text-sm flex justify-between gap-3">
            <div>
              <div className="font-medium">{r.store_name}</div>
              <div className="text-xs text-slate-500">{r.owner_email}</div>
            </div>
            <div className="text-right text-xs text-slate-400">
              <div>{r.plan_name ?? "—"} · {r.billing_cycle ?? "—"}</div>
              {r.expires_at && <div>expira {new Date(r.expires_at).toLocaleDateString("pt-BR")}</div>}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-6 text-center text-slate-500 text-sm">Nenhuma</li>}
      </ul>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Assinaturas</h1>
      <p className="text-sm text-slate-400 mb-6">Estado das assinaturas da plataforma.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Bloco title="Ativas" items={groups.ativas} />
        <Bloco title="Em trial" items={groups.trial} />
        <Bloco title="Expirando em 30 dias ou menos" items={groups.expirando} />
        <Bloco title="Sem assinatura" items={groups.sem} />
      </div>
    </div>
  );
}