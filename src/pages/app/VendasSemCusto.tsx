import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/NumberInput";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { handleSupabaseError } from "@/lib/supabaseFetch";
import { Wand2, Save, AlertTriangle } from "lucide-react";

type Row = {
  sale_id: string;
  sale_number: string | null;
  created_at: string;
  customer_name: string | null;
  sale_total: number;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  item_total: number;
  product_id: string | null;
  product_cost: number;
};

const PERIODS = [
  { key: "1", label: "Último mês" },
  { key: "3", label: "Últimos 3 meses" },
  { key: "12", label: "Últimos 12 meses" },
  { key: "120", label: "Tudo" },
];

export default function VendasSemCusto() {
  const { store, role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState("12");
  const [edits, setEdits] = useState<Record<string, number>>({});

  const canEdit = role === "dono" || role === "gerente";

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - Number(period));
    const { data, error } = await supabase.rpc("sales_without_cost", {
      _store_id: store.id,
      _from: from.toISOString(),
      _to: to.toISOString(),
    });
    setLoading(false);
    if (error) return handleSupabaseError(error, "Erro ao carregar vendas sem custo");
    setRows((data as unknown as Row[]) ?? []);
    setEdits({});
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store, period]);

  const totalSemCusto = useMemo(() => rows.reduce((s, r) => s + Number(r.item_total), 0), [rows]);
  const comCustoNoProduto = useMemo(() => rows.filter((r) => Number(r.product_cost) > 0), [rows]);

  const preencherPeloProduto = () => {
    const next = { ...edits };
    comCustoNoProduto.forEach((r) => { next[r.item_id] = Number(r.product_cost); });
    setEdits(next);
    toast.success(`${comCustoNoProduto.length} item(ns) preenchido(s) com o custo do produto. Revise e salve.`);
  };

  const salvar = async () => {
    const items = Object.entries(edits)
      .filter(([, v]) => Number(v) > 0)
      .map(([item_id, unit_cost]) => ({ item_id, unit_cost }));
    if (!items.length) return toast.error("Nenhum custo preenchido.");
    setSaving(true);
    const { data, error } = await supabase.rpc("set_sale_items_cost", { _items: items as never });
    setSaving(false);
    if (error) return handleSupabaseError(error, "Erro ao salvar custos");
    toast.success(`${data ?? items.length} item(ns) atualizado(s).`);
    load();
  };

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Vendas sem custo" description="Itens vendidos sem custo cadastrado — o lucro dessas vendas não é calculado" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Itens sem custo</div>
          <div className="metric text-2xl font-bold">{rows.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Faturamento afetado</div>
          <div className="metric text-2xl font-bold">{brl(totalSemCusto)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Recuperáveis pelo produto</div>
          <div className="metric text-2xl font-bold">{comCustoNoProduto.length}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {canEdit && (
          <>
            <Button variant="outline" onClick={preencherPeloProduto} disabled={!comCustoNoProduto.length}>
              <Wand2 className="h-4 w-4 mr-1" /> Preencher pelo custo do produto
            </Button>
            <Button onClick={salvar} disabled={saving || !Object.keys(edits).length}>
              <Save className="h-4 w-4 mr-1" /> Salvar em lote
            </Button>
          </>
        )}
      </div>

      {!canEdit && (
        <Card className="p-3 mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Apenas dono e gerente podem ajustar custos de vendas.
        </Card>
      )}

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Venda</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">Custo do produto</TableHead>
              <TableHead className="text-right w-[160px]">Custo unitário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
            {!loading && !rows.length && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum item sem custo no período. 🎉</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.item_id}>
                <TableCell className="font-mono">#{r.sale_number ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="max-w-[240px] truncate">{r.item_name}</TableCell>
                <TableCell className="text-right">{r.quantity}</TableCell>
                <TableCell className="text-right font-mono">{brl(Number(r.unit_price))}</TableCell>
                <TableCell className="text-right">
                  {Number(r.product_cost) > 0
                    ? <span className="font-mono">{brl(Number(r.product_cost))}</span>
                    : <Badge variant="outline">sem custo</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <NumberInput
                    value={edits[r.item_id] ?? 0}
                    onValueChange={(v) => setEdits((e) => ({ ...e, [r.item_id]: v }))}
                    min={0}
                    disabled={!canEdit}
                    className="text-right"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
