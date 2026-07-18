import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/NumberInput";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { Trash2, Plus, Wrench, Search, Info } from "lucide-react";

type Part = {
  id: string;
  name: string;
  sku?: string | null;
  sale_price: number;
  cost_price: number;
  stock_current: number;
};

type LinkedPart = {
  id: string;
  part_id: string | null;
  qty: number;
  unit_price: number;
  unit_cost: number;
  description: string | null;
  created_at: string;
  part?: { name: string; sku?: string | null } | null;
};

export function OsPartsSection({
  osId,
  storeId,
  onChangedTotal,
}: {
  osId: string;
  storeId: string;
  onChangedTotal?: (partsValue: number) => void;
}) {
  const [rows, setRows] = useState<LinkedPart[]>([]);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Part[]>([]);
  const [selected, setSelected] = useState<Part | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [descOnly, setDescOnly] = useState(false);
  const [manualDesc, setManualDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("service_order_parts")
      .select("id,part_id,qty,unit_price,unit_cost,description,created_at,part:parts_inventory(name,sku)")
      .eq("service_order_id", osId)
      .order("created_at", { ascending: true });
    if (error) return toast.error(error.message);
    setRows((data as LinkedPart[]) ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [osId]);

  const total = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.qty || 0) * Number(r.unit_price || 0), 0),
    [rows]
  );
  useEffect(() => { onChangedTotal?.(total); }, [total]); // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = term.trim();
      if (q.length < 2) { setResults([]); return; }
      const { data } = await (supabase as any)
        .from("parts_inventory")
        .select("id,name,sku,sale_price,cost_price,stock_current")
        .eq("store_id", storeId)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(10);
      setResults((data as Part[]) ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [term, storeId]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setResults([]);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const addPart = async () => {
    if (descOnly) {
      if (!manualDesc.trim() || price <= 0) return toast.error("Informe descrição e preço");
      setBusy(true);
      const { error } = await (supabase as any).rpc("add_os_part", {
        _service_order_id: osId, _part_id: null, _qty: qty || 1,
        _unit_price: price, _description: manualDesc,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      setManualDesc(""); setPrice(0); setQty(1); setDescOnly(false);
      toast.success("Serviço/peça externa lançada"); load();
      return;
    }
    if (!selected) return toast.error("Escolha uma peça do estoque ou marque 'Externa'");
    if (qty <= 0) return toast.error("Quantidade inválida");
    setBusy(true);
    const { error } = await (supabase as any).rpc("add_os_part", {
      _service_order_id: osId,
      _part_id: selected.id,
      _qty: qty,
      _unit_price: price || selected.sale_price,
      _description: null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSelected(null); setTerm(""); setPrice(0); setQty(1);
    toast.success("Peça adicionada e baixa realizada");
    load();
  };

  const removeRow = async (id: string) => {
    if (!confirm("Remover esta peça e estornar a baixa de estoque?")) return;
    const { error } = await (supabase as any).rpc("remove_os_part", { _sop_id: id });
    if (error) return toast.error(error.message);
    toast.success("Removida e estoque estornado"); load();
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Peças usadas no serviço</h3>
        <Badge variant="outline" className="ml-auto">
          Total peças: <strong className="ml-1">{brl(total)}</strong>
        </Badge>
      </div>

      <div className="rounded-md border border-dashed border-border p-3 space-y-3">
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={!descOnly} onChange={() => setDescOnly(false)} />
            Do estoque (baixa automática)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={descOnly} onChange={() => setDescOnly(true)} />
            Externa / avulsa (sem baixa)
          </label>
        </div>

        {descOnly ? (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,120px,140px,auto] gap-2">
            <Input placeholder="Descrição (ex.: Cola B7000, tela genérica)" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} />
            <NumberInput allowDecimal={false} min={1} value={qty} onValueChange={setQty} />
            <NumberInput value={price} onValueChange={setPrice} />
            <Button onClick={addPart} disabled={busy}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
          </div>
        ) : (
          <div className="relative" ref={boxRef}>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,120px,140px,auto] gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={selected ? selected.name : "Buscar peça por nome ou SKU…"}
                  value={selected ? selected.name : term}
                  onChange={(e) => { setTerm(e.target.value); setSelected(null); setPrice(0); }}
                />
              </div>
              <NumberInput allowDecimal={false} min={1} value={qty} onValueChange={setQty} />
              <NumberInput value={price} onValueChange={setPrice} />
              <Button onClick={addPart} disabled={busy || !selected}>
                <Plus className="h-4 w-4 mr-1" />Adicionar
              </Button>
            </div>
            {!selected && results.length > 0 && (
              <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                {results.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => { setSelected(p); setPrice(Number(p.sale_price || 0)); setResults([]); }}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b border-border last:border-0"
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          SKU: {p.sku || "—"} · Custo {brl(Number(p.cost_price || 0))}
                        </div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-sm font-semibold">{brl(Number(p.sale_price || 0))}</div>
                        <div className={`text-[11px] ${p.stock_current <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          Estoque: {p.stock_current}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                <Info className="h-3 w-3" />
                Estoque atual: <strong className="text-foreground">{selected.stock_current}</strong> · Custo unitário registrado: <strong className="text-foreground">{brl(Number(selected.cost_price || 0))}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          Nenhuma peça ou serviço externo lançado ainda.
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Qtd</th>
                <th className="text-right px-3 py-2">Unit.</th>
                <th className="text-right px-3 py-2">Subtotal</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {r.part?.name || r.description || "Serviço avulso"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.part_id ? `Baixa em estoque · SKU ${r.part?.sku || "—"}` : "Item externo (sem baixa)"}
                    </div>
                  </td>
                  <td className="text-right px-3 py-2">{r.qty}</td>
                  <td className="text-right px-3 py-2">{brl(Number(r.unit_price || 0))}</td>
                  <td className="text-right px-3 py-2 font-semibold">{brl(Number(r.qty || 0) * Number(r.unit_price || 0))}</td>
                  <td className="px-2">
                    <Button size="icon" variant="ghost" onClick={() => removeRow(r.id)} title="Remover e estornar">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        O total de peças é recalculado no orçamento automaticamente por gatilho no banco (<code>tg_service_order_parts_recalc</code>).
      </p>
    </Card>
  );
}