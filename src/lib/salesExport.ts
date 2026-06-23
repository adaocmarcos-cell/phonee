import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { brl } from "@/lib/format";
import type { WarrantySettings } from "@/lib/warranty";

const fmtNum = (n: number | null | undefined) => `#${String(n ?? 0).padStart(4, "0")}`;
const fmtDate = (d: string) => new Date(d).toLocaleString("pt-BR");

export type SaleRow = {
  id: string;
  sale_number: number | null;
  created_at: string;
  customer_name: string | null;
  customer_doc: string | null;
  payment_method: string;
  installments: number | null;
  subtotal: number;
  discount: number;
  total: number;
  notes?: string | null;
};

export function exportSalesPDF(opts: {
  storeName: string;
  periodLabel: string;
  sales: SaleRow[];
}) {
  const { storeName, periodLabel, sales } = opts;
  const doc = new jsPDF();
  const total = sales.reduce((a, b) => a + Number(b.total || 0), 0);

  doc.setFontSize(14);
  doc.text(`Relatório de Vendas — ${storeName}`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Período: ${periodLabel}`, 14, 22);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 27);

  autoTable(doc, {
    startY: 32,
    head: [["Nº", "Data", "Cliente", "Doc", "Pagamento", "Desconto", "Total"]],
    body: sales.map((s) => [
      fmtNum(s.sale_number),
      fmtDate(s.created_at),
      s.customer_name || "Avulso",
      s.customer_doc || "—",
      `${s.payment_method}${s.installments && s.installments > 1 ? ` ${s.installments}x` : ""}`,
      brl(Number(s.discount || 0)),
      brl(Number(s.total || 0)),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 171, 251] },
    foot: [["", "", "", "", `Total (${sales.length})`, "", brl(total)]],
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
  });

  doc.save(`vendas_${periodLabel.replace(/\s+/g, "_")}.pdf`);
}

export function exportSalesXLSX(opts: {
  periodLabel: string;
  sales: SaleRow[];
}) {
  const rows = opts.sales.map((s) => ({
    "Nº": fmtNum(s.sale_number),
    Data: fmtDate(s.created_at),
    Cliente: s.customer_name || "Avulso",
    Documento: s.customer_doc || "",
    Pagamento: s.payment_method,
    Parcelas: s.installments || 1,
    Subtotal: Number(s.subtotal || 0),
    Desconto: Number(s.discount || 0),
    Total: Number(s.total || 0),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vendas");
  XLSX.writeFile(wb, `vendas_${opts.periodLabel.replace(/\s+/g, "_")}.xlsx`);
}

export function printSaleReceipt(opts: {
  sale: SaleRow;
  items: { name: string; sku?: string | null; quantity: number; unit_price: number; total: number }[];
  store: any;
  warranty?: WarrantySettings | null;
}) {
  const { sale, items, store, warranty } = opts;
  let extras: any = {};
  try { extras = sale.notes ? JSON.parse(sale.notes) : {}; } catch { extras = {}; }
  const ex = extras?.extras || extras || {};
  const w = ex.warranty || null;
  const warrantyEnabled = w?.enabled ?? (warranty?.default_enabled ?? false);
  const warrantyDays = w?.days ?? warranty?.default_days ?? 90;
  const warrantyNotice = w?.notice ?? warranty?.notice_text ?? "";
  const warrantyTerms = w?.terms ?? warranty?.message_template ?? "";

  const expDate = new Date(sale.created_at);
  expDate.setDate(expDate.getDate() + Number(warrantyDays || 0));

  const css = `
    *{box-sizing:border-box;font-family:Arial,sans-serif;color:#000}
    body{padding:20px;font-size:12px}
    h1{font-size:18px;margin:0;text-transform:uppercase}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-bottom:12px;font-size:11px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:11px}
    th{background:#000;color:#fff;text-align:left;padding:4px}
    td{border-bottom:1px solid #ddd;padding:4px}
    .totals{margin-left:auto;width:260px;font-size:11px}
    .totals div{display:flex;justify-content:space-between;padding:2px 0}
    .tot{font-weight:bold;border-top:1px solid #000;padding-top:4px}
    .terms{border-top:1px solid #000;padding-top:8px;font-size:10px;line-height:1.4;margin-top:10px}
    .notice{background:#FFF3CD;border:1px solid #E0B400;padding:6px 8px;font-size:10px;margin:8px 0}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:50px;font-size:10px;text-align:center}
    .sign div{border-top:1px solid #000;padding-top:4px}
    @media print { body{padding:0} button{display:none} }
  `;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comprovante ${fmtNum(sale.sale_number)}</title><style>${css}</style></head><body>
    <div class="head">
      <div>
        <h1>${escape(store?.trade_name || store?.name || "")}</h1>
        ${store?.tax_id ? `<div>CNPJ/CPF: ${escape(store.tax_id)}</div>` : ""}
        ${store?.address ? `<div>${escape(store.address)}</div>` : ""}
        <div>${store?.phone ? `Tel: ${escape(store.phone)}` : ""}${store?.email ? ` · ${escape(store.email)}` : ""}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;font-weight:bold">COMPROVANTE DE VENDA</div>
        <div style="font-family:monospace">Nº ${fmtNum(sale.sale_number)}</div>
        <div>${fmtDate(sale.created_at)}</div>
      </div>
    </div>

    <div class="grid">
      <div><b>Cliente:</b> ${escape(sale.customer_name || "—")}</div>
      <div><b>Doc:</b> ${escape(sale.customer_doc || "—")}</div>
      <div><b>Vendedor:</b> ${escape(ex.seller || "—")}</div>
      <div><b>WhatsApp:</b> ${escape(ex.whatsapp || "—")}</div>
      <div><b>Pagamento:</b> ${escape(String(sale.payment_method || "").toUpperCase())}${sale.installments && sale.installments > 1 ? ` (${sale.installments}x)` : ""}</div>
      <div><b>Cidade:</b> ${escape(ex.city || "—")}</div>
    </div>

    <table>
      <thead><tr><th>Produto</th><th style="text-align:right">Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>
        ${items.map((i) => `<tr>
          <td>${escape(i.name)}${i.sku ? ` <span style="color:#666">(${escape(i.sku)})</span>` : ""}</td>
          <td style="text-align:right">${i.quantity}</td>
          <td style="text-align:right">${brl(i.unit_price)}</td>
          <td style="text-align:right">${brl(i.total)}</td>
        </tr>`).join("")}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal:</span><span>${brl(Number(sale.subtotal || 0))}</span></div>
      <div><span>Desconto:</span><span>-${brl(Number(sale.discount || 0))}</span></div>
      <div class="tot"><span>TOTAL:</span><span>${brl(Number(sale.total || 0))}</span></div>
    </div>

    ${warrantyEnabled ? `
      ${warrantyNotice ? `<div class="notice"><b>AVISO:</b> ${escape(warrantyNotice)}</div>` : ""}
      <div class="terms">
        <div style="font-weight:bold;margin-bottom:4px">TERMO DE GARANTIA — ${warrantyDays} dias (válida até ${expDate.toLocaleDateString("pt-BR")})</div>
        <div>${escape(warrantyTerms)}</div>
      </div>
    ` : ""}

    <div class="sign">
      <div>Assinatura do cliente</div>
      <div>${escape(store?.trade_name || store?.name || "")}</div>
    </div>

    <div style="margin-top:20px;text-align:center"><button onclick="window.print()">Imprimir</button></div>
    <script>setTimeout(()=>window.print(),300)</script>
  </body></html>`;

  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escape(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}