import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeftRight, Package, ShoppingCart, Wrench, ArrowRightLeft, Clock, Database, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { brl } from "@/lib/format";

type Event = {
  event_at: string;
  event_type: "trade_in" | "produto" | "venda" | "os" | "movimento";
  ref_id: string;
  label: string;
  details: any;
};

const ICON: Record<Event["event_type"], JSX.Element> = {
  trade_in: <ArrowLeftRight className="h-4 w-4" />,
  produto: <Package className="h-4 w-4" />,
  venda: <ShoppingCart className="h-4 w-4" />,
  os: <Wrench className="h-4 w-4" />,
  movimento: <ArrowRightLeft className="h-4 w-4" />,
};

const LABEL: Record<Event["event_type"], string> = {
  trade_in: "Compra e Troca",
  produto: "Estoque",
  venda: "Venda",
  os: "Ordem de Serviço",
  movimento: "Movimento de estoque",
};

export default function RastreioImei() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [imei, setImei] = useState("");
  const [events, setEvents] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async (override?: string) => {
    if (!store) return;
    const raw = override ?? imei;
    const value = raw.replace(/\D/g, "");
    if (value.length !== 15) return toast.error("IMEI deve ter 15 dígitos");
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("track_device_by_imei", {
      _store_id: store.id,
      _imei: value,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setEvents((data ?? []) as Event[]);
    setParams({ imei: value }, { replace: true });
  };

  // Auto search when landing with ?imei=...
  useEffect(() => {
    const q = params.get("imei");
    if (q && q.length === 15 && store && events === null) {
      setImei(q);
      search(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const goTo = (e: Event) => {
    if (e.event_type === "trade_in") navigate(`/painel/troca/${e.ref_id}/detalhes`);
    else if (e.event_type === "produto") navigate(`/painel/estoque/${e.ref_id}`);
    else if (e.event_type === "venda") navigate(`/painel/vendas/${e.ref_id}/editar`);
    else if (e.event_type === "os") navigate(`/painel/ordens/${e.ref_id}`);
    else if (e.event_type === "movimento") navigate(`/painel/estoque/movimentacao`);
  };

  const summary = events && events.length > 0 ? (() => {
    const first = events[0];
    const last = events[events.length - 1];
    const tradeIn = events.find((e) => e.event_type === "trade_in");
    const produto = events.find((e) => e.event_type === "produto");
    const venda = events.find((e) => e.event_type === "venda");
    const custoEntrada = Number(tradeIn?.details?.entry_value || 0);
    const custoReparos = Number(tradeIn?.details?.repair_costs || 0);
    const custoTotal = Number(produto?.details?.cost || custoEntrada + custoReparos);
    const totalVenda = Number(venda?.details?.total || 0);
    const custoEsperado = custoEntrada + custoReparos;
    const custoCadastrado = Number(produto?.details?.cost || 0);
    const diverge = tradeIn && produto ? Math.abs(custoEsperado - custoCadastrado) > 0.5 : false;
    return {
      first: new Date(first.event_at).toLocaleDateString("pt-BR"),
      last: new Date(last.event_at).toLocaleDateString("pt-BR"),
      custoTotal, totalVenda, tradeIn, produto, venda,
      custoEntrada, custoReparos, custoEsperado, custoCadastrado, diverge,
      count: events.length,
    };
  })() : null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <PageHeader
        title="Rastreio por IMEI"
        description="Veja a linha do tempo completa de um aparelho: entrada, estoque, venda e OS."
      />
      <Card className="p-4 flex gap-2">
        <Input
          value={imei}
          onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
          placeholder="Digite o IMEI (15 dígitos)"
          inputMode="numeric"
          maxLength={15}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <Button onClick={() => search()} disabled={loading}>
          <Search className="h-4 w-4 mr-1" /> Buscar
        </Button>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-widest">Eventos</div>
            <div className="text-xl font-bold">{summary.count}</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" /> {summary.first} → {summary.last}
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-widest">Custo total (entrada + reparos)</div>
            <div className="text-xl font-bold">{brl(summary.custoTotal)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Entrada {brl(Number(summary.tradeIn?.details?.entry_value || 0))} · Reparos {brl(Number(summary.tradeIn?.details?.repair_costs || 0))}
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-widest">Venda</div>
            <div className="text-xl font-bold">{summary.venda ? brl(summary.totalVenda) : "—"}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {summary.venda ? `Cliente: ${summary.venda.details?.customer || "—"}` : "Aparelho ainda não vendido"}
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-widest">Lucro estimado</div>
            <div className={`text-xl font-bold ${summary.venda && summary.totalVenda - summary.custoTotal >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {summary.venda ? brl(summary.totalVenda - summary.custoTotal) : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Venda − (entrada + Σ reparos)
            </div>
          </Card>
        </div>
      )}

      {events !== null && (
        <Card className="p-4">
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              Nenhum evento encontrado para este IMEI.
            </div>
          ) : (
            <ol className="relative border-l-2 border-border ml-1 space-y-4 pl-4">
              {events.map((e, i) => (
                <li key={`${e.event_type}-${e.ref_id}-${i}`} className="relative">
                  <span className="absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                    {ICON[e.event_type]}
                  </span>
                  <button
                    onClick={() => goTo(e)}
                    className="text-left w-full hover:bg-muted/40 rounded-md p-2 -m-2 transition"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{LABEL[e.event_type]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.event_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="text-sm font-medium mt-1">{e.label}</div>
                    {e.details && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {Object.entries(e.details)
                          .filter(([, v]) => v !== null && v !== undefined && v !== "")
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {summary && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <div className="font-semibold text-sm">Detalhes do cálculo</div>
            {summary.diverge && (
              <Badge variant="destructive" className="ml-auto gap-1">
                <AlertTriangle className="h-3 w-3" /> Divergência detectada
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Cada linha mostra a origem exata (tabela.coluna) usada nos cálculos exibidos acima.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1 pr-3 font-medium">Campo</th>
                  <th className="py-1 pr-3 font-medium">Origem</th>
                  <th className="py-1 pr-3 font-medium">Função</th>
                  <th className="py-1 pr-3 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="[&_tr]:border-b [&_tr:last-child]:border-0">
                <tr>
                  <td className="py-1.5 pr-3">Valor de entrada</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">trade_ins.entry_value</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">create_trade_in</td>
                  <td className="py-1.5 pr-3 text-right font-medium">{brl(summary.custoEntrada)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3">Σ Custos de reparo</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">trade_ins.repair_costs</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">add_tradein_repair_cost</td>
                  <td className="py-1.5 pr-3 text-right font-medium">{brl(summary.custoReparos)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3">Custo esperado (entrada + reparos)</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">— cálculo —</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">tg_tradein_sync_product_cost</td>
                  <td className="py-1.5 pr-3 text-right font-medium">{brl(summary.custoEsperado)}</td>
                </tr>
                <tr className={summary.diverge ? "bg-destructive/5" : ""}>
                  <td className="py-1.5 pr-3">Custo no estoque</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">products.cost_price</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">tg_tradein_to_product</td>
                  <td className={`py-1.5 pr-3 text-right font-medium ${summary.diverge ? "text-destructive" : ""}`}>
                    {summary.produto ? brl(summary.custoCadastrado) : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3">Preço de venda</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">sale_items.total</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">create_sale</td>
                  <td className="py-1.5 pr-3 text-right font-medium">{summary.venda ? brl(summary.totalVenda) : "—"}</td>
                </tr>
                <tr className="bg-muted/40">
                  <td className="py-1.5 pr-3 font-semibold">Lucro estimado (venda − custo esperado)</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">— cálculo —</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">frontend</td>
                  <td className={`py-1.5 pr-3 text-right font-semibold ${summary.venda && summary.totalVenda - summary.custoEsperado >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {summary.venda ? brl(summary.totalVenda - summary.custoEsperado) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {summary.diverge && (
            <div className="text-xs bg-destructive/10 text-destructive rounded-md p-2 border border-destructive/20">
              O custo cadastrado em <span className="font-mono">products.cost_price</span> difere do esperado por
              <span className="font-semibold"> {brl(Math.abs(summary.custoEsperado - summary.custoCadastrado))}</span>.
              Isso normalmente indica edição manual do produto ou reparo lançado após a venda. Verifique
              <span className="font-mono"> trade_ins.repair_parts</span> e a trilha de <span className="font-mono">stock_movements</span>.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}