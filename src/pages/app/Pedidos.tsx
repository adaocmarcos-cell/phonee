import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList } from "lucide-react";
import { brl } from "@/lib/format";

type PO = {
  id: string; supplier: string; status: string; total_cost: number;
  created_at: string; sent_at: string | null;
};
const statusBadge: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground border-border",
  enviado: "bg-primary/15 text-primary border-primary/30",
  recebido: "bg-success/15 text-success border-success/30",
  parcial: "bg-warning/15 text-warning border-warning/30",
  cancelado: "bg-danger/15 text-danger border-danger/30",
};

export default function Pedidos() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, supplier, status, total_cost, created_at, sent_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });
      setRows((data ?? []) as PO[]);
      setLoading(false);
    })();
  }, [store]);

  return (
    <div>
      <PageHeader
        title="Pedidos de compra"
        description="Geração assertiva com base em giro de vendas e ponto de pedido."
        actions={
          <Button onClick={() => navigate("/app/pedidos/novo")} className="bg-gradient-primary shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> Gerar pedido
          </Button>
        }
      />
      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Fornecedor</th>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground text-xs font-mono tracking-widest">CARREGANDO…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-16 text-center">
                  <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhum pedido gerado ainda.</p>
                  <Button onClick={() => navigate("/app/pedidos/novo")} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" /> Gerar primeiro pedido</Button>
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-elevated/40">
                  <td className="px-4 py-3 font-medium">{r.supplier}</td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 text-right metric font-semibold">{brl(Number(r.total_cost))}</td>
                  <td className="px-4 py-3"><Badge className={statusBadge[r.status] ?? ""}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}