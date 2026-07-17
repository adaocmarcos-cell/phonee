import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/NumberInput";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Percent, Plus, Trash2, DollarSign, Save } from "lucide-react";

type Rule = {
  id?: string;
  store_id: string;
  applies_to: "vendedor" | "tecnico";
  scope: "geral" | "categoria" | "produto" | "servico";
  scope_ref: string | null;
  type: "percentual" | "fixo";
  value: number;
  base: "venda_bruta" | "lucro" | "mao_de_obra" | "total_os";
  is_active: boolean;
};

const defaultRule = (store_id: string, applies_to: "vendedor" | "tecnico"): Rule => ({
  store_id,
  applies_to,
  scope: "geral",
  scope_ref: null,
  type: "percentual",
  value: applies_to === "vendedor" ? 3 : 10,
  base: applies_to === "vendedor" ? "venda_bruta" : "mao_de_obra",
  is_active: true,
});

export function CommissionRulesSettings() {
  const { store, role } = useAuth();
  const canEdit = role === "dono" || role === "gerente";
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("commission_rules")
      .select("*")
      .eq("store_id", store.id)
      .order("applies_to")
      .order("scope");
    if (error) toast.error(error.message);
    else setRules((data as Rule[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [store?.id]);

  const addRule = (applies_to: "vendedor" | "tecnico") => {
    if (!store) return;
    setRules((prev) => [...prev, defaultRule(store.id, applies_to)]);
  };

  const updateRule = (idx: number, patch: Partial<Rule>) => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const saveRule = async (idx: number) => {
    const r = rules[idx];
    const payload = {
      store_id: r.store_id,
      applies_to: r.applies_to,
      scope: r.scope,
      scope_ref: r.scope_ref || null,
      type: r.type,
      value: r.value,
      base: r.base,
      is_active: r.is_active,
    };
    if (r.id) {
      const { error } = await (supabase as any).from("commission_rules").update(payload).eq("id", r.id);
      if (error) return toast.error(error.message);
      toast.success("Regra atualizada");
    } else {
      const { data, error } = await (supabase as any).from("commission_rules").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      updateRule(idx, { id: data.id });
      toast.success("Regra criada");
    }
  };

  const removeRule = async (idx: number) => {
    const r = rules[idx];
    if (r.id) {
      const { error } = await (supabase as any).from("commission_rules").delete().eq("id", r.id);
      if (error) return toast.error(error.message);
    }
    setRules((prev) => prev.filter((_, i) => i !== idx));
    toast.success("Regra removida");
  };

  const RuleRow = ({ r, idx }: { r: Rule; idx: number }) => {
    const baseOpts =
      r.applies_to === "vendedor"
        ? [["venda_bruta", "Venda bruta"], ["lucro", "Lucro"]]
        : [["mao_de_obra", "Mão de obra"], ["total_os", "Total da OS"]];
    const scopeOpts =
      r.applies_to === "vendedor"
        ? [["geral", "Geral"], ["categoria", "Categoria"], ["produto", "Produto"]]
        : [["geral", "Geral"], ["servico", "Serviço (motivo)"]];
    return (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 border border-border rounded-md bg-card/50">
        <div className="md:col-span-2">
          <Label className="text-xs">Escopo</Label>
          <Select value={r.scope} onValueChange={(v) => updateRule(idx, { scope: v as Rule["scope"], scope_ref: null })} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{scopeOpts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-3">
          <Label className="text-xs">Referência</Label>
          <Input
            value={r.scope_ref ?? ""}
            onChange={(e) => updateRule(idx, { scope_ref: e.target.value || null })}
            placeholder={r.scope === "geral" ? "—" : r.scope === "produto" ? "UUID do produto" : r.scope === "categoria" ? "aparelho_seminovo, peca…" : "Motivo da OS"}
            disabled={!canEdit || r.scope === "geral"}
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Base</Label>
          <Select value={r.base} onValueChange={(v) => updateRule(idx, { base: v as Rule["base"] })} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{baseOpts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={r.type} onValueChange={(v) => updateRule(idx, { type: v as Rule["type"] })} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentual">%</SelectItem>
              <SelectItem value="fixo">R$</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">{r.type === "percentual" ? "Percentual" : "Valor"}</Label>
          <NumberInput
            value={r.value}
            onValueChange={(v) => updateRule(idx, { value: Number(v || 0) })}
            allowDecimal
            disabled={!canEdit}
          />
        </div>
        <div className="md:col-span-1 flex items-center gap-2">
          <Switch checked={r.is_active} onCheckedChange={(v) => updateRule(idx, { is_active: !!v })} disabled={!canEdit} />
          <span className="text-xs">Ativa</span>
        </div>
        <div className="md:col-span-1 flex gap-1 justify-end">
          <Button size="icon" variant="ghost" onClick={() => saveRule(idx)} disabled={!canEdit} title="Salvar">
            <Save className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => removeRule(idx)} disabled={!canEdit} title="Remover">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };

  const sellerRules = rules.filter((r) => r.applies_to === "vendedor");
  const techRules = rules.filter((r) => r.applies_to === "tecnico");

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-start gap-3 mb-4">
        <Percent className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold">Regras de comissão</h3>
          <p className="text-xs text-muted-foreground">
            Regras mais específicas (produto/serviço) prevalecem sobre gerais. Aplicadas automaticamente ao concluir vendas ou entregar OS.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Vendedores</h4>
            <Button size="sm" variant="outline" onClick={() => addRule("vendedor")} disabled={!canEdit}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
          <div className="space-y-2">
            {sellerRules.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma regra cadastrada.</p>}
            {rules.map((r, idx) => (r.applies_to === "vendedor" ? <RuleRow key={r.id ?? `n-${idx}`} r={r} idx={idx} /> : null))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Técnicos</h4>
            <Button size="sm" variant="outline" onClick={() => addRule("tecnico")} disabled={!canEdit}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
          <div className="space-y-2">
            {techRules.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma regra cadastrada.</p>}
            {rules.map((r, idx) => (r.applies_to === "tecnico" ? <RuleRow key={r.id ?? `n-${idx}`} r={r} idx={idx} /> : null))}
          </div>
        </div>
      </div>
    </Card>
  );
}