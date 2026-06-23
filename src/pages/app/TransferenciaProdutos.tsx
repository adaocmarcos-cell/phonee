import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft, Search, Building2, History } from "lucide-react";
import { toast } from "sonner";
import { num } from "@/lib/format";

type Product = { id: string; name: string; sku: string | null; stock_current: number; store_id: string };
type TransferRow = {
  id: string; created_at: string; quantity: number; note: string | null;
  from_store: { name: string } | null;
  to_store: { name: string } | null;
  from_product: { name: string; sku: string | null } | null;
};

export default function TransferenciaProdutos() {
  const { user, store, stores, role } = useAuth();
  // Apenas lojas das quais o usuário é dono podem participar
  const ownedStores = useMemo(() => stores.filter((s) => s.is_owner), [stores]);

  const [fromId, setFromId] = useState<string>(store?.id ?? "");
  const [toId, setToId] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string>("");
  const [qty, setQty] = useState<number>(1);
  const [note, setNote] = useState<string>("");
  const [history, setHistory] = useState<TransferRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setFromId(store?.id ?? ""); }, [store?.id]);

  // load products from origin
  useEffect(() => {
    if (!fromId) { setProducts([]); return; }
    supabase.from("products")
      .select("id,name,sku,stock_current,store_id")
      .eq("store_id", fromId)
      .gt("stock_current", 0)
      .order("name")
      .then(({ data }) => setProducts((data ?? []) as Product[]));
    setPick("");
  }, [fromId]);

  // load history
  const loadHistory = async () => {
    const { data } = await (supabase.from("product_transfers") as any)
      .select("id,created_at,quantity,note, from_store:stores!product_transfers_from_store_id_fkey(name), to_store:stores!product_transfers_to_store_id_fkey(name), from_product:products!product_transfers_from_product_id_fkey(name,sku)")
      .order("created_at", { ascending: false })
      .limit(100);
    setHistory((data ?? []) as TransferRow[]);
  };
  useEffect(() => { loadHistory(); }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return products.filter((p) => !s || `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(s));
  }, [products, q]);

  const selected = products.find((p) => p.id === pick);

  const transfer = async () => {
    if (!user) return;
    if (!fromId || !toId) { toast.error("Selecione origem e destino"); return; }
    if (fromId === toId) { toast.error("Origem e destino devem ser diferentes"); return; }
    if (!selected) { toast.error("Selecione o produto"); return; }
    if (qty < 1 || qty > selected.stock_current) { toast.error("Quantidade inválida"); return; }
    setSubmitting(true);
    try {
      // Buscar/duplicar produto destino por SKU/nome
      let toProductId: string | null = null;
      const { data: existing } = await supabase.from("products")
        .select("id, stock_current")
        .eq("store_id", toId)
        .or(`sku.eq.${selected.sku ?? "___NONE___"},name.eq.${selected.name}`)
        .maybeSingle();

      if (existing) {
        toProductId = existing.id;
        await supabase.from("products")
          .update({ stock_current: Number(existing.stock_current ?? 0) + qty })
          .eq("id", existing.id);
      } else {
        // Cria cópia mínima no destino
        const { data: full } = await (supabase.from("products") as any)
          .select("*").eq("id", selected.id).maybeSingle();
        if (!full) throw new Error("Produto de origem não encontrado");
        const { id: _id, created_at: _c, updated_at: _u, store_id: _s, stock_current: _sc, ...copy } = full;
        const { data: created, error: eIns } = await (supabase.from("products") as any)
          .insert({ ...copy, store_id: toId, stock_current: qty })
          .select("id").single();
        if (eIns) throw eIns;
        toProductId = created.id;
      }

      // Decrementa origem
      const { error: eUp } = await supabase.from("products")
        .update({ stock_current: selected.stock_current - qty })
        .eq("id", selected.id);
      if (eUp) throw eUp;

      // Registra transferência
      const { error: eTr } = await (supabase.from("product_transfers") as any).insert({
        from_store_id: fromId,
        to_store_id: toId,
        from_product_id: selected.id,
        to_product_id: toProductId,
        quantity: qty,
        note: note || null,
        user_id: user.id,
      });
      if (eTr) throw eTr;

      // Stock adjustments para auditoria nas duas lojas
      await supabase.from("stock_adjustments").insert([
        {
          store_id: fromId, item_kind: "product", product_id: selected.id,
          item_name: selected.name, qty_change: -qty,
          prev_stock: selected.stock_current, new_stock: selected.stock_current - qty,
          reason: "outros", justification: `Transferência para outra loja${note ? ` · ${note}` : ""}`,
          user_id: user.id,
        },
      ]);

      toast.success(`Transferidas ${qty} unidade(s) de ${selected.name}`);
      setQty(1); setNote(""); setPick("");
      // reload products + history
      const { data: refreshed } = await supabase.from("products")
        .select("id,name,sku,stock_current,store_id").eq("store_id", fromId)
        .gt("stock_current", 0).order("name");
      setProducts((refreshed ?? []) as Product[]);
      loadHistory();
    } catch (err: any) {
      toast.error(err.message ?? "Falha na transferência");
    } finally {
      setSubmitting(false);
    }
  };

  if (role !== "dono") {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <ArrowRightLeft className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <div className="font-semibold">Acesso restrito</div>
          <div className="text-sm text-muted-foreground">Apenas o dono das lojas pode transferir produtos.</div>
        </Card>
      </div>
    );
  }

  if (ownedStores.length < 2) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <div className="font-semibold">Você precisa de pelo menos 2 lojas</div>
          <div className="text-sm text-muted-foreground">Cadastre uma nova loja em "Minhas Lojas" para habilitar a transferência.</div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Transferência de produtos entre lojas"
        description="Movimente estoque entre lojas que você possui. O histórico fica registrado em ambas."
      />

      <Card className="p-5 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label>Loja de origem</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
              <SelectContent>
                {ownedStores.map((s) => <SelectItem key={s.store_id} value={s.store_id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Loja de destino</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger><SelectValue placeholder="Selecione o destino" /></SelectTrigger>
              <SelectContent>
                {ownedStores.filter((s) => s.store_id !== fromId).map((s) => <SelectItem key={s.store_id} value={s.store_id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3 mb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar produto por nome ou SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <Input type="number" min={1} max={selected?.stock_current ?? 1} value={qty} onChange={(e) => setQty(Number(e.target.value))} placeholder="Qtd" />
          </div>
        </div>

        <div className="max-h-[280px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhum produto disponível na loja de origem.</div>
          ) : filtered.map((p) => (
            <button
              key={p.id} onClick={() => { setPick(p.id); setQty(1); }}
              className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/40 ${pick === p.id ? "bg-primary/10" : ""}`}
            >
              <div className="min-w-0">
                <div className="font-medium truncate text-sm">{p.name}</div>
                <div className="text-[11px] font-mono text-muted-foreground">{p.sku ?? "sem SKU"}</div>
              </div>
              <div className="text-xs font-mono text-muted-foreground">estoque: {num(p.stock_current)}</div>
            </button>
          ))}
        </div>

        <div className="mt-3">
          <Label>Observação (opcional)</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo da transferência…" />
        </div>

        <div className="flex justify-end mt-4">
          <Button onClick={transfer} disabled={submitting || !pick || !toId} className="bg-primary text-primary-foreground shadow-glow">
            <ArrowRightLeft className="h-4 w-4 mr-1" />
            {submitting ? "Transferindo…" : "Confirmar transferência"}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Histórico de transferências</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Produto</th>
                <th className="p-3">Origem → Destino</th>
                <th className="p-3 text-right">Qtd</th>
                <th className="p-3">Observação</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma transferência registrada.</td></tr>
              ) : history.map((h) => (
                <tr key={h.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{new Date(h.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3">
                    <div className="font-medium">{h.from_product?.name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{h.from_product?.sku ?? "—"}</div>
                  </td>
                  <td className="p-3 text-xs">
                    <span className="text-muted-foreground">{h.from_store?.name ?? "—"}</span>
                    <ArrowRightLeft className="inline h-3 w-3 mx-1.5 text-primary" />
                    <span className="font-medium">{h.to_store?.name ?? "—"}</span>
                  </td>
                  <td className="p-3 text-right font-semibold">{h.quantity}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-[280px] truncate" title={h.note ?? ""}>{h.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}