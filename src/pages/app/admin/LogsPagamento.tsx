import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LogsPagamento() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("payment_logs").select("*, subscriptions:subscription_id(customer_email,customer_name)")
      .order("created_at", { ascending: false }).limit(500).then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Logs de Pagamento</h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Evento</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Ação</th>
              <th className="px-3 py-2 text-left">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2">
                  <div>{r.subscriptions?.customer_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.subscriptions?.customer_email ?? "—"}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.event_type}</td>
                <td className="px-3 py-2"><Badge variant="outline">{r.status ?? "—"}</Badge></td>
                <td className="px-3 py-2 text-xs">{r.action ?? "—"}</td>
                <td className="px-3 py-2">{r.amount_cents ? (r.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sem logs ainda.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}