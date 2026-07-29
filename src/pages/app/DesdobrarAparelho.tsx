import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/NumberInput";
import { ArrowLeft, Split, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

type Device = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  color: string | null;
  storage_gb: number | null;
  cost_price: number;
  sale_price: number;
  stock_current: number;
};

type UnitDraft = { imei: string; imei2: string; color: string; storage_gb: string; battery_health: string; cost_price: string };

const luhnOk = (v: string) => {
  if (!/^\d{15}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(v[14 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

export default function DesdobrarAparelho() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Device | null>(null);
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id,name,sku,brand,color,storage_gb,cost_price,sale_price,stock_current")
      .eq("store_id", store.id)
      .eq("item_kind", "aparelho")
      .gt("stock_current", 1)
      .order("name");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setDevices((data ?? []) as Device[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [store?.id]);

  const startSplit = (d: Device) => {
    setSelected(d);
    setUnits(Array.from({ length: d.stock_current }, () => ({
      imei: "", imei2: "", color: d.color ?? "", storage_gb: d.storage_gb ? String(d.storage_gb) : "",
      battery_health: "", cost_price: String(d.cost_price ?? 0),
    })));
  };

  const setUnit = (i: number, patch: Partial<UnitDraft>) =>
    setUnits((prev) => prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));

  const problems = useMemo(() => {
    const errs: string[] = [];
    const seen = new Set<string>();
    units.forEach((u, i) => {
      const v = u.imei.trim();
      if (!v) { errs.push(`Unidade ${i + 1}: informe o IMEI`); return; }
      if (!luhnOk(v)) errs.push(`Unidade ${i + 1}: IMEI inválido (15 dígitos + dígito verificador)`);
      if (seen.has(v)) errs.push(`Unidade ${i + 1}: IMEI repetido nesta tela`);
      seen.add(v);
    });
    return errs;
  }, [units]);

  const submit = async () => {
    if (!selected) return;
    if (problems.length) { toast.error(problems[0]); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc("split_device_units", {
      _product_id: selected.id,
      _units: units.map((u) => ({
        imei: u.imei.trim(),
        imei2: u.imei2.trim(),
        color: u.color.trim(),
        storage_gb: u.storage_gb,
        battery_health: u.battery_health,
        cost_price: u.cost_price,
      })),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${units.length} unidades criadas com sucesso`);
    setSelected(null);
    setUnits([]);
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Desdobrar aparelhos"
        description="Aparelhos precisam de uma ficha por unidade para rastrear IMEI, custo e garantia."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/painel/estoque")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Estoque
          </Button>
        }
      />

      {!selected ? (
        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : devices.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-2" />
              <p className="text-sm font-medium">Nenhum aparelho com quantidade maior que 1</p>
              <p className="text-xs text-muted-foreground">Cada aparelho já possui ficha individual.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {devices.map((d) => (
                <div key={d.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.sku || "sem SKU"} · custo {brl(d.cost_price)} · venda {brl(d.sale_price)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{d.stock_current} unidades</Badge>
                    <Button size="sm" onClick={() => startSplit(d)}>
                      <Split className="h-4 w-4 mr-1" /> Desdobrar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{selected.name}</div>
                <p className="text-xs text-muted-foreground">
                  Serão criadas {units.length} fichas com 1 unidade cada. A primeira mantém o cadastro original.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Cancelar</Button>
            </div>
          </Card>

          {units.map((u, i) => (
            <Card key={i} className="p-4 space-y-3">
              <div className="text-sm font-semibold">Unidade {i + 1}{i === 0 ? " (cadastro original)" : ""}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="text-xs">IMEI *</Label>
                  <Input
                    value={u.imei}
                    inputMode="numeric"
                    maxLength={15}
                    placeholder="15 dígitos"
                    onChange={(e) => setUnit(i, { imei: e.target.value.replace(/\D/g, "") })}
                    className={u.imei && !luhnOk(u.imei) ? "border-destructive" : ""}
                  />
                </div>
                <div>
                  <Label className="text-xs">IMEI 2</Label>
                  <Input value={u.imei2} inputMode="numeric" maxLength={15}
                    onChange={(e) => setUnit(i, { imei2: e.target.value.replace(/\D/g, "") })} />
                </div>
                <div>
                  <Label className="text-xs">Cor</Label>
                  <Input value={u.color} onChange={(e) => setUnit(i, { color: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Custo</Label>
                  <NumberInput
                    value={Number(u.cost_price || 0)}
                    onValueChange={(v) => setUnit(i, { cost_price: String(v ?? 0) })}
                  />
                </div>
              </div>
            </Card>
          ))}

          {problems.length > 0 && (
            <Card className="p-4 border-warning/40">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <div>
                  <div className="font-medium">Ajuste antes de concluir</div>
                  <ul className="text-xs text-muted-foreground list-disc pl-4 mt-1">
                    {problems.slice(0, 5).map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          <div className="flex justify-end gap-2 pb-8">
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || problems.length > 0}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Split className="h-4 w-4 mr-1" />}
              Concluir desdobramento
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
