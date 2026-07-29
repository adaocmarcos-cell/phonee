import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { num } from "@/lib/format";
import { toast } from "sonner";

export type ReconcileRow = {
  product_id: string;
  name: string;
  sku: string | null;
  item_kind: string | null;
  stock_current: number;
  ledger_balance: number;
  difference: number;
  last_movement_at: string | null;
  last_movement_type: string | null;
};

/**
 * Reconciliação de estoque sob demanda.
 * Usa a MESMA função do banco (reconcile_stock) que alimenta o alerta diário
 * do cron — a regra existe em um único lugar.
 */
export default function ReconcileTable() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReconcileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const run = async () => {
    if (!store) return;
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("reconcile_stock", { _store_id: store.id });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as ReconcileRow[]);
    setCheckedAt(new Date());
  };

  useEffect(() => { run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [store?.id]);

  const total = rows.reduce((a, r) => a + Math.abs(Number(r.difference || 0)), 0);

  return (
    <div className="space-y-3">
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {rows.length === 0
            ? <ShieldCheck className="h-5 w-5 text-success" />
            : <AlertTriangle className="h-5 w-5 text-warning" />}
          <div>
            <div className="text-sm font-semibold">
              {loading
                ? "Verificando..."
                : rows.length === 0
                  ? "Estoque reconciliado — nenhuma divergência"
                  : `${num(rows.length)} produto(s) divergentes · ${num(total)} un. de diferença`}
            </div>
            <p className="text-xs text-muted-foreground">
              Compara a quantidade atual com o último saldo do livro-razão.
              {checkedAt ? ` Última verificação: ${checkedAt.toLocaleString("pt-BR")}.` : ""}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Verificar agora
        </Button>
      </Card>

      {rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">Produto</th>
                <th className="text-left p-3">Tipo</th>
                <th className="text-right p-3">Estoque atual</th>
                <th className="text-right p-3">Saldo do livro</th>
                <th className="text-right p-3">Diferença</th>
                <th className="text-left p-3">Último movimento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.product_id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/painel/estoque/${r.product_id}`)}
                >
                  <td className="p-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{r.sku || "—"}</div>
                  </td>
                  <td className="p-3"><Badge variant="outline">{r.item_kind || "—"}</Badge></td>
                  <td className="p-3 text-right">{num(r.stock_current)}</td>
                  <td className="p-3 text-right">{num(r.ledger_balance)}</td>
                  <td className={`p-3 text-right font-semibold ${Number(r.difference) > 0 ? "text-warning" : "text-destructive"}`}>
                    {Number(r.difference) > 0 ? "+" : ""}{num(r.difference)}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.last_movement_at ? new Date(r.last_movement_at).toLocaleString("pt-BR") : "sem histórico"}
                    {r.last_movement_type ? ` · ${r.last_movement_type}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
