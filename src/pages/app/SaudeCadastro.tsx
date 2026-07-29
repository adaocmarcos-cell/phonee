import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { handleSupabaseError } from "@/lib/supabaseFetch";
import { Save, AlertTriangle } from "lucide-react";

type SemCustoRow = {
  sale_id: string;
  sale_number: string | null;
  created_at: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  product_cost: number;
};

type ProdutoRow = {
  id: string;
  name: string;
  sku: string | null;
  sale_price: number | null;
  cost_price: number | null;
};

const TABS = ["sem-custo", "sem-preco", "prejuizo"] as const;
type TabKey = typeof TABS[number];

export default function SaudeCadastro() {
  const { store, role } = useAuth();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("tab") as TabKey) || "sem-custo";
  const [tab, setTab] = useState<TabKey>(TABS.includes(initial) ? initial : "sem-custo");

  const canEdit = role === "dono" || role === "gerente";

  const [semCusto, setSemCusto] = useState<SemCustoRow[]>([]);
  const [semPreco, setSemPreco] = useState<ProdutoRow[]>([]);
  const [prejuizo, setPrejuizo] = useState<ProdutoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const setDraft = (k: string, v: number) => setDrafts((d) => ({ ...d, [k]: v }));

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const from = new Date(); from.setFullYear(from.getFullYear() - 5);
    const [a, b, c] = await Promise.all([
      supabase.rpc("sales_without_cost", {
        _store_id: store.id, _from: from.toISOString(), _to: new Date().toISOString(),
      }),
      supabase.from("products").select("id,name,sku,sale_price,cost_price")
        .eq("store_id", store.id).or("sale_price.is.null,sale_price.eq.0,cost_price.is.null,cost_price.eq.0")
        .order("name").limit(500),
      supabase.from("products").select("id,name,sku,sale_price,cost_price")
        .eq("store_id", store.id).gt("sale_price", 0).gt("cost_price", 0)
        .order("name").limit(500),
    ]);
    setLoading(false);
    if (a.error) handleSupabaseError(a.error, "Erro ao carregar vendas sem custo");
    else setSemCusto((a.data as unknown as SemCustoRow[]) ?? []);
    if (b.error) handleSupabaseError(b.error, "Erro ao carregar produtos");
    else setSemPreco((b.data as ProdutoRow[]) ?? []);
    if (c.error) handleSupabaseError(c.error, "Erro ao carregar produtos");
    else setPrejuizo(((c.data as ProdutoRow[]) ?? []).filter((p) => Number(p.sale_price) < Number(p.cost_price)));
    setDrafts({});
  }, [store]);

  useEffect(() => { load(); }, [load]);

  const onTab = (v: string) => {
    setTab(v as TabKey);
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  const salvarCustoItem = async (r: SemCustoRow) => {
    const v = Number(drafts[`i:${r.item_id}`] ?? 0);
    if (!v || v <= 0) return toast.error("Informe um custo maior que zero.");
    setSavingId(r.item_id);
    const { error } = await supabase.rpc("set_sale_items_cost", {
      _items: [{ item_id: r.item_id, unit_cost: v }] as never,
    });
    setSavingId(null);
    if (error) return handleSupabaseError(error, "Erro ao salvar custo");
    toast.success("Custo do item atualizado.");
    setSemCusto((arr) => arr.filter((x) => x.item_id !== r.item_id));
  };

  const salvarProduto = async (p: ProdutoRow, keys: ("sale_price" | "cost_price")[]) => {
    const payload: { sale_price?: number; cost_price?: number } = {};
    keys.forEach((k) => {
      const v = Number(drafts[`p:${p.id}:${k}`] ?? 0);
      if (v > 0) payload[k] = v;
    });
    if (!Object.keys(payload).length) return toast.error("Informe um valor maior que zero.");
    setSavingId(p.id);
    const { error } = await supabase.from("products").update(payload).eq("id", p.id);
    setSavingId(null);
    if (error) return handleSupabaseError(error, "Erro ao salvar produto");
    toast.success("Produto atualizado.");
    load();
  };

  const counts = useMemo(() => ({
    semCusto: semCusto.length, semPreco: semPreco.length, prejuizo: prejuizo.length,
  }), [semCusto, semPreco, prejuizo]);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Saúde do cadastro"
        description="Corrija custos, preços e prejuízos direto na lista — o lucro do painel depende desses dados"
      />

      {!canEdit && (
        <Card className="p-3 mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Apenas dono e gerente podem editar custos e preços.
        </Card>
      )}

      <Tabs value={tab} onValueChange={onTab}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="sem-custo">
            Vendas sem custo <Badge variant="secondary" className="ml-2">{counts.semCusto}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sem-preco">
            Produtos sem preço ou custo <Badge variant="secondary" className="ml-2">{counts.semPreco}</Badge>
          </TabsTrigger>
          <TabsTrigger value="prejuizo">
            Preço abaixo do custo <Badge variant="secondary" className="ml-2">{counts.prejuizo}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sem-custo">
          <Card className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venda</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="w-[220px] text-right">Custo unitário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
                {!loading && !semCusto.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma venda sem custo. 🎉</TableCell></TableRow>
                )}
                {semCusto.map((r) => (
                  <TableRow key={r.item_id}>
                    <TableCell className="font-mono">#{r.sale_number ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{r.item_name}</TableCell>
                    <TableCell className="text-right">{r.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{brl(Number(r.unit_price))}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-end">
                        <NumberInput
                          className="w-28 text-right"
                          value={drafts[`i:${r.item_id}`] ?? Number(r.product_cost) ?? 0}
                          onValueChange={(v) => setDraft(`i:${r.item_id}`, v)}
                          min={0}
                          disabled={!canEdit}
                        />
                        <Button size="sm" variant="outline" disabled={!canEdit || savingId === r.item_id}
                          onClick={() => salvarCustoItem(r)}>
                          <Save className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="sem-preco">
          <Card className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="w-[150px] text-right">Preço de venda</TableHead>
                  <TableHead className="w-[150px] text-right">Custo</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
                {!loading && !semPreco.length && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Todos os produtos têm preço e custo. 🎉</TableCell></TableRow>
                )}
                {semPreco.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[280px] truncate">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.sku ?? "—"}</TableCell>
                    <TableCell>
                      <NumberInput
                        className="w-28 text-right"
                        value={drafts[`p:${p.id}:sale_price`] ?? Number(p.sale_price ?? 0)}
                        onValueChange={(v) => setDraft(`p:${p.id}:sale_price`, v)}
                        min={0}
                        disabled={!canEdit}
                      />
                    </TableCell>
                    <TableCell>
                      <NumberInput
                        className="w-28 text-right"
                        value={drafts[`p:${p.id}:cost_price`] ?? Number(p.cost_price ?? 0)}
                        onValueChange={(v) => setDraft(`p:${p.id}:cost_price`, v)}
                        min={0}
                        disabled={!canEdit}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={!canEdit || savingId === p.id}
                        onClick={() => salvarProduto(p, ["sale_price", "cost_price"])}>
                        <Save className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="prejuizo">
          <Card className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="w-[150px] text-right">Novo preço</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
                {!loading && !prejuizo.length && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum produto vendendo abaixo do custo. 🎉</TableCell></TableRow>
                )}
                {prejuizo.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[280px] truncate">{p.name}</TableCell>
                    <TableCell className="text-right font-mono">{brl(Number(p.cost_price))}</TableCell>
                    <TableCell className="text-right font-mono text-danger">
                      −{brl(Number(p.cost_price) - Number(p.sale_price))}
                    </TableCell>
                    <TableCell>
                      <NumberInput
                        className="w-28 text-right"
                        value={drafts[`p:${p.id}:sale_price`] ?? Number(p.sale_price ?? 0)}
                        onValueChange={(v) => setDraft(`p:${p.id}:sale_price`, v)}
                        min={0}
                        disabled={!canEdit}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={!canEdit || savingId === p.id}
                        onClick={() => salvarProduto(p, ["sale_price"])}>
                        <Save className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
