import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle, TrendingUp, Users, DollarSign, Ticket } from "lucide-react";
import { toast } from "sonner";

type Overview = {
  total: number; pendentes: number; convertidas: number; canceladas: number;
  taxa_conversao: number; receita_indicacoes: number; desconto_cupons: number; bonus_pagos: number;
};
type Row = {
  id: string; referrer_user_id: string; referral_code: string; referred_email: string | null;
  status: "pendente" | "convertida" | "cancelada"; bonus_cents: number;
  created_at: string; converted_at: string | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PhoneeIndicacoes() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  const load = async () => {
    const [{ data: o, error: e1 }, { data: r, error: e2 }] = await Promise.all([
      supabase.rpc("phonee_referrals_overview"),
      supabase.from("referrals").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    if (e1) toast.error(e1.message);
    if (e2) toast.error(e2.message);
    setOv((o as any) ?? null);
    setRows(((r as any) ?? []) as Row[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      r.referral_code.toLowerCase().includes(t) ||
      (r.referred_email ?? "").toLowerCase().includes(t)
    );
  }, [rows, q]);

  const updateStatus = async (id: string, status: "convertida" | "cancelada") => {
    if (!confirm(`Marcar como ${status}?`)) return;
    const patch: any = { status };
    if (status === "convertida") patch.converted_at = new Date().toISOString();
    const { error } = await supabase.from("referrals").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Atualizado.");
    load();
  };

  const exportCsv = () => {
    const rowsCsv = [
      ["Data", "Código", "Email indicado", "Status", "Bônus"],
      ...filtered.map((r) => [
        new Date(r.created_at).toLocaleDateString("pt-BR"),
        r.referral_code, r.referred_email ?? "", r.status,
        (r.bonus_cents / 100).toFixed(2),
      ]),
    ];
    const csv = rowsCsv.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `phonee-indicacoes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Indicações & Bonificações</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card label="Total" value={ov?.total ?? 0} icon={<Users className="h-4 w-4" />} />
        <Card label="Convertidas" value={ov?.convertidas ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} accent="emerald" />
        <Card label="Taxa de conversão" value={`${ov?.taxa_conversao ?? 0}%`} icon={<TrendingUp className="h-4 w-4" />} accent="indigo" />
        <Card label="Bônus pagos" value={brl(ov?.bonus_pagos ?? 0)} icon={<DollarSign className="h-4 w-4" />} accent="amber" />
        <Card label="Receita por indicações" value={brl(ov?.receita_indicacoes ?? 0)} icon={<DollarSign className="h-4 w-4" />} accent="emerald" />
        <Card label="Desconto por cupons" value={brl(ov?.desconto_cupons ?? 0)} icon={<Ticket className="h-4 w-4" />} accent="indigo" />
        <Card label="Pendentes" value={ov?.pendentes ?? 0} icon={<Clock className="h-4 w-4" />} accent="amber" />
        <Card label="Canceladas" value={ov?.canceladas ?? 0} icon={<XCircle className="h-4 w-4" />} accent="rose" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input placeholder="Buscar código ou e-mail…" value={q} onChange={(e) => setQ(e.target.value)}
          className="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-slate-100 w-72" />
        <button onClick={exportCsv} className="text-xs px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200">Exportar CSV</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">E-mail indicado</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Bônus</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhuma indicação.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                <td className="px-4 py-3 text-slate-300">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-3 font-mono text-slate-100">{r.referral_code}</td>
                <td className="px-4 py-3 text-slate-300">{r.referred_email ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.status === "convertida" && <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Convertida</Badge>}
                  {r.status === "pendente" && <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">Pendente</Badge>}
                  {r.status === "cancelada" && <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30">Cancelada</Badge>}
                </td>
                <td className="px-4 py-3 text-right text-slate-100">{brl(r.bonus_cents / 100)}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  {r.status !== "convertida" && (
                    <button onClick={() => updateStatus(r.id, "convertida")} className="text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">Converter</button>
                  )}
                  {r.status !== "cancelada" && (
                    <button onClick={() => updateStatus(r.id, "cancelada")} className="text-xs px-2 py-1 rounded bg-rose-500/15 text-rose-300 hover:bg-rose-500/25">Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, icon, accent }: { label: string; value: any; icon: React.ReactNode; accent?: "emerald" | "amber" | "indigo" | "rose" }) {
  const color = accent === "emerald" ? "text-emerald-300"
    : accent === "amber" ? "text-amber-300"
    : accent === "indigo" ? "text-indigo-300"
    : accent === "rose" ? "text-rose-300"
    : "text-slate-100";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-500">{icon}{label}</div>
      <div className={`mt-1 text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}