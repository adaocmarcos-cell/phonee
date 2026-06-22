import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Undo2, X } from "lucide-react";

function formatBRL(c: number) { return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleString("pt-BR") : "—"; }

export default function Assinaturas() {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.from("subscriptions").select("*, plans:plan_id(name,code)").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const refund = async (id: string) => {
    if (!confirm("Confirma o reembolso? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabase.functions.invoke("asaas-refund", { body: { subscription_id: id } });
    if (error) return toast.error(error.message);
    toast.success("Reembolso solicitado");
    load();
  };
  const cancel = async (id: string) => {
    const { error } = await supabase.from("subscriptions").update({ status: "canceled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Assinatura cancelada"); load();
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Assinaturas / Compras</h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Plano</th>
              <th className="px-3 py-2 text-left">Valor</th>
              <th className="px-3 py-2 text-left">Forma</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Início</th>
              <th className="px-3 py-2 text-left">Vencimento</th>
              <th className="px-3 py-2 text-left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{r.customer_email}</div>
                </td>
                <td className="px-3 py-2">{r.plans?.name ?? "—"}</td>
                <td className="px-3 py-2">{formatBRL(r.amount_cents)}</td>
                <td className="px-3 py-2">{r.payment_method}</td>
                <td className="px-3 py-2"><Badge variant={r.status === "active" ? "default" : r.status === "pending" ? "secondary" : "destructive"}>{r.status}</Badge></td>
                <td className="px-3 py-2">{fmtDate(r.started_at)}</td>
                <td className="px-3 py-2">{r.expires_at ? fmtDate(r.expires_at) : (r.plans?.code === "lifetime" ? "Vitalício" : "—")}</td>
                <td className="px-3 py-2 space-x-1">
                  {r.invoice_url && <a href={r.invoice_url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button></a>}
                  <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(r.invoice_url ?? "") }><RefreshCw className="h-3.5 w-3.5" /></Button>
                  {r.status === "active" && <Button size="sm" variant="ghost" onClick={() => refund(r.id)} title="Reembolsar"><Undo2 className="h-3.5 w-3.5 text-warning" /></Button>}
                  {r.status !== "canceled" && r.status !== "refunded" && <Button size="sm" variant="ghost" onClick={() => cancel(r.id)} title="Cancelar"><X className="h-3.5 w-3.5 text-destructive" /></Button>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nenhuma assinatura registrada.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}