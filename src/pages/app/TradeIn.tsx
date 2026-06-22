import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Smartphone } from "lucide-react";
import { brl } from "@/lib/format";

type TI = {
  id: string; customer_name: string; model: string; brand: string | null;
  imei: string | null; condition: string; status: string;
  entry_value: number; intended_sale_value: number; created_at: string;
};

const statusBadge: Record<string, string> = {
  em_avaliacao: "bg-warning/15 text-warning border-warning/30",
  aprovado: "bg-primary/15 text-primary border-primary/30",
  em_estoque: "bg-success/15 text-success border-success/30",
  vendido: "bg-muted text-muted-foreground border-border",
  recusado: "bg-danger/15 text-danger border-danger/30",
};
const statusLabel: Record<string, string> = {
  em_avaliacao: "Em avaliação", aprovado: "Aprovado", em_estoque: "Em estoque",
  vendido: "Vendido", recusado: "Recusado",
};

export default function TradeIn() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("trade_ins")
        .select("id, customer_name, model, brand, imei, condition, status, entry_value, intended_sale_value, created_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });
      setRows((data ?? []) as TI[]);
      setLoading(false);
    })();
  }, [store]);

  return (
    <div>
      <PageHeader
        title="Compra & Troca"
        description="Fichas de entrada de aparelhos usados com checklist, fotos e status."
        actions={
          <Button onClick={() => navigate("/app/trade-in/novo")} className="bg-gradient-primary shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> Nova ficha
          </Button>
        }
      />

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Aparelho</th>
                <th className="text-left px-4 py-3 font-medium">IMEI</th>
                <th className="text-left px-4 py-3 font-medium">Condição</th>
                <th className="text-right px-4 py-3 font-medium">Entrada</th>
                <th className="text-right px-4 py-3 font-medium">Venda</th>
                <th className="text-right px-4 py-3 font-medium">Margem</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center">
                  <Smartphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhum aparelho registrado ainda.</p>
                  <Button onClick={() => navigate("/app/trade-in/novo")} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" /> Cadastrar primeira ficha</Button>
                </td></tr>
              ) : rows.map((r) => {
                const margin = r.intended_sale_value > 0 ? ((r.intended_sale_value - r.entry_value) / r.intended_sale_value) * 100 : 0;
                return (
                  <tr key={r.id} className="hover:bg-surface-elevated/40 cursor-pointer" onClick={() => navigate(`/app/trade-in/${r.id}`)}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.customer_name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.model}</div>
                      {r.brand && <div className="text-[11px] text-muted-foreground">{r.brand}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.imei || "—"}</td>
                    <td className="px-4 py-3 capitalize text-xs">{r.condition.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-right metric">{brl(Number(r.entry_value))}</td>
                    <td className="px-4 py-3 text-right metric">{brl(Number(r.intended_sale_value))}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`metric text-xs ${margin >= 25 ? "text-success" : margin >= 10 ? "text-warning" : "text-danger"}`}>{margin.toFixed(0)}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusBadge[r.status] ?? ""}>{statusLabel[r.status] ?? r.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}