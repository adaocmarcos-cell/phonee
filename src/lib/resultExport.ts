import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { brl, num, pct } from "@/lib/format";

export type ResultReportData = {
  storeName: string;
  periodTitle: string;
  faturamentoTotal: number;
  faturamentoVendas: number;
  faturamentoOs: number;
  custoTotal: number;
  custoProdutos: number;
  custoOs: number;
  despesas: number;
  lucro: number;
  qtdVendas: number;
  ticketMedio: number;
  recebidoCaixa: number;
  recebidoTroca: number;
  aReceber: number;
};

export function exportResultPDF(d: ResultReportData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const margem = d.faturamentoTotal > 0 ? (d.lucro / d.faturamentoTotal) * 100 : 0;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Resultado do período", M, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(d.storeName || "—", M, 68);
  doc.text(d.periodTitle, M, 82);
  doc.text(
    `Emitido em ${new Date().toLocaleString("pt-BR")}`,
    W - M,
    82,
    { align: "right" }
  );
  doc.setTextColor(0);
  doc.setDrawColor(200);
  doc.line(M, 94, W - M, 94);

  autoTable(doc, {
    startY: 110,
    head: [["Conta do período", "Valor"]],
    body: [
      ["Faturamento", brl(d.faturamentoTotal)],
      ["− Custo da mercadoria (CMV + peças O.S.)", brl(d.custoTotal)],
      ["− Despesas", brl(d.despesas)],
      ["= Lucro do período", brl(d.lucro)],
      ["Margem", pct(margem)],
    ],
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", font: "courier" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 3) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [242, 242, 242];
      }
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 24;

  autoTable(doc, {
    startY: y,
    head: [["Detalhamento", "Valor"]],
    body: [
      ["Faturamento — vendas", brl(d.faturamentoVendas)],
      ["Faturamento — ordens de serviço", brl(d.faturamentoOs)],
      ["Custo — produtos vendidos", brl(d.custoProdutos)],
      ["Custo — peças de O.S.", brl(d.custoOs)],
      ["Despesas operacionais", brl(d.despesas)],
    ],
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [70, 70, 70], textColor: 255 },
    columnStyles: { 1: { halign: "right", font: "courier" } },
  });

  y = (doc as any).lastAutoTable.finalY + 24;

  autoTable(doc, {
    startY: y,
    head: [["Indicadores do painel", "Valor"]],
    body: [
      ["Vendas no período", num(d.qtdVendas)],
      ["Ticket médio", brl(d.ticketMedio)],
      ["Recebido em caixa", brl(d.recebidoCaixa)],
      ["Recebido em aparelhos (troca)", brl(d.recebidoTroca)],
      ["A receber (crediário)", brl(d.aReceber)],
    ],
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [70, 70, 70], textColor: 255 },
    columnStyles: { 1: { halign: "right", font: "courier" } },
  });

  y = (doc as any).lastAutoTable.finalY + 28;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Fórmula: Lucro = Faturamento − Custo da mercadoria − Despesas. Documento gerencial, sem valor fiscal.",
    M,
    y,
    { maxWidth: W - M * 2 }
  );

  const slug = (d.storeName || "loja").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  doc.save(`resultado-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
