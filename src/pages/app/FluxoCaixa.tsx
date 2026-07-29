import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/MetricCard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { AlertTriangle, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";

type Day = {
  data: string; entradas: number; entradas_cartao: number; entradas_crediario: number;
  saidas: number; liquido: number; acumulado: number;
};
type Projection = {
  saldo_inicial: number; dias: Day[]; total_entradas: number; total_saidas: number;
  saldo_final: number; primeiro_dia_negativo: string | null;
};

const RANGES = [30, 60, 90];

export default function FluxoCaixa() {
  const { store } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Projection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store) return;
    setLoading(true);
    (supabase as any)
      .rpc("cash_flow_projection", { _store_id: store.id, _days: days })
      .then(({ data: d }: any) => {
        setData(d ?? null);
        setLoading(false);
      });
  }, [store, days]);

  const chart = useMemo(
    () =>
      (data?.dias ?? []).map((d) => ({
        dia: new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        acumulado: Number(d.acumulado),
        entradas: Number(d.entradas),
        saidas: Number(d.saidas),
      })),
    [data]
  );

  const negativo = data?.primeiro_dia_negativo
    ? new Date(data.primeiro_dia_negativo + "T00:00:00").toLocaleDateString("pt-BR")
    : null;
  const negIndex = data?.primeiro_dia_negativo
    ? (data.dias ?? []).findIndex((d) => d.data === data.primeiro_dia_negativo)
    : -1;

  return (
    <div>
      <PageHeader
        title="Fluxo de caixa projetado"
        description="Entradas previstas (crediário e cartão) menos as contas a pagar, dia a dia."
        actions={
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Button key={r} size="sm" variant={days === r ? "default" : "outline"} onClick={() => setDays(r)}>
                {r} dias
              </Button>
            ))}
          </div>
        }
      />

      {negativo && (
        <Card className="p-4 mb-4 border-danger/40 bg-danger/5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-danger">Seu caixa fica negativo em {negativo}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Considerando o saldo atual de caixa, os recebimentos previstos e as contas já lançadas.
              Antecipe recebíveis ou renegocie vencimentos antes dessa data.
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Saldo atual em caixa" value={brl(data?.saldo_inicial ?? 0)} delta="Caixa aberto + movimentos" icon={Wallet} tone="info" />
        <MetricCard label="Entradas previstas" value={brl(data?.total_entradas ?? 0)} delta={`Próximos ${days} dias`} icon={TrendingUp} tone="success" />
        <MetricCard label="Saídas previstas" value={brl(data?.total_saidas ?? 0)} delta="Contas a pagar em aberto" icon={TrendingDown} tone="danger" />
        <MetricCard
          label="Saldo projetado"
          value={brl(data?.saldo_final ?? 0)}
          delta={`Em ${days} dias`}
          icon={Wallet}
          tone={(data?.saldo_final ?? 0) >= 0 ? "success" : "danger"}
        />
      </div>

      <Card className="p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Saldo acumulado projetado</h3>
        {loading ? (
          <div className="h-[300px] flex items-center justify-center text-xs font-mono text-muted-foreground">CARREGANDO…</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="fluxo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => brl(Number(v))} width={90} />
              <Tooltip
                formatter={(v: any, n: any) => [brl(Number(v)), n === "acumulado" ? "Saldo" : n]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
              {negIndex >= 0 && chart[negIndex] && (
                <ReferenceLine x={chart[negIndex].dia} stroke="hsl(var(--destructive))" label={{ value: "negativo", fontSize: 10, fill: "hsl(var(--destructive))" }} />
              )}
              <Area type="monotone" dataKey="acumulado" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#fluxo)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-widest font-mono text-muted-foreground">
          Detalhe por dia (apenas dias com movimento)
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Data</th>
                <th className="text-right px-4 py-2 font-medium">Crediário</th>
                <th className="text-right px-4 py-2 font-medium">Cartão</th>
                <th className="text-right px-4 py-2 font-medium">Saídas</th>
                <th className="text-right px-4 py-2 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data?.dias ?? []).filter((d) => Number(d.entradas) !== 0 || Number(d.saidas) !== 0).map((d) => (
                <tr key={d.data} className="hover:bg-surface-elevated/40">
                  <td className="px-4 py-2 font-mono text-xs">{new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-2 text-right text-xs">{brl(Number(d.entradas_crediario))}</td>
                  <td className="px-4 py-2 text-right text-xs">{brl(Number(d.entradas_cartao))}</td>
                  <td className="px-4 py-2 text-right text-xs text-danger">{brl(Number(d.saidas))}</td>
                  <td className={`px-4 py-2 text-right metric font-semibold ${Number(d.acumulado) < 0 ? "text-danger" : ""}`}>{brl(Number(d.acumulado))}</td>
                </tr>
              ))}
              {!loading && (data?.dias ?? []).every((d) => Number(d.entradas) === 0 && Number(d.saidas) === 0) && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sem movimentos previstos no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}