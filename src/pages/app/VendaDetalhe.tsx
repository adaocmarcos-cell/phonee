import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeCost, canRegisterSale } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { handleSupabaseError } from "@/lib/supabaseFetch";
import { ArrowLeft, Pencil, Printer, Receipt, RotateCcw, Smartphone, Boxes, CreditCard, Undo2, CalendarClock } from "lucide-react";

const fmtNum = (n: number | null | undefined) => `#${String(n ?? 0).padStart(4, "0")}`;
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const d = (v?: string | null) => (v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—");

type Section = { title: string; icon: any; children: React.ReactNode };

function Block({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

export default function VendaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { store, role } = useAuth();
  const showCost = canSeeCost(role);

  const [loading, setLoading] = useState(true);
  const [sale, setSale] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [tradeIns, setTradeIns] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: s, error } = await supabase.from("sales").select("*").eq("id", id).maybeSingle();
      if (error) { handleSupabaseError(error, "Erro ao carregar a venda"); setLoading(false); return; }
      if (cancelled) return;
      setSale(s ?? null);
      if (!s) { setLoading(false); return; }

      const [it, pay, ti, rec, ret, mov] = await Promise.all([
        supabase.from("sale_items").select("*").eq("sale_id", id),
        (supabase as any).from("sale_payments").select("*").eq("sale_id", id).order("created_at"),
        (supabase as any).from("trade_ins").select("id, brand, model, imei, condition, entry_value, status, product_id").eq("received_in_sale_id", id),
        (supabase as any).from("sale_receivables").select("*").eq("sale_id", id).order("installment_number"),
        (supabase as any).from("sale_returns").select("*").eq("sale_id", id).order("created_at", { ascending: false }),
        (supabase as any).from("stock_movements").select("*").eq("origin_table", "sales").eq("origin_id", id).order("occurred_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setItems((it.data as any[]) ?? []);
      setPayments((pay.data as any[]) ?? []);
      setTradeIns((ti.data as any[]) ?? []);
      setReceivables((rec.data as any[]) ?? []);
      setReturns((ret.data as any[]) ?? []);
      setMovements((mov.data as any[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const totals = useMemo(() => {
    const bruto = items.reduce((a, i) => a + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
    const descItens = items.reduce((a, i) => a + Number(i.discount_amount || 0), 0);
    const custo = items.reduce((a, i) => a + Number(i.unit_cost || 0) * Number(i.quantity || 0), 0);
    const liquido = Number(sale?.net_value ?? sale?.total ?? 0);
    const margem = liquido > 0 ? ((liquido - custo) / liquido) * 100 : 0;
    return { bruto, descItens, custo, liquido, margem };
  }, [items, sale]);

  const reversed = String(sale?.status ?? "ativa") === "estornada";

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando venda…</div>;
  if (!sale) {
    return (
      <div className="p-8 text-center">
        <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Venda não encontrada ou sem permissão de acesso.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/painel/vendas")}>Voltar para Vendas</Button>
      </div>
    );
  }

  return (
    <div className="lg:text-[90%] space-y-4">
      <PageHeader
        title={`Venda ${fmtNum(sale.sale_number)}`}
        description={`Registrada em ${dt(sale.created_at)}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => navigate("/painel/vendas")}>
              <ArrowLeft className="h-4 w-4 mr-1" />Voltar
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />Imprimir
            </Button>
            {!reversed && canRegisterSale(role) && (
              <Button variant="outline" onClick={() => navigate(`/painel/vendas/${sale.id}/editar`)}>
                <Pencil className="h-4 w-4 mr-1" />Editar
              </Button>
            )}
          </div>
        }
      />

      {reversed && (
        <Card className="p-4 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-2">
            <RotateCcw className="h-4 w-4 text-danger mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-danger">Venda estornada em {dt(sale.reversed_at)}</p>
              {sale.reversal_reason && <p className="text-muted-foreground mt-1">Motivo: {sale.reversal_reason}</p>}
              <p className="text-xs text-muted-foreground mt-1">O registro é mantido no histórico, mas não entra no faturamento nem nos relatórios.</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Block title="Cabeçalho" icon={Receipt}>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cliente</dt><dd className="text-right">{sale.customer_name || "Avulso"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Documento</dt><dd className="font-mono text-right">{sale.customer_doc || "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">WhatsApp</dt><dd className="font-mono text-right">{sale.customer_whatsapp || "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Pagamento</dt><dd className="capitalize text-right">{sale.payment_method}{Number(sale.installments || 0) > 1 ? ` · ${sale.installments}x` : ""}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Situação</dt><dd className="text-right">
              {reversed ? <Badge className="bg-danger/15 text-danger border-danger/30">Estornada</Badge>
                : <Badge variant="outline" className="capitalize">{sale.payment_status || "—"}</Badge>}
            </dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Vencimento</dt><dd className="font-mono text-right">{d(sale.due_date)}</dd></div>
          </dl>
        </Block>

        <Block title="Totais" icon={CreditCard}>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Bruto dos itens</dt><dd className="metric">{brl(totals.bruto)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Desconto nos itens</dt><dd className="metric">−{brl(totals.descItens)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Desconto da venda</dt><dd className="metric">−{brl(Number(sale.discount || 0))}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Subtotal</dt><dd className="metric">{brl(Number(sale.subtotal || 0))}</dd></div>
            <div className="flex justify-between gap-3 border-t border-border pt-1.5"><dt className="font-medium">Total</dt><dd className="metric font-semibold">{brl(Number(sale.total || 0))}</dd></div>
            {sale.net_value != null && Number(sale.net_value) !== Number(sale.total) && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Líquido{sale.net_value_reason ? ` (${sale.net_value_reason})` : ""}</dt><dd className="metric text-emerald-700">{brl(Number(sale.net_value))}</dd></div>
            )}
            {Number(sale.returned_total || 0) > 0 && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Devolvido</dt><dd className="metric text-warning">{brl(Number(sale.returned_total))}</dd></div>
            )}
            {showCost && (
              <>
                <div className="flex justify-between gap-3 border-t border-border pt-1.5"><dt className="text-muted-foreground">Custo (CMV)</dt><dd className="metric">{brl(totals.custo)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Margem</dt><dd className="metric">{totals.margem.toFixed(1)}%</dd></div>
              </>
            )}
          </dl>
        </Block>

        <Block title="Observações" icon={Receipt}>
          {sale.notes ? <p className="text-sm whitespace-pre-wrap">{sale.notes}</p> : <Empty text="Sem observações." />}
        </Block>
      </div>

      <Block title={`Itens (${items.length})`} icon={Boxes}>
        {items.length === 0 ? <Empty text="Venda sem itens." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Item</th>
                  <th className="text-left py-2">IMEI / Série</th>
                  <th className="text-right py-2">Qtd</th>
                  <th className="text-right py-2">Unit.</th>
                  <th className="text-right py-2">Desc.</th>
                  {showCost && <th className="text-right py-2">Custo</th>}
                  {showCost && <th className="text-right py-2">Margem</th>}
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((i) => {
                  const custo = Number(i.unit_cost || 0) * Number(i.quantity || 0);
                  const tot = Number(i.total || 0);
                  const mg = tot > 0 ? ((tot - custo) / tot) * 100 : 0;
                  return (
                    <tr key={i.id}>
                      <td className="py-2">
                        <div>{i.name || i.description || "—"}</div>
                        {i.sku && <div className="text-[11px] font-mono text-muted-foreground">{i.sku}</div>}
                      </td>
                      <td className="py-2 font-mono text-xs">{i.imei_serial || "—"}</td>
                      <td className="py-2 text-right metric">{Number(i.quantity || 0)}</td>
                      <td className="py-2 text-right metric">{brl(Number(i.unit_price || 0))}</td>
                      <td className="py-2 text-right metric text-muted-foreground">{brl(Number(i.discount_amount || 0))}</td>
                      {showCost && <td className="py-2 text-right metric">{brl(custo)}</td>}
                      {showCost && <td className="py-2 text-right metric">{mg.toFixed(1)}%</td>}
                      <td className="py-2 text-right metric font-semibold">{brl(tot)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block title={`Pagamentos (${payments.length})`} icon={CreditCard}>
          {payments.length === 0 ? <Empty text="Nenhum pagamento registrado." /> : (
            <ul className="text-sm divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <span className="capitalize">{p.method}</span>
                    {Number(p.installments || 0) > 1 && <span className="text-muted-foreground"> · {p.installments}x</span>}
                    <div className="text-[11px] text-muted-foreground font-mono">{dt(p.created_at)}</div>
                    {p.reversed_at && <Badge className="bg-danger/15 text-danger border-danger/30 mt-1 text-[10px]">Estornado</Badge>}
                  </div>
                  <span className={`metric font-semibold ${p.reversed_at ? "line-through text-muted-foreground" : ""}`}>{brl(Number(p.amount || 0))}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title={`Aparelhos recebidos em troca (${tradeIns.length})`} icon={Smartphone}>
          {tradeIns.length === 0 ? <Empty text="Nenhum aparelho recebido nesta venda." /> : (
            <ul className="text-sm divide-y divide-border">
              {tradeIns.map((t) => (
                <li key={t.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <button className="text-left hover:underline" onClick={() => navigate(`/painel/estoque/trade-in/${t.id}`)}>
                      {t.brand} {t.model}
                    </button>
                    <div className="text-[11px] font-mono text-muted-foreground">{t.imei || "sem IMEI"} · {t.status}</div>
                  </div>
                  <span className="metric font-semibold">{brl(Number(t.entry_value || 0))}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title={`Crediário (${receivables.length})`} icon={CalendarClock}>
          {receivables.length === 0 ? <Empty text="Sem parcelas de crediário." /> : (
            <ul className="text-sm divide-y divide-border">
              {receivables.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <span>Parcela {r.installment_number}/{r.total_installments}</span>
                    <div className="text-[11px] font-mono text-muted-foreground">Venc. {d(r.due_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="metric font-semibold">{brl(Number(r.amount || 0))}</div>
                    <Badge variant="outline" className="text-[10px] capitalize">{r.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title={`Devoluções (${returns.length})`} icon={Undo2}>
          {returns.length === 0 ? <Empty text="Nenhuma devolução registrada." /> : (
            <ul className="text-sm divide-y divide-border">
              {returns.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <span>{r.reason || "Devolução"}</span>
                    <div className="text-[11px] font-mono text-muted-foreground">{dt(r.created_at)} · {r.refund_method || "—"}</div>
                  </div>
                  <span className="metric font-semibold text-warning">{brl(Number(r.total_returned || 0))}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      <Block title={`Movimentos de estoque vinculados (${movements.length})`} icon={Boxes}>
        {movements.length === 0 ? <Empty text="Nenhum movimento de estoque vinculado a esta venda." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2">Tipo</th>
                  <th className="text-right py-2">Qtd</th>
                  <th className="text-right py-2">Saldo antes</th>
                  <th className="text-right py-2">Saldo depois</th>
                  <th className="text-left py-2">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 font-mono text-xs">{dt(m.occurred_at || m.created_at)}</td>
                    <td className="py-2"><Badge variant="outline" className="capitalize text-[10px]">{String(m.type).replace("_", " ")}</Badge></td>
                    <td className={`py-2 text-right metric ${Number(m.quantity) < 0 ? "text-danger" : "text-success"}`}>{Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity)}</td>
                    <td className="py-2 text-right metric text-muted-foreground">{Number(m.balance_before ?? 0)}</td>
                    <td className="py-2 text-right metric">{Number(m.balance_after ?? 0)}</td>
                    <td className="py-2 text-xs text-muted-foreground">{m.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      {!store && null}
    </div>
  );
}