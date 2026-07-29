import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { FileDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Dre = {
  periodo: { de: string; ate: string };
  receita_vendas: number; devolucoes: number; receita_os: number; receita_liquida: number;
  cmv: number; custo_pecas_os: number; lucro_bruto: number; margem_bruta_pct: number;
  despesas: { categoria: string; valor: number }[]; despesas_total: number;
  taxas_cartao: number; resultado_operacional: number; margem_operacional_pct: number;
};

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DRE() {
  const { store } = useAuth();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [cur, setCur] = useState<Dre | null>(null);
  const [prev, setPrev] = useState<Dre | null>(null);
  const [loading, setLoading] = useState(true);

  const prevRange = useMemo(() => {
    const a = new Date(from + "T00:00:00");
    const b = new Date(to + "T00:00:00");
    const len = Math.max(1, Math.round((+b - +a) / 86400000) + 1);
    const pb = new Date(a); pb.setDate(pb.getDate() - 1);
    const pa = new Date(pb); pa.setDate(pa.getDate() - (len - 1));
    return { from: iso(pa), to: iso(pb) };
  }, [from, to]);

  useEffect(() => {
    if (!store) return;
    setLoading(true);
    Promise.all([
      (supabase as any).rpc("dre_gerencial", { _store_id: store.id, _from: from, _to: to }),
      (supabase as any).rpc("dre_gerencial", { _store_id: store.id, _from: prevRange.from, _to: prevRange.to }),
    ]).then(([a, b]: any[]) => {
      setCur(a?.data ?? null);
      setPrev(b?.data ?? null);
      setLoading(false);
    });
  }, [store, from, to, prevRange]);

  const lines = useMemo(() => {
    if (!cur) return [] as { label: string; cur: number; prev: number; kind?: "total" | "sub" | "neg" }[];
    const p = prev;
    const arr: { label: string; cur: number; prev: number; kind?: "total" | "sub" | "neg" }[] = [
      { label: "Receita de vendas", cur: cur.receita_vendas, prev: p?.receita_vendas ?? 0 },
      { label: "(−) Devoluções", cur: -cur.devolucoes, prev: -(p?.devolucoes ?? 0), kind: "neg" },
      { label: "Receita de serviços (OS)", cur: cur.receita_os, prev: p?.receita_os ?? 0 },
      { label: "= Receita líquida", cur: cur.receita_liquida, prev: p?.receita_liquida ?? 0, kind: "sub" },
      { label: "(−) CMV (custo dos produtos)", cur: -cur.cmv, prev: -(p?.cmv ?? 0), kind: "neg" },
      { label: "(−) Custo de peças em OS", cur: -cur.custo_pecas_os, prev: -(p?.custo_pecas_os ?? 0), kind: "neg" },
      { label: "= Lucro bruto", cur: cur.lucro_bruto, prev: p?.lucro_bruto ?? 0, kind: "sub" },
    ];
    cur.despesas.forEach((d) => {
      arr.push({
        label: `(−) ${d.categoria}`,
        cur: -Number(d.valor),
        prev: -Number((p?.despesas ?? []).find((x) => x.categoria === d.categoria)?.valor ?? 0),
        kind: "neg",
      });
    });
    arr.push({ label: "(−) Taxas de maquininha", cur: -cur.taxas_cartao, prev: -(p?.taxas_cartao ?? 0), kind: "neg" });
    arr.push({ label: "= Resultado operacional", cur: cur.resultado_operacional, prev: p?.resultado_operacional ?? 0, kind: "total" });
    return arr;
  }, [cur, prev]);

  const variation = (a: number, b: number) => {
    if (!b) return a === 0 ? "—" : "novo";
    const v = ((a - b) / Math.abs(b)) * 100;
    return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  };

  const exportPDF = () => {
    if (!cur) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("DRE Gerencial", 14, 16);
    doc.setFontSize(9);
    doc.text(`Loja: ${store?.name ?? "—"}`, 14, 22);
    doc.text(`Período: ${new Date(from).toLocaleDateString("pt-BR")} → ${new Date(to).toLocaleDateString("pt-BR")}`, 14, 27);
    doc.text(`Comparativo: ${new Date(prevRange.from).toLocaleDateString("pt-BR")} → ${new Date(prevRange.to).toLocaleDateString("pt-BR")}`, 14, 32);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 37);
    autoTable(doc, {
      startY: 43,
      head: [["Linha", "Período", "Anterior", "Variação"]],
      body: lines.map((l) => [l.label, brl(l.cur), brl(l.prev), variation(l.cur, l.prev)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
      didParseCell: (d: any) => {
        const l = lines[d.row.index];
        if (d.section === "body" && l && (l.kind === "total" || l.kind === "sub")) d.cell.styles.fontStyle = "bold";
      },
    });
    doc.setFontSize(10);
    const y = (doc as any).lastAutoTable.finalY + 8;
    doc.text(`Margem bruta: ${cur.margem_bruta_pct}%  ·  Margem operacional: ${cur.margem_operacional_pct}%`, 14, y);
    doc.save(`dre-${from}_a_${to}.pdf`);
  };

  return (
    <div>
      <PageHeader
        title="DRE Gerencial"
        description="Resultado do período: receitas, custos, despesas e taxas — comparado ao período anterior."
        actions={
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px] mt-1" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px] mt-1" />
            </div>
            <Button variant="outline" onClick={exportPDF} disabled={!cur}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
          </div>
        }
      />

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between text-xs uppercase tracking-widest font-mono text-muted-foreground">
          <span>Demonstrativo</span>
          <span>Comparativo: {new Date(prevRange.from).toLocaleDateString("pt-BR")} → {new Date(prevRange.to).toLocaleDateString("pt-BR")}</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Linha</th>
              <th className="text-right px-4 py-2 font-medium">Período</th>
              <th className="text-right px-4 py-2 font-medium">Anterior</th>
              <th className="text-right px-4 py-2 font-medium">Variação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-xs font-mono text-muted-foreground">CARREGANDO…</td></tr>
            ) : lines.map((l, i) => (
              <tr key={`${l.label}-${i}`} className={l.kind === "total" ? "bg-surface-elevated/60" : ""}>
                <td className={`px-4 py-2 ${l.kind === "total" || l.kind === "sub" ? "font-semibold" : ""}`}>{l.label}</td>
                <td className={`px-4 py-2 text-right metric ${l.kind === "total" || l.kind === "sub" ? "font-semibold" : ""} ${l.cur < 0 ? "text-danger" : ""}`}>{brl(l.cur)}</td>
                <td className="px-4 py-2 text-right text-xs text-muted-foreground">{brl(l.prev)}</td>
                <td className="px-4 py-2 text-right text-xs font-mono">{variation(l.cur, l.prev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cur && (
          <div className="px-4 py-3 border-t border-border flex flex-wrap gap-6 text-xs">
            <span>Margem bruta: <b className="metric">{cur.margem_bruta_pct}%</b></span>
            <span>Margem operacional: <b className="metric">{cur.margem_operacional_pct}%</b></span>
            <span className="text-muted-foreground">Trade-in não entra como despesa: é estoque.</span>
          </div>
        )}
      </Card>
    </div>
  );
}