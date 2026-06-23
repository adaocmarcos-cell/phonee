import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/MetricCard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Wallet, TrendingUp, TrendingDown, Receipt, ArrowRight, Clock, CheckCircle2 } from "lucide-react";

type Sale = { id: string; total: number; created_at: string; status: string | null; payment_status: string | null };
type Expense = { id: string; amount: number; expense_date: string; description: string; category_name: string };

function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }

export default function Financeiro() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store) return;
    const load = async () => {
      setLoading(true);
      const from = startOfMonth().toISOString();
      const to = endOfMonth().toISOString();
      const [{ data: s }, { data: e }] = await Promise.all([
        supabase.from("sales").select("id,total,created_at,status,payment_status").eq("store_id", store.id).gte("created_at", from).lte("created_at", to),
        (supabase as any).from("expenses").select("id,amount,expense_date,description,category_name").eq("store_id", store.id).gte("expense_date", from.slice(0,10)).lte("expense_date", to.slice(0,10)),
      ]);
      setSales((s as any) ?? []);
      setExpenses((e as any) ?? []);
      setLoading(false);
    };
    load();
  }, [store]);

  const totals = useMemo(() => {
    const receita = sales.reduce((s, x) => s + Number(x.total || 0), 0);
    const recebido = sales.filter((x) => (x.payment_status ?? "").toLowerCase() === "pago").reduce((s, x) => s + Number(x.total || 0), 0);
    const aReceber = receita - recebido;
    const despesa = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
    const liquido = receita - despesa;
    return { receita, recebido, aReceber, despesa, liquido };
  }, [sales, expenses]);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Visão consolidada de receitas, despesas e resultado do mês."
      />

      {/* CTA Custos & Despesas — sincronizado com Financeiro */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <button
          type="button"
          onClick={() => navigate("/app/despesas")}
          className="sm:col-span-2 lg:col-span-2 rounded-xl bg-gradient-to-br from-rose-500 via-red-600 to-red-700 text-white shadow-glow hover:brightness-110 transition-all border border-red-500/60 px-6 py-5 flex items-center justify-between gap-3 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <span className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Custos & Despesas
          </span>
          <span className="flex items-center gap-2 text-sm font-normal text-white/90">
            {loading ? "…" : brl(totals.despesa)} no mês
            <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Receita do mês" value={brl(totals.receita)} delta={`${sales.length} venda(s)`} icon={TrendingUp} tone="info" className="py-[18px]" />
        <MetricCard label="Recebido" value={brl(totals.recebido)} delta="Vendas pagas" icon={CheckCircle2} tone="success" className="py-[18px]" />
        <MetricCard label="A receber" value={brl(totals.aReceber)} delta="Em aberto" icon={Clock} tone="warning" className="py-[18px]" />
        <MetricCard label="Despesas" value={brl(totals.despesa)} delta={`${expenses.length} lançamento(s)`} icon={TrendingDown} tone="danger" className="py-[18px]" />
      </div>

      <Card className="p-5 mb-4 bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 text-white border-emerald-500/60 shadow-glow">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-white/20 flex items-center justify-center"><Wallet className="h-5 w-5" /></div>
            <div>
              <div className="text-xs uppercase tracking-widest font-mono font-semibold text-white/85">Resultado líquido do mês</div>
              <div className="metric text-4xl md:text-[2.5rem] font-bold leading-tight">{brl(totals.liquido)}</div>
            </div>
          </div>
          <div className="text-xs text-white/85 font-mono">
            Receita {brl(totals.receita)} − Despesas {brl(totals.despesa)}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Últimas vendas</span>
            <Button variant="ghost" size="sm" onClick={() => navigate("/app/vendas")}>Ver todas <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
          </div>
          <div className="divide-y divide-border max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground font-mono">CARREGANDO…</div>
            ) : sales.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma venda no período.</div>
            ) : sales.slice(0, 10).map((s) => (
              <div key={s.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-mono text-xs">{new Date(s.created_at).toLocaleDateString("pt-BR")}</span>
                <span className="metric font-semibold">{brl(Number(s.total || 0))}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-card border-border shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest font-mono text-muted-foreground">Últimas despesas</span>
            <Button variant="ghost" size="sm" onClick={() => navigate("/app/despesas")}>Gerenciar <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
          </div>
          <div className="divide-y divide-border max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground font-mono">CARREGANDO…</div>
            ) : expenses.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma despesa no período.</div>
            ) : expenses.slice(0, 10).map((e) => (
              <div key={e.id} className="px-4 py-2.5 flex items-center justify-between text-sm gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{e.description}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{e.category_name} · {new Date(e.expense_date).toLocaleDateString("pt-BR")}</div>
                </div>
                <span className="metric font-semibold text-danger">{brl(Number(e.amount || 0))}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}