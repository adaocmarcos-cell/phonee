import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Receipt, Search, FileDown, ShoppingBag, TrendingUp, Hammer } from "lucide-react";
import { brl, num } from "@/lib/format";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Row = {
  id: string;
  qty: number;
  unit_price: number;
  created_at: string;
  service_order_id: string;
  part: { name: string; category: string; category_other: string | null } | null;
  os: { os_number: number | null; customer_name: string | null; status: string } | null;
};

const CAT_LABEL: Record<string, string> = {
  telas: "Telas", baterias: "Baterias", tampas: "Tampas", cameras: "Câmeras",
  flex: "Flex", componentes: "Componentes", ferramentas: "Ferramentas", outros: "Outros",
};

export default function VendasPecas() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | string>("all");
  const [range, setRange] = useState<"month" | "30d" | "all">("month");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("service_order_parts")
      .select("id, qty, unit_price, created_at, service_order_id, part:parts_inventory(name, category, category_other), os:service_orders(os_number, customer_name, status)")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  const filtered = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const cutoff30 = new Date(now.getTime() - 30 * 86400000);
    return rows.filter((r) => {
      const d = new Date(r.created_at);
      if (range === "month" && d < startOfMonth) return false;
      if (range === "30d" && d < cutoff30) return false;
      if (cat !== "all" && r.part?.category !== cat) return false;
      if (q) {
        const s = q.toLowerCase();
        if (!`${r.part?.name ?? ""} ${r.os?.customer_name ?? ""} ${r.os?.os_number ?? ""}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rows, q, cat, range]);

  const stats = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.qty * Number(r.unit_price), 0);
    const qty = filtered.reduce((s, r) => s + r.qty, 0);
    return { total, qty, count: filtered.length };
  }, [filtered]);

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Peças utilizadas em OS — ${store?.name ?? ""}`, 14, 16);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleString("pt-BR"), 14, 22);
    autoTable(doc, {
      startY: 28, styles: { fontSize: 8 },
      head: [["Data", "OS", "Cliente", "Peça", "Categoria", "Qtd", "Total"]],
      body: filtered.map((r) => [
        new Date(r.created_at).toLocaleString("pt-BR"),
        r.os?.os_number ? `#${String(r.os.os_number).padStart(4, "0")}` : "—",
        r.os?.customer_name ?? "—",
        r.part?.name ?? "—",
        r.part ? (r.part.category === "outros" ? `Outros — ${r.part.category_other ?? ""}` : CAT_LABEL[r.part.category]) : "—",
        String(r.qty),
        brl(r.qty * Number(r.unit_price)),
      ]),
      foot: [["", "", "", "", "", String(stats.qty), brl(stats.total)]],
    });
    doc.save(`pecas-utilizadas-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Peças utilizadas em OS"
        description="Histórico de peças do estoque consumidas em ordens de serviço."
        actions={
          <Button variant="outline" onClick={exportPdf}>
            <FileDown className="h-4 w-4 mr-2" /> PDF
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard label="Valor total" value={brl(stats.total)} icon={TrendingUp} tone="primary" />
        <MetricCard label="Lançamentos" value={num(stats.count)} icon={Receipt} tone="info" />
        <MetricCard label="Peças consumidas" value={num(stats.qty)} icon={Hammer} tone="violet" />
      </div>

      <Card className="p-3 flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por peça, OS ou cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {Object.entries(CAT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={(v) => setRange(v as any)}>
          <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mês atual</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">OS</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Peça</th>
                <th className="p-3">Categoria</th>
                <th className="p-3 text-right">Qtd</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">
                  <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhuma peça utilizada no período.
                </td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/app/os/${r.service_order_id}`)}>
                  <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3 font-mono">{r.os?.os_number ? `#${String(r.os.os_number).padStart(4, "0")}` : "—"}</td>
                  <td className="p-3">{r.os?.customer_name ?? "—"}</td>
                  <td className="p-3 font-medium">{r.part?.name ?? "—"}</td>
                  <td className="p-3">
                    {r.part ? (r.part.category === "outros" ? `Outros — ${r.part.category_other ?? ""}` : CAT_LABEL[r.part.category]) : "—"}
                  </td>
                  <td className="p-3 text-right">{r.qty}</td>
                  <td className="p-3 text-right font-semibold">{brl(r.qty * Number(r.unit_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}