import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canRegisterSale } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/format";
import { Plus, Receipt, Filter, Search } from "lucide-react";

const fmtNum = (n: number | null | undefined) => `#${String(n ?? 0).padStart(4, "0")}`;

export default function Vendas() {
  const { store, role } = useAuth();
  const navigate = useNavigate();
  const [sales, setSales] = useState<any[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "1y" | "all">("30d");
  const [payment, setPayment] = useState<string>("all");
  const [q, setQ] = useState("");

  const load = async () => {
    if (!store) return;
    let query = supabase.from("sales").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(500);
    if (period !== "all") {
      const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      query = query.gte("created_at", since);
    }
    const { data: s } = await query;
    setSales(s ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store, period]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (payment !== "all" && s.payment_method !== payment) return false;
      if (q) {
        const needle = q.toLowerCase();
        const num = fmtNum(s.sale_number).toLowerCase();
        if (
          !String(s.customer_name || "").toLowerCase().includes(needle) &&
          !num.includes(needle) &&
          !String(s.sale_number ?? "").includes(needle.replace(/^#?0*/, ""))
        ) return false;
      }
      return true;
    });
  }, [sales, payment, q]);

  const total = filtered.reduce((a, b) => a + Number(b.total || 0), 0);

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

      <Card className="bg-card border-border shadow-card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span className="text-[11px] font-mono uppercase tracking-widest">Filtros</span>
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nº da venda ou cliente" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-8" />
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
            <SelectItem value="1y">Último ano</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={payment} onValueChange={setPayment}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos pagamentos</SelectItem>
            <SelectItem value="dinheiro">Dinheiro</SelectItem>
            <SelectItem value="pix">PIX</SelectItem>
            <SelectItem value="debito">Débito</SelectItem>
            <SelectItem value="credito">Crédito</SelectItem>
            <SelectItem value="boleto">Boleto</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs font-mono text-muted-foreground">
          {filtered.length} venda(s) · <span className="text-foreground font-semibold">{brl(total)}</span>
        </div>
      </Card>

      <Card className="bg-card border-border shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nº</th>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Pagamento</th>
                <th className="text-right px-4 py-3 font-medium">Desconto</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-surface-elevated/40">
                  <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{fmtNum(s.sale_number)}</td>
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