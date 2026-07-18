import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/NumberInput";
import { Package, RefreshCw } from "lucide-react";
import { brl } from "@/lib/format";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  max_installments: number;
  duration_months: number | null;
  billing_period: string | null;
  display_order: number;
  active: boolean;
};

export default function PhoneePlanos() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("plans")
      .select("id,code,name,description,price_cents,max_installments,duration_months,billing_period,display_order,active")
      .order("display_order", { ascending: true });
    if (error) toast.error(error.message);
    setPlans((data as Plan[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const patchLocal = (id: string, patch: Partial<Plan>) =>
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const toggleActive = async (p: Plan, next: boolean) => {
    patchLocal(p.id, { active: next });
    const { error } = await supabase.from("plans").update({ active: next }).eq("id", p.id);
    if (error) {
      patchLocal(p.id, { active: !next });
      return toast.error(error.message);
    }
    toast.success(next ? `Plano "${p.name}" ativado` : `Plano "${p.name}" desativado`);
  };

  const save = async (p: Plan) => {
    if (!p.name?.trim()) return toast.error("Informe o nome do plano.");
    if (p.price_cents < 0) return toast.error("Preço inválido.");
    if (!p.max_installments || p.max_installments < 1 || p.max_installments > 12)
      return toast.error("Parcelas entre 1 e 12.");
    setSavingId(p.id);
    const { error } = await supabase
      .from("plans")
      .update({
        name: p.name,
        description: p.description,
        price_cents: p.price_cents,
        max_installments: p.max_installments,
      })
      .eq("id", p.id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success("Plano salvo");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-sky-400" /> Gestão de Planos
          </h1>
          <p className="text-sm text-slate-400">
            Ajuste preços, ative ou desative planos. Apenas planos ativos aparecem na página de vendas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="text-slate-500 py-10 text-center">Carregando…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card
              key={p.id}
              className={`p-5 space-y-3 border ${
                p.active
                  ? "border-emerald-500/40 bg-slate-900/60"
                  : "border-slate-700/60 bg-slate-900/40 opacity-90"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
                    {p.code} · {p.billing_period ?? "—"}
                  </div>
                  <div className="text-lg font-bold text-white">{p.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{brl(p.price_cents / 100)}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Switch checked={p.active} onCheckedChange={(v) => toggleActive(p, v)} />
                  <span className={`text-[10px] uppercase ${p.active ? "text-emerald-400" : "text-slate-500"}`}>
                    {p.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Nome</Label>
                <Input
                  value={p.name}
                  onChange={(e) => patchLocal(p.id, { name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Descrição</Label>
                <Textarea
                  rows={2}
                  value={p.description ?? ""}
                  onChange={(e) => patchLocal(p.id, { description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Preço (R$)</Label>
                  <NumberInput
                    value={p.price_cents / 100}
                    onValueChange={(n) =>
                      patchLocal(p.id, { price_cents: Math.round((n || 0) * 100) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Máx. parcelas</Label>
                  <NumberInput
                    allowDecimal={false}
                    min={1}
                    emptyBehavior="min"
                    value={p.max_installments}
                    onValueChange={(n) =>
                      patchLocal(p.id, { max_installments: Math.min(12, Math.max(1, n || 1)) })
                    }
                  />
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => save(p)}
                disabled={savingId === p.id}
              >
                {savingId === p.id ? "Salvando…" : "Salvar alterações"}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}