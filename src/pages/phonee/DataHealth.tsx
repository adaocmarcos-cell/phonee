import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, RefreshCw, Smartphone } from "lucide-react";

type Row = {
  store_id: string; store_name: string;
  aparelhos_total: number; pendentes_total: number;
  pct_completo: number; dias_restantes: number;
  prazo_em_dias: number; prazo_personalizado: boolean;
  modal_visto: boolean;
};

export default function PhoneeDataHealth() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalDays, setGlobalDays] = useState("30");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("phonee_data_health_overview");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setDeadline = async (storeId: string | null, days: number) => {
    setSaving(storeId ?? "global");
    const { error } = await (supabase as any).rpc("phonee_set_data_health_deadline", { _store_id: storeId, _days: days });
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success(storeId ? "Prazo da loja atualizado." : "Prazo global atualizado.");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Smartphone className="h-5 w-5" /> Regularização de IMEI</h1>
          <p className="text-sm text-muted-foreground">Lojas com mais pendências primeiro — é aqui que o contato humano vale.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </div>

      <Card className="p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground">Prazo global (dias)</label>
          <Input value={globalDays} onChange={(e) => setGlobalDays(e.target.value.replace(/\D/g, ""))} className="w-28 mt-1" inputMode="numeric" />
        </div>
        <Button size="sm" disabled={saving === "global"} onClick={() => setDeadline(null, Number(globalDays) || 30)}>
          {saving === "global" && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Aplicar às lojas sem prazo personalizado
        </Button>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Loja</th>
              <th className="text-right px-4 py-3">Aparelhos</th>
              <th className="text-right px-4 py-3">Pendentes</th>
              <th className="text-left px-4 py-3 min-w-[160px]">% regularizado</th>
              <th className="text-right px-4 py-3">Dias restantes</th>
              <th className="text-left px-4 py-3">Viu o aviso</th>
              <th className="text-left px-4 py-3 min-w-[190px]">Prazo (dias)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Carregando…</td></tr>
            ) : rows.map((r) => (
              <tr key={r.store_id} className="hover:bg-surface-elevated/40">
                <td className="px-4 py-3 font-medium">{r.store_name}</td>
                <td className="px-4 py-3 text-right">{r.aparelhos_total}</td>
                <td className="px-4 py-3 text-right">
                  {r.pendentes_total > 0
                    ? <Badge variant="outline" className="border-danger/40 text-danger">{r.pendentes_total}</Badge>
                    : <span className="text-success">0</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Progress value={Number(r.pct_completo)} className="h-1.5 w-24" />
                    <span className="text-xs text-muted-foreground">{Number(r.pct_completo)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{r.dias_restantes}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.modal_visto ? "Sim" : "Não"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={editing[r.store_id] ?? String(r.prazo_em_dias)}
                      onChange={(e) => setEditing((s) => ({ ...s, [r.store_id]: e.target.value.replace(/\D/g, "") }))}
                      className="w-20 h-8"
                      inputMode="numeric"
                    />
                    <Button size="sm" variant="outline" disabled={saving === r.store_id}
                      onClick={() => setDeadline(r.store_id, Number(editing[r.store_id] ?? r.prazo_em_dias) || 30)}>
                      Salvar
                    </Button>
                    {r.prazo_personalizado && <Badge variant="secondary" className="text-[10px]">custom</Badge>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
