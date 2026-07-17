import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl, num } from "@/lib/format";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, Loader2, Download, FileText, Pencil } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Row = {
  product_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  brand: string | null;
  supplier: string | null;
  saldo_inicial: number;
  entrada_compra: number;
  entrada_troca: number;
  entrada_devolucao: number;
  ajuste_positivo: number;
  saida_venda: number;
  saida_os: number;
  saida_transferencia: number;
  ajuste_negativo: number;
  saldo_calculado: number;
  saldo_atual: number;
  divergencia: number;
  unit_cost: number | null;
};

type Timeline = {
  id: string;
  occurred_at: string;
  type: string;
  quantity: number;
  balance_after: number | null;
  unit_cost: number | null;
  origin_table: string | null;
  origin_id: string | null;
  notes: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  venda: "Venda",
  compra: "Compra",
  entrada_troca: "Entrada por troca",
  devolucao: "Devolução",
  ajuste: "Ajuste",
  uso_os: "Uso em OS",
  transferencia_in: "Transferência (in)",
  transferencia_out: "Transferência (out)",
  edicao_manual: "Edição manual",
  saldo_inicial: "Saldo inicial",
};

export default function MovimentacaoLedger({
  storeId, periodStart, periodEnd, category, brand, supplier, showCost,
}: {
  storeId?: string;
  periodStart: Date;
  periodEnd: Date;
  category: string;
  brand: string;
  supplier: string;
  showCost: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyDiverg, setOnlyDiverg] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [timeline, setTimeline] = useState<Timeline[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [sp, setSp] = useSearchParams();
  const focusProductId = sp.get("product");
  const focusDivergentes = sp.get("divergentes") === "1";

  useEffect(() => {
    if (focusDivergentes) setOnlyDiverg(true);
  }, [focusDivergentes]);

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    let catParam: string | null = null;
    if (category === "smartphones") catParam = "aparelho_novo,aparelho_seminovo";
    else if (category !== "all") catParam = category;
    const { data, error } = await supabase.rpc("get_stock_movement_report", {
      p_store_id: storeId,
      p_start: periodStart.toISOString(),
      p_end: periodEnd.toISOString(),
      p_category: catParam,
      p_brand: brand === "all" ? null : brand,
      p_supplier: supplier === "all" ? null : supplier,
    });
    if (error) {
      toast.error("Falha ao carregar movimentação: " + error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [storeId, periodStart.getTime(), periodEnd.getTime(), category, brand, supplier]);

  // Deep-link: quando vier ?product=<id>, abre a timeline daquele produto automaticamente
  useEffect(() => {
    if (!focusProductId || rows.length === 0) return;
    const r = rows.find((x) => x.product_id === focusProductId);
    if (r) {
      openTimeline(r);
      // limpa o param para não reabrir a cada re-render
      const next = new URLSearchParams(sp);
      next.delete("product");
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line
  }, [focusProductId, rows]);

  const openTimeline = async (r: Row) => {
    setSelected(r);
    setTimelineLoading(true);
    const { data, error } = await supabase
      .from("stock_movements")
      .select("id, occurred_at, type, quantity, balance_after, unit_cost, origin_table, origin_id, notes")
      .eq("store_id", storeId!)
      .eq("product_id", r.product_id)
      .gte("occurred_at", periodStart.toISOString())
      .lte("occurred_at", periodEnd.toISOString())
      .order("occurred_at", { ascending: true })
      .limit(500);
    if (error) toast.error(error.message);
    setTimeline((data ?? []) as any);
    setTimelineLoading(false);
  };

  const filteredRows = useMemo(
    () => onlyDiverg ? rows.filter((r) => Number(r.divergencia) !== 0) : rows,
    [rows, onlyDiverg]
  );

  const totals = useMemo(() => {
    let vendaQty = 0, custoSaida = 0, entradaQty = 0, divergTotal = 0, produtosDiverg = 0;
    rows.forEach((r) => {
      vendaQty += Number(r.saida_venda || 0);
      custoSaida += Number(r.saida_venda || 0) * Number(r.unit_cost || 0);
      entradaQty += Number(r.entrada_compra || 0) + Number(r.entrada_troca || 0);
      if (Number(r.divergencia) !== 0) { produtosDiverg++; divergTotal += Number(r.divergencia); }
    });
    return { vendaQty, custoSaida, entradaQty, divergTotal, produtosDiverg };
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Itens vendidos" value={num(totals.vendaQty)} />
        <KPI label="Entradas (compra+troca)" value={num(totals.entradaQty)} />
        {showCost && <KPI label="Custo que saiu" value={brl(totals.custoSaida)} tone="info" />}
        <KPI
          label="Divergências"
          value={`${totals.produtosDiverg} produto(s)`}
          sub={totals.divergTotal !== 0 ? `Δ ${totals.divergTotal > 0 ? "+" : ""}${num(totals.divergTotal)}` : "sem diferenças"}
          tone={totals.produtosDiverg > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="p-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Livro-razão de estoque · {rows.length} produto(s) no período
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={onlyDiverg ? "default" : "outline"} onClick={() => setOnlyDiverg((v) => !v)}>
            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Só divergências
          </Button>
          <Button size="sm" variant="outline" onClick={load}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Recarregar"}</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Produto</th>
                <th className="text-right px-2 py-2 font-medium">Inicial</th>
                <th className="text-right px-2 py-2 font-medium">Compra</th>
                <th className="text-right px-2 py-2 font-medium">Troca</th>
                <th className="text-right px-2 py-2 font-medium">Ajuste +</th>
                <th className="text-right px-2 py-2 font-medium">Venda</th>
                <th className="text-right px-2 py-2 font-medium">OS</th>
                <th className="text-right px-2 py-2 font-medium">Ajuste -</th>
                <th className="text-right px-2 py-2 font-medium">Calc.</th>
                <th className="text-right px-2 py-2 font-medium">Atual</th>
                <th className="text-right px-2 py-2 font-medium">Δ</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-xs text-muted-foreground">Carregando…</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-xs text-muted-foreground">Sem movimentação no período.</td></tr>
              ) : filteredRows.slice(0, 1000).map((r) => {
                const div = Number(r.divergencia);
                const isDiv = div !== 0;
                return (
                  <tr
                    key={r.product_id}
                    className={`hover:bg-surface-elevated/40 cursor-pointer ${isDiv ? "bg-danger/5" : ""}`}
                    onClick={() => openTimeline(r)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.product_name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{r.sku ?? "—"} · {r.category ?? "—"}</div>
                    </td>
                    <td className="px-2 py-2 text-right metric">{num(r.saldo_inicial)}</td>
                    <td className="px-2 py-2 text-right metric text-success">{num(r.entrada_compra)}</td>
                    <td className="px-2 py-2 text-right metric text-success">{num(r.entrada_troca)}</td>
                    <td className="px-2 py-2 text-right metric text-success/80">{num(r.ajuste_positivo)}</td>
                    <td className="px-2 py-2 text-right metric text-danger">{num(r.saida_venda)}</td>
                    <td className="px-2 py-2 text-right metric text-danger/80">{num(r.saida_os)}</td>
                    <td className="px-2 py-2 text-right metric text-danger/80">{num(r.ajuste_negativo)}</td>
                    <td className="px-2 py-2 text-right metric font-semibold">{num(r.saldo_calculado)}</td>
                    <td className="px-2 py-2 text-right metric font-bold">{num(r.saldo_atual)}</td>
                    <td className={`px-2 py-2 text-right metric font-bold ${isDiv ? "text-danger" : "text-muted-foreground"}`}>
                      {isDiv ? `${div > 0 ? "+" : ""}${num(div)}` : "—"}
                    </td>
                    <td className="px-1"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setTimeline([]); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selected?.product_name}</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-2">
            {selected?.sku ?? "—"} · Saldo inicial {num(selected?.saldo_inicial || 0)} → Atual <b>{num(selected?.saldo_atual || 0)}</b>
            {Number(selected?.divergencia) !== 0 && (
              <Badge variant="outline" className="ml-2 text-danger border-danger/40">
                Divergência {Number(selected?.divergencia) > 0 ? "+" : ""}{num(Number(selected?.divergencia))}
              </Badge>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {timelineLoading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Carregando linha do tempo…</div>
            ) : timeline.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Sem movimentos registrados no período.</div>
            ) : (
              <>
              <div className="flex justify-end gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={() => exportTimelineCsv(selected!, timeline, periodStart, periodEnd)}>
                  <Download className="h-3.5 w-3.5 mr-1" /> CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportTimelinePdf(selected!, timeline, periodStart, periodEnd)}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                </Button>
              </div>
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2">Quando</th>
                    <th className="text-left py-2">Tipo</th>
                    <th className="text-right py-2">Qtd</th>
                    <th className="text-right py-2">Saldo</th>
                    <th className="text-left py-2">Origem</th>
                    <th className="text-left py-2">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {timeline.map((t) => (
                    <tr
                      key={t.id}
                      className={
                        t.type === "edicao_manual"
                          ? "border-l-2 border-warning"
                          : ""
                      }
                    >
                      <td className="py-1.5 font-mono text-muted-foreground">{new Date(t.occurred_at).toLocaleString("pt-BR")}</td>
                      <td className="py-1.5">
                        {t.type === "edicao_manual" ? (
                          <span className="inline-flex items-center gap-1 text-warning font-semibold text-[11px]">
                            <Pencil className="h-3 w-3" />
                            {TYPE_LABEL[t.type]}
                          </span>
                        ) : (
                          <span className="text-[11px] text-foreground/80">{TYPE_LABEL[t.type] ?? t.type}</span>
                        )}
                      </td>
                      <td className={`py-1.5 text-right metric font-semibold ${Number(t.quantity) >= 0 ? "text-success" : "text-danger"}`}>
                        {Number(t.quantity) > 0 ? "+" : ""}{num(Number(t.quantity))}
                      </td>
                      <td className="py-1.5 text-right metric">{t.balance_after != null ? num(Number(t.balance_after)) : "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{t.origin_table ?? "—"}</td>
                      <td className="py-1.5 text-muted-foreground truncate max-w-[220px]">{t.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "success" | "danger" | "info" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "info" ? "text-info" : "";
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">{label}</div>
      <div className={`metric text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function exportTimelineCsv(row: Row, timeline: Timeline[], from: Date, to: Date) {
  const header = ["Quando", "Tipo", "Quantidade", "Saldo depois", "Origem", "Nota", "Divergencia"];
  const lines = [header.join(";")];
  timeline.forEach((t) => {
    const isEdit = t.type === "edicao_manual";
    lines.push([
      new Date(t.occurred_at).toLocaleString("pt-BR"),
      TYPE_LABEL[t.type] ?? t.type,
      String(t.quantity),
      t.balance_after != null ? String(t.balance_after) : "",
      t.origin_table ?? "",
      (t.notes ?? "").replace(/[\n;]+/g, " "),
      isEdit ? "EDICAO_MANUAL" : "",
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
  });
  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `movimentacao_${(row.sku ?? row.product_id).replace(/\W+/g, "_")}_${from.toISOString().slice(0,10)}_${to.toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTimelinePdf(row: Row, timeline: Timeline[], from: Date, to: Date) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(`Movimentação de estoque — ${row.product_name}`, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `SKU: ${row.sku ?? "—"}   Período: ${from.toLocaleDateString("pt-BR")} a ${to.toLocaleDateString("pt-BR")}   Saldo atual: ${row.saldo_atual}   Divergência: ${row.divergencia}`,
    40, 58,
  );
  autoTable(doc, {
    startY: 78,
    head: [["Quando", "Tipo", "Qtd", "Saldo", "Origem", "Nota"]],
    body: timeline.map((t) => [
      new Date(t.occurred_at).toLocaleString("pt-BR"),
      (t.type === "edicao_manual" ? "* " : "") + (TYPE_LABEL[t.type] ?? t.type),
      String(t.quantity),
      t.balance_after != null ? String(t.balance_after) : "—",
      t.origin_table ?? "—",
      t.notes ?? "—",
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    didParseCell: (data) => {
      if (data.section === "body") {
        const t = timeline[data.row.index];
        if (t && t.type === "edicao_manual") {
          data.cell.styles.fillColor = [255, 243, 205];
          data.cell.styles.textColor = [120, 53, 15];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
  doc.save(`movimentacao_${(row.sku ?? row.product_id).replace(/\W+/g, "_")}.pdf`);
}