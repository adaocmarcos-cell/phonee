import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, Tag } from "lucide-react";
import { toast } from "sonner";
import { BRAND_PRESETS, BRAND_CATEGORIES } from "@/lib/brandPresets";

type Row = { id: string; category: string; brand: string };

export function MarcasModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { store } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [activeCat, setActiveCat] = useState<string>(BRAND_CATEGORIES[0]);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("store_brands")
      .select("id, category, brand")
      .eq("store_id", store.id);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, store]);

  const selectedForCat = useMemo(
    () => new Set(rows.filter((r) => r.category === activeCat).map((r) => r.brand)),
    [rows, activeCat]
  );

  const toggleBrand = async (brand: string) => {
    if (!store) return;
    const existing = rows.find((r) => r.category === activeCat && r.brand === brand);
    if (existing) {
      const prev = rows;
      setRows((arr) => arr.filter((r) => r.id !== existing.id));
      const { error } = await (supabase as any).from("store_brands").delete().eq("id", existing.id);
      if (error) { setRows(prev); toast.error(error.message); }
    } else {
      const { data, error } = await (supabase as any)
        .from("store_brands")
        .insert({ store_id: store.id, category: activeCat, brand })
        .select("id, category, brand")
        .single();
      if (error) return toast.error(error.message);
      setRows((arr) => [...arr, data as Row]);
    }
  };

  const addCustom = async () => {
    const v = custom.trim();
    if (!v) return;
    setCustom("");
    if (selectedForCat.has(v)) return;
    await toggleBrand(v);
  };

  const presetForCat = BRAND_PRESETS[activeCat] ?? [];
  const customForCat = rows.filter((r) => r.category === activeCat && !presetForCat.includes(r.brand));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" /> Marcas que você trabalha
          </DialogTitle>
          <DialogDescription>
            Selecione as marcas por categoria. Elas aparecem como filtros nas Tabelas de Preço.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[200px_1fr] gap-3 min-h-[420px]">
          <ScrollArea className="h-[420px] border border-border rounded-md">
            <div className="p-1">
              {BRAND_CATEGORIES.map((c) => {
                const count = rows.filter((r) => r.category === c).length;
                return (
                  <button
                    key={c}
                    onClick={() => setActiveCat(c)}
                    className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between gap-2 ${
                      activeCat === c ? "bg-primary/15 text-foreground font-medium" : "hover:bg-muted/40"
                    }`}
                  >
                    <span className="truncate">{c}</span>
                    {count > 0 && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{count}</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground font-mono">
              {activeCat}
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto pr-1">
              {presetForCat.map((b) => (
                <label key={b} className="flex items-center gap-2 p-2 border border-border rounded hover:bg-muted/30 cursor-pointer">
                  <Checkbox checked={selectedForCat.has(b)} onCheckedChange={() => toggleBrand(b)} />
                  <span className="text-sm">{b}</span>
                </label>
              ))}
            </div>

            {customForCat.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Personalizadas</div>
                <div className="flex flex-wrap gap-1.5">
                  {customForCat.map((r) => (
                    <Badge key={r.id} variant="secondary" className="gap-1">
                      {r.brand}
                      <button onClick={() => toggleBrand(r.brand)} className="hover:text-danger">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-border">
              <Input
                placeholder="Adicionar marca personalizada…"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                className="h-9"
              />
              <Button type="button" size="sm" onClick={addCustom} disabled={!custom.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{loading ? "Carregando…" : "Fechar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}