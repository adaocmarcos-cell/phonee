import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { NumberInput } from "@/components/NumberInput";
import { MetricCard } from "@/components/MetricCard";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { brl } from "@/lib/format";
import { Target, Plus, Trash2, TrendingUp, Trophy, CalendarDays } from "lucide-react";

type Goal = {
  id: string; metric: string; seller_id: string | null; seller_name: string | null;
  target_value: number; realizado: number; progresso_pct: number;
};
type Seller = { user_id: string; full_name: string | null; role: string };

const METRICS: { key: string; label: string; money: boolean; hint: string }[] = [
  { key: "faturamento", label: "Faturamento", money: true, hint: "Vendas do mês menos devoluções" },
  { key: "lucro", label: "Lucro bruto", money: true, hint: "Venda menos custo dos itens" },
  { key: "vendas_qtd", label: "Quantidade de vendas", money: false, hint: "Número de vendas fechadas" },
  { key: "ticket_medio", label: "Ticket médio", money: true, hint: "Média por venda no mês" },
  { key: "os_qtd", label: "Ordens de serviço", money: false, hint: "OS abertas no mês (exceto canceladas)" },
];

const monthStart = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

const fmt = (metric: string, v: number) =>
  METRICS.find((m) => m.key === metric)?.money ? brl(Number(v)) : String(Math.round(Number(v)));

export default function Metas() {
  const { store } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(monthStart());
  const [goals, setGoals] = useState<Goal[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [metric, setMetric] = useState("faturamento");
  const [sellerId, setSellerId] = useState("loja");
  const [target, setTarget] = useState(0);

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const [{ data: prog }, { data: sel }] = await Promise.all([
      (supabase as any).rpc("goals_progress", { _store_id: store.id, _month: month }),
      (supabase as any).rpc("get_store_sellers", { _store_id: store.id }),
    ]);
    setGoals(((prog as any)?.metas ?? []) as Goal[]);
    setSellers((sel as Seller[]) ?? []);
    setLoading(false);
  }, [store, month]);

  useEffect(() => { load(); }, [load]);

  const storeGoals = useMemo(() => goals.filter((g) => !g.seller_id), [goals]);
  const sellerGoals = useMemo(() => goals.filter((g) => g.seller_id), [goals]);

  const resumo = useMemo(() => {
    const batidas = goals.filter((g) => g.progresso_pct >= 100).length;
    const media = goals.length ? Math.round(goals.reduce((s, g) => s + Number(g.progresso_pct), 0) / goals.length) : 0;
    const fat = storeGoals.find((g) => g.metric === "faturamento");
    return { batidas, media, fat };
  }, [goals, storeGoals]);

  const save = async () => {
    if (!store) return;
    if (target <= 0) { toast({ title: "Informe um valor de meta", variant: "destructive" }); return; }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("store_goals").upsert(
      {
        store_id: store.id, period_month: month, metric,
        seller_id: sellerId === "loja" ? null : sellerId,
        target_value: target, created_by: userRes?.user?.id ?? null,
      },
      { onConflict: sellerId === "loja" ? "store_id,period_month,metric" : "store_id,period_month,metric,seller_id" },
    );
    setSaving(false);
    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Meta definida" });
    setOpen(false); setTarget(0); load();
  };

  const remove = async (g: Goal) => {
    const { error } = await (supabase as any).from("store_goals").delete().eq("id", g.id);
    if (error) { toast({ title: "Sem permissão", description: error.message, variant: "destructive" }); return; }
    setGoals((p) => p.filter((x) => x.id !== g.id));
  };

  const GoalRow = ({ g }: { g: Goal }) => {
    const pct = Math.min(Number(g.progresso_pct), 100);
    const done = Number(g.progresso_pct) >= 100;
    return (
      <Card className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{METRICS.find((m) => m.key === g.metric)?.label ?? g.metric}</p>
            {g.seller_id && <p className="text-xs text-muted-foreground">{g.seller_name || "Vendedor"}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={done ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}>
              {Number(g.progresso_pct).toFixed(0)}%
            </Badge>
            <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => remove(g)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Progress value={pct} />
        <p className="text-sm text-muted-foreground">
          {fmt(g.metric, g.realizado)} de {fmt(g.metric, g.target_value)}
          {!done && <> · faltam <b className="text-foreground">{fmt(g.metric, Math.max(Number(g.target_value) - Number(g.realizado), 0))}</b></>}
        </p>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas"
        description="Defina metas mensais da loja e por vendedor. O realizado é calculado direto das vendas e ordens de serviço."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Definir meta</Button>}
      />

      <Card className="p-3 flex items-center gap-3 flex-wrap">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm">Mês</Label>
        <input
          type="month"
          className="border rounded-md px-3 py-1.5 text-sm bg-background"
          value={month.slice(0, 7)}
          onChange={(e) => setMonth(`${e.target.value}-01`)}
        />
      </Card>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Metas batidas" value={`${resumo.batidas}/${goals.length}`} delta="No mês selecionado" icon={Trophy} tone="success" />
        <MetricCard label="Progresso médio" value={`${resumo.media}%`} delta="Média de todas as metas" icon={TrendingUp} />
        <MetricCard
          label="Faturamento da loja"
          value={resumo.fat ? brl(Number(resumo.fat.realizado)) : "—"}
          delta={resumo.fat ? `Meta ${brl(Number(resumo.fat.target_value))}` : "Sem meta definida"}
          icon={Target}
          tone="info"
        />
      </div>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Carregando…</Card>
      ) : goals.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Target className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">Nenhuma meta definida para este mês</p>
          <p className="text-sm text-muted-foreground">Defina uma meta de faturamento e acompanhe o time em tempo real.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {storeGoals.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Metas da loja</h3>
              <div className="grid gap-3 md:grid-cols-2">{storeGoals.map((g) => <GoalRow key={g.id} g={g} />)}</div>
            </div>
          )}
          {sellerGoals.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Metas por pessoa</h3>
              <div className="grid gap-3 md:grid-cols-2">{sellerGoals.map((g) => <GoalRow key={g.id} g={g} />)}</div>
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir meta</DialogTitle>
            <DialogDescription>
              Meta para {new Date(month + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Indicador</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{METRICS.find((m) => m.key === metric)?.hint}</p>
            </div>
            <div>
              <Label>Aplicar a</Label>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loja">Loja inteira</SelectItem>
                  {sellers.map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name || "Sem nome"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor da meta</Label>
              <NumberInput
                value={target}
                onValueChange={setTarget}
                allowDecimal={METRICS.find((m) => m.key === metric)?.money ?? true}
                min={0}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar meta"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
