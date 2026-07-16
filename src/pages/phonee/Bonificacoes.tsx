import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Gift, Undo2, Search } from "lucide-react";
import { BonusDialog } from "@/components/phonee/BonusDialog";

type Row = {
  id: string;
  created_at: string;
  target_email: string;
  bonus_type: string;
  days_granted: number;
  period_end: string;
  previous_ends_at: string | null;
  reason: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  granted_by: string | null;
  store_id: string | null;
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const TYPE_LABEL: Record<string, string> = {
  extensao_trial: "Extensão de teste",
  mes_gratis: "Mês grátis",
  periodo_personalizado: "Personalizado",
};

export default function Bonificacoes() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [openGrant, setOpenGrant] = useState(false);
  const [stores, setStores] = useState<Record<string, string>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from("access_bonuses" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setRows((data ?? []) as any);
    const ids = Array.from(new Set(((data ?? []) as any[]).map((r) => r.store_id).filter(Boolean)));
    if (ids.length) {
      const { data: sd } = await supabase.from("stores").select("id,name").in("id", ids as string[]);
      setStores(Object.fromEntries((sd ?? []).map((s) => [s.id, s.name])));
    } else {
      setStores({});
    }
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async (r: Row) => {
    const reason = window.prompt("Motivo da revogação:");
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("revoke_access_bonus" as any, {
      p_bonus_id: r.id,
      p_reason: reason.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Bônus revogado.");
    load();
  };

  const filtered = rows.filter((r) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (
      r.target_email.toLowerCase().includes(t) ||
      (stores[r.store_id ?? ""] ?? "").toLowerCase().includes(t) ||
      r.reason.toLowerCase().includes(t)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bonificações de acesso</h1>
          <p className="text-sm text-slate-400">
            Concessões e revogações de acesso gratuito. Toda ação é registrada na auditoria.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              placeholder="Buscar por e-mail, loja ou motivo…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-72 pl-8 pr-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm"
            />
          </div>
          <Button onClick={() => setOpenGrant(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Gift className="h-4 w-4 mr-1.5" /> Nova bonificação
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Loja</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Dias</th>
              <th className="px-4 py-3">Validade nova</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/40 align-top">
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmt(r.created_at)}</td>
                <td className="px-4 py-3">{r.target_email}</td>
                <td className="px-4 py-3 text-slate-300">{stores[r.store_id ?? ""] ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="text-[10px] uppercase tracking-widest bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
                    {TYPE_LABEL[r.bonus_type] ?? r.bonus_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.days_granted}</td>
                <td className="px-4 py-3">{fmtDate(r.period_end)}</td>
                <td className="px-4 py-3 text-slate-300 max-w-[240px] truncate" title={r.reason}>
                  {r.reason}
                </td>
                <td className="px-4 py-3">
                  {r.revoked_at ? (
                    <span className="text-[10px] uppercase tracking-widest bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded px-1.5 py-0.5">
                      Revogada
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-widest bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded px-1.5 py-0.5">
                      Ativa
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!r.revoked_at && (
                    <button
                      onClick={() => revoke(r)}
                      className="inline-flex items-center gap-1 text-xs text-rose-400 hover:underline"
                    >
                      <Undo2 className="h-3 w-3" /> Revogar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  Nenhuma bonificação registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BonusDialog
        open={openGrant}
        onOpenChange={setOpenGrant}
        email=""
        onGranted={load}
      />
    </div>
  );
}