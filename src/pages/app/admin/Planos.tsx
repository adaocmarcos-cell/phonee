import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Plan = { id: string; code: string; name: string; description: string | null; price_cents: number; max_installments: number; duration_months: number | null; active: boolean };

export default function Planos() {
  const [plans, setPlans] = useState<Plan[]>([]);

  const load = async () => {
    const { data } = await supabase.from("plans").select("*").order("price_cents");
    setPlans((data ?? []) as Plan[]);
  };
  useEffect(() => { load(); }, []);

  const save = async (p: Plan) => {
    const { error } = await supabase.from("plans").update({
      name: p.name, description: p.description, price_cents: p.price_cents,
      max_installments: p.max_installments, active: p.active,
    }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Plano atualizado");
    load();
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Planos</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <Card key={p.id} className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-mono tracking-widest text-muted-foreground uppercase">{p.code}</div>
                <div className="text-lg font-bold">{p.name}</div>
              </div>
              <Switch checked={p.active} onCheckedChange={(v) => setPlans(plans.map(x => x.id === p.id ? { ...x, active: v } : x))} />
            </div>
            <div className="space-y-2"><Label>Nome</Label><Input value={p.name} onChange={(e) => setPlans(plans.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))} /></div>
            <div className="space-y-2"><Label>Descrição</Label><Input value={p.description ?? ""} onChange={(e) => setPlans(plans.map(x => x.id === p.id ? { ...x, description: e.target.value } : x))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Preço (R$)</Label>
                <NumberInput value={p.price_cents / 100}
                  onValueChange={(n) => setPlans(plans.map(x => x.id === p.id ? { ...x, price_cents: Math.round((n || 0) * 100) } : x))} />
              </div>
              <div className="space-y-2">
                <Label>Máx. parcelas</Label>
                <NumberInput allowDecimal={false} min={1} emptyBehavior="min" value={p.max_installments}
                  onValueChange={(n) => setPlans(plans.map(x => x.id === p.id ? { ...x, max_installments: Math.min(12, Math.max(1, n)) } : x))} />
              </div>
            </div>
            <Button onClick={() => save(p)} className="w-full">Salvar</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}