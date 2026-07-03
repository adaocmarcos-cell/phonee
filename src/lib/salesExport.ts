import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { brl } from "@/lib/format";
import type { WarrantySettings } from "@/lib/warranty";
import { validateSaleForReceipt } from "@/lib/salePersistence";

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
  items: {
    name: string;
    sku?: string | null;
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    unit?: string | null;
    imei_serial?: string | null;
    public_notes?: string | null;
    discount_amount?: number;
    quantity: number;
    unit_price: number;
    total: number;
  }[];
  store: any;
  warranty?: WarrantySettings | null;
}) {
  const { sale, items, store, warranty } = opts;
  const integrity = validateSaleForReceipt(sale, items as any);
  if (!integrity.ok) {
    const summary = integrity.issues
      .slice(0, 5)
      .map((i) => `• ${i.index >= 0 ? `Item ${i.index + 1} ` : ""}${i.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error("[printSaleReceipt] integrity failed", integrity.issues);
    if (typeof window !== "undefined") {
      window.alert(`Não é possível gerar o comprovante. Corrija:\n\n${summary}`);
    }
    return;
  }
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

  const addrLine = [
    [store?.address_street, store?.address_number].filter(Boolean).join(", "),
    store?.address_complement,
    store?.address_neighborhood,
    [store?.address_city, store?.address_uf].filter(Boolean).join(" - "),
  ].filter(Boolean).join(" · ") || store?.address || "";

  const showTaxId = store?.show_tax_id_on_docs !== false;
  const showLegal = store?.show_legal_name_on_docs !== false;
  const showNonFiscal = store?.show_non_fiscal_notice !== false;
  const logoUrl = store?.pdf_logo_url && /^https?:\/\//i.test(store.pdf_logo_url) ? store.pdf_logo_url : "";

  const totalItemsQty = items.reduce((a, i) => a + Number(i.quantity || 0), 0);
  const totalItemsDiscount = items.reduce((a, i) => a + Number(i.discount_amount || 0), 0);
  const grossTotal = items.reduce((a, i) => a + Number(i.total || 0), 0) + totalItemsDiscount;

  const css = `
    *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
    body{padding:28px 32px;font-size:12.5px;background:#fff}
    .doc{border:1.5px solid #0f172a;border-radius:4px;overflow:hidden}
    .head{display:flex;align-items:center;gap:16px;padding:16px 20px;border-bottom:1.5px solid #0f172a;background:#fafafa}
    .head .logo{width:72px;height:72px;border:1px solid #cbd5e1;border-radius:4px;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden;flex-shrink:0}
    .head .logo img{max-width:100%;max-height:100%;object-fit:contain}
    .head .store{flex:1;min-width:0}
    .head .store h1{font-size:17px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.3px}
    .head .store .line{font-size:11.5px;color:#334155;line-height:1.5}
    .head .doctype{text-align:right;border-left:1px dashed #94a3b8;padding-left:16px;min-width:200px}
    .head .doctype .title{font-size:13px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#0f172a}
    .head .doctype .num{font-family:'Courier New',monospace;font-size:18px;font-weight:700;margin-top:4px}
    .head .doctype .date{font-size:11px;color:#475569;margin-top:2px}
    .section{border-bottom:1px solid #cbd5e1;padding:14px 20px}
    .section .label{font-size:9.5px;font-weight:700;letter-spacing:.6px;color:#64748b;text-transform:uppercase;margin-bottom:8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;font-size:12px}
    .grid .field{display:flex;flex-direction:column;gap:2px}
    .grid .field .k{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
    .grid .field .v{font-size:12.5px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding:4px 0;min-height:20px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead th{background:#0f172a;color:#fff;text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.4px;text-transform:uppercase;font-weight:600}
    tbody td{border-bottom:1px solid #e2e8f0;padding:12px;vertical-align:top}
    tbody tr:nth-child(even){background:#f8fafc}
    .totals{margin-left:auto;width:320px;font-size:12.5px;padding:12px 20px;border-top:1.5px solid #0f172a}
    .totals div{display:flex;justify-content:space-between;padding:6px 0}
    .tot{font-weight:800;font-size:15px;border-top:1.5px solid #0f172a;padding-top:10px;margin-top:4px}
    .terms{padding:16px 20px;font-size:11px;line-height:1.6;background:#fafafa}
    .terms .title{font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.4px;margin-bottom:6px;color:#0f172a}
    .notice{margin:14px 20px;background:#FFF8E1;border-left:4px solid #F59E0B;padding:10px 14px;font-size:11px;line-height:1.5}
    .nonfiscal{margin:14px 20px 0;text-align:center;border:1.5px dashed #94a3b8;padding:8px;font-size:11px;color:#475569;letter-spacing:.5px;text-transform:uppercase;font-weight:600}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:60px;padding:40px 20px 20px;font-size:11px;text-align:center}
    .sign div{border-top:1px solid #0f172a;padding-top:6px}
    @media print { body{padding:0} button{display:none} .doc{border:none} }
  `;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comprovante ${fmtNum(sale.sale_number)}</title><style>${css}</style></head><body>
    <div class="doc">
      <div class="head">
        <div class="logo">${logoUrl ? `<img src="${logoUrl}" alt="logo"/>` : `<span style="font-size:9px;color:#94a3b8">LOGO</span>`}</div>
        <div class="store">
          <h1>${escape(store?.trade_name || store?.name || "")}</h1>
          ${showLegal && store?.trade_name && store?.name && store.trade_name !== store.name ? `<div class="line">${escape(store.name)}</div>` : ""}
          ${showTaxId && store?.tax_id ? `<div class="line">CNPJ/CPF: ${escape(store.tax_id)}</div>` : ""}
          ${addrLine ? `<div class="line">${escape(addrLine)}</div>` : ""}
          <div class="line">${store?.phone ? `Telefone: ${escape(store.phone)}` : ""}${store?.email ? `${store?.phone ? " · " : ""}${escape(store.email)}` : ""}${store?.instagram ? ` · ${escape(store.instagram)}` : ""}</div>
        </div>
        <div class="doctype">
          <div class="title">Comprovante de Venda</div>
          <div class="num">Nº ${fmtNum(sale.sale_number)}</div>
          <div class="date">${fmtDate(sale.created_at)}</div>
        </div>
      </div>

      ${showNonFiscal ? `<div class="nonfiscal">Este documento não é um documento fiscal</div>` : ""}

      <div class="section">
        <div class="label">Dados do Cliente</div>
        <div class="grid">
          <div class="field"><span class="k">Cliente</span><span class="v">${escape(sale.customer_name || "—")}</span></div>
          <div class="field"><span class="k">Documento</span><span class="v">${escape(sale.customer_doc || "—")}</span></div>
          <div class="field"><span class="k">WhatsApp</span><span class="v">${escape(ex.whatsapp || "—")}</span></div>
          <div class="field"><span class="k">Cidade</span><span class="v">${escape(ex.city || "—")}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="label">Pagamento</div>
        <div class="grid">
          <div class="field"><span class="k">Forma de pagamento</span><span class="v">${escape(String(sale.payment_method || "").toUpperCase())}${sale.installments && sale.installments > 1 ? ` (${sale.installments}x)` : ""}</span></div>
          <div class="field"><span class="k">Vendedor</span><span class="v">${escape(ex.seller || "—")}</span></div>
        </div>
      </div>

      <div style="padding:0">
        <table>
          <thead><tr>
            <th style="width:70px">Código</th>
            <th>Descrição</th>
            <th style="text-align:center;width:60px">Un.</th>
            <th style="text-align:right;width:60px">Qtd</th>
            <th style="text-align:right;width:110px">Vlr. Unit.</th>
            <th style="text-align:right;width:110px">Vlr. Total</th>
          </tr></thead>
          <tbody>
            ${items.map((i) => {
              const details = [
                i.brand ? `Marca: ${escape(i.brand)}` : "",
                i.model ? `Modelo: ${escape(i.model)}` : "",
                i.category ? `Cat.: ${escape(i.category)}` : "",
                i.imei_serial ? `IMEI/Serial: ${escape(i.imei_serial)}` : "",
              ].filter(Boolean).join(" · ");
              const discountLine = Number(i.discount_amount || 0) > 0
                ? `<div style="color:#b45309;font-size:10.5px;margin-top:2px">Desconto: - ${brl(Number(i.discount_amount))}</div>` : "";
              const notesLine = i.public_notes
                ? `<div style="color:#334155;font-size:10.5px;margin-top:2px">Obs.: ${escape(i.public_notes)}</div>` : "";
              return `<tr>
                <td style="font-family:'Courier New',monospace;font-size:10.5px">${escape(i.sku || "—")}</td>
                <td>
                  <div style="font-weight:600">${escape(i.name)}</div>
                  ${details ? `<div style="color:#64748b;font-size:10.5px;margin-top:2px">${details}</div>` : ""}
                  ${discountLine}
                  ${notesLine}
                </td>
                <td style="text-align:center">${escape(i.unit || "un")}</td>
                <td style="text-align:right">${i.quantity}</td>
                <td style="text-align:right">${brl(i.unit_price)}</td>
                <td style="text-align:right;font-weight:600">${brl(i.total)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div class="totals">
        <div><span>Total de itens</span><span>${items.length} (${totalItemsQty} un.)</span></div>
        <div><span>Subtotal produtos/serviços</span><span>${brl(grossTotal || Number(sale.subtotal || 0))}</span></div>
        <div><span>Descontos</span><span>- ${brl(totalItemsDiscount || Number(sale.discount || 0))}</span></div>
        <div class="tot"><span>TOTAL</span><span>${brl(Number(sale.total || 0))}</span></div>
      </div>

      ${warrantyEnabled ? `
        ${warrantyNotice ? `<div class="notice"><b>AVISO:</b> ${escape(warrantyNotice)}</div>` : ""}
        <div class="terms">
          <div class="title">Termo de Garantia — ${warrantyDays} dias (válida até ${expDate.toLocaleDateString("pt-BR")})</div>
          <div>${escape(warrantyTerms)}</div>
        </div>
      ` : ""}

      ${store?.pdf_footer_text ? `<div class="terms" style="border-top:1px solid #cbd5e1"><div>${escape(store.pdf_footer_text)}</div></div>` : ""}

      <div class="sign">
        <div>Assinatura do cliente</div>
        <div>${escape(store?.trade_name || store?.name || "")}</div>
      </div>
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