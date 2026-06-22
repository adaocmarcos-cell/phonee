import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canRegisterSale } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { Plus, Receipt } from "lucide-react";

export default function Vendas() {
  const { store, role } = useAuth();
  const navigate = useNavigate();
  const [sales, setSales] = useState<any[]>([]);

  const load = async () => {
    if (!store) return;
    const { data: s } = await supabase.from("sales").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(50);
    setSales(s ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  return (
    <div>
      <PageHeader
        title="Vendas"
        description="Histórico de vendas e PDV rápido."
        actions={
          canRegisterSale(role) && (
            <Button onClick={() => navigate("/app/vendas/nova")} className="bg-primary text-primary-foreground shadow-glow">
              <Plus className="h-4 w-4 mr-1" />Nova venda
            </Button>
          )
        }
      />

      <Card className="bg-card border-border shadow-card overflow-hidden">
        {sales.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Pagamento</th>
                <th className="text-right px-4 py-3 font-medium">Desconto</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-surface-elevated/40">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3">{s.customer_name || <span className="text-muted-foreground">Avulso</span>}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="capitalize text-xs">{s.payment_method}</Badge></td>
                  <td className="px-4 py-3 text-right metric text-muted-foreground">{brl(Number(s.discount))}</td>
                  <td className="px-4 py-3 text-right metric font-semibold">{brl(Number(s.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}