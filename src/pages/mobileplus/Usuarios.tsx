import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  user_id: string; email: string | null; full_name: string | null;
  created_at: string; stores_count: number; roles: string[];
};

export default function PhoneeUsuarios() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("mobileplus_users");
      setRows((data ?? []) as unknown as Row[]);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    return !t || r.email?.toLowerCase().includes(t) || r.full_name?.toLowerCase().includes(t);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">Usuários da plataforma</h1>
          <p className="text-sm text-slate-400">{rows.length} usuário(s) cadastrado(s).</p>
        </div>
        <input placeholder="Buscar por nome ou e-mail…"
          value={q} onChange={(e) => setQ(e.target.value)}
          className="w-72 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Lojas</th>
              <th className="px-4 py-3">Papéis</th>
              <th className="px-4 py-3">Cadastrado em</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.user_id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                <td className="px-4 py-3">{r.full_name || "—"}</td>
                <td className="px-4 py-3 text-slate-300">{r.email}</td>
                <td className="px-4 py-3">{r.stores_count}</td>
                <td className="px-4 py-3 space-x-1">
                  {(r.roles ?? []).map((p) => (
                    <span key={p} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-200">{p}</span>
                  ))}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhum usuário encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}