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
  tradeIns?: {
    brand?: string | null; model?: string | null; imei?: string | null;
    storage_gb?: number | null; value: number;
  }[];
}) {
  const { sale, items, store, warranty, tradeIns } = opts;
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
  const freight = Number(ex?.payment?.freight || 0);
  const otherExpenses = Number(ex?.payment?.other_expenses || 0);

  const stripDays = (t: string) =>
    String(t || "")
      .replace(/\{dias\}/gi, String(warrantyDays))
      .replace(/\s*(?:de\s+)?\d+\s*(?:dias|meses|m[êe]s|ano|anos)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;])/g, "$1")
      .trim();

  const noticeText = stripDays(warrantyNotice);
  const termsText = stripDays(warrantyTerms);
  const generalNotes = String(ex?.user_notes || "").trim();
  const itemNotes = items
    .map((i, idx) => ({ idx, name: i.name, note: String(i.public_notes || "").trim() }))
    .filter((n) => n.note);
  const hasObs = generalNotes.length > 0 || itemNotes.length > 0;
  const anyImei = items.some((i) => String(i.imei_serial || "").trim());

  const installments = Number(sale.installments || ex?.payment?.installments || 1);
  const splits: any[] = Array.isArray(ex?.payment?.splits) ? ex.payment.splits : [];
  const isCrediario = String(sale.payment_method || "").toLowerCase().includes("crediario")
    || splits.some((sp) => String(sp?.method || "").toLowerCase().includes("crediario"));
  const dueDates: string[] = [];
  if (isCrediario && installments > 1) {
    for (let n = 1; n <= installments; n++) {
      const d = new Date(sale.created_at);
      d.setMonth(d.getMonth() + n);
      dueDates.push(d.toLocaleDateString("pt-BR"));
    }
  }
  const stateReg = store?.state_registration || store?.ie || store?.inscricao_estadual || "";
  const nonFiscalText = "DOCUMENTO SEM VALOR FISCAL — não substitui Nota Fiscal Eletrônica";

  const css = `
    *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
    body{padding:24px 28px;font-size:12.5px;background:#fff}
    .doc{border:1.5px solid #0f172a;border-radius:4px;overflow:hidden}
    .banner{background:#0f172a;color:#fff;text-align:center;padding:7px 10px;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase}
    .topgrid{display:grid;grid-template-columns:1.6fr 1fr;gap:0;border-bottom:1.5px solid #0f172a}
    .box{padding:12px 16px}
    .box + .box{border-left:1.5px solid #0f172a}
    .label{font-size:9.5px;font-weight:700;letter-spacing:.6px;color:#64748b;text-transform:uppercase;margin-bottom:7px}
    .emit{display:flex;gap:14px;align-items:flex-start}
    .logo{width:64px;height:64px;border:1px solid #cbd5e1;border-radius:4px;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden;flex-shrink:0}
    .logo img{max-width:100%;max-height:100%;object-fit:contain}
    .emit h1{font-size:15px;margin:0 0 3px;text-transform:uppercase;letter-spacing:.3px}
    .line{font-size:11px;color:#334155;line-height:1.5}
    .doctype .title{font-size:12.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase}
    .doctype .num{font-family:'Courier New',monospace;font-size:17px;font-weight:700;margin-top:5px}
    .doctype .date{font-size:11px;color:#475569;margin-top:3px}
    .section{border-bottom:1px solid #cbd5e1;padding:12px 16px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 20px;font-size:12px}
    .grid.g3{grid-template-columns:1fr 1fr 1fr}
    .grid .field{display:flex;flex-direction:column;gap:2px}
    .grid .field .k{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
    .grid .field .v{font-size:12.5px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding:4px 0;min-height:20px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead th{background:#0f172a;color:#fff;text-align:left;padding:9px 10px;font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;font-weight:600}
    tbody td{border-bottom:1px solid #e2e8f0;padding:10px;vertical-align:top}
    tbody tr:nth-child(even){background:#f8fafc}
    .mono{font-family:'Courier New',monospace}
    .imei{font-family:'Courier New',monospace;font-size:12.5px;letter-spacing:.4px;white-space:nowrap}
    .totals{margin-left:auto;width:330px;font-size:12.5px;padding:12px 16px;border-top:1.5px solid #0f172a;border-left:1.5px solid #0f172a}
    .totals div{display:flex;justify-content:space-between;padding:5px 0}
    .tot{font-weight:800;font-size:15px;border-top:1.5px solid #0f172a;padding-top:9px;margin-top:4px}
    .warranty{margin:14px 16px;border:1.5px solid #0f172a;border-radius:4px;overflow:hidden;page-break-inside:avoid}
    .warranty .wh{background:#f1f5f9;border-bottom:1px solid #0f172a;padding:9px 14px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;font-size:12px}
    .warranty .wgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 16px;padding:11px 14px;border-bottom:1px solid #e2e8f0;font-size:12px}
    .warranty .wbody{padding:12px 14px;font-size:11px;line-height:1.6}
    .warranty .wtitle{font-size:9.5px;font-weight:700;letter-spacing:.6px;color:#64748b;text-transform:uppercase;margin-bottom:5px}
    .warranty table{font-size:11.5px}
    .warranty thead th{background:#334155}
    .notice{margin:0 14px 14px;border:1.5px solid #0f172a;background:#f1f5f9;padding:9px 12px;font-size:11px;line-height:1.5;font-weight:600}
    .terms{padding:14px 16px;font-size:11px;line-height:1.6;background:#fafafa}
    .terms .title{font-weight:700;text-transform:uppercase;font-size:10.5px;letter-spacing:.4px;margin-bottom:5px}
    .footnf{text-align:center;padding:8px;font-size:10px;color:#475569;letter-spacing:.5px;text-transform:uppercase;border-top:1px dashed #94a3b8}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:60px;padding:38px 20px 18px;font-size:11px;text-align:center}
    .sign div{border-top:1px solid #0f172a;padding-top:6px}
    @media print { body{padding:0} button{display:none} .doc{border:none} thead{display:table-header-group} tr{page-break-inside:avoid} }
  `;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comprovante ${fmtNum(sale.sale_number)}</title><style>${css}</style></head><body>
    <div class="doc">
      ${showNonFiscal ? `<div class="banner">${nonFiscalText}</div>` : ""}

      <div class="topgrid">
        <div class="box">
          <div class="label">Emitente</div>
          <div class="emit">
            <div class="logo">${logoUrl ? `<img src="${logoUrl}" alt="logo"/>` : `<span style="font-size:9px;color:#94a3b8">LOGO</span>`}</div>
            <div>
              <h1>${escape(store?.trade_name || store?.name || "")}</h1>
              ${showLegal && store?.name && store?.trade_name && store.trade_name !== store.name ? `<div class="line">Razão social: ${escape(store.name)}</div>` : ""}
              ${showTaxId && store?.tax_id ? `<div class="line">CNPJ/CPF: ${escape(store.tax_id)}</div>` : ""}
              ${stateReg ? `<div class="line">IE: ${escape(stateReg)}</div>` : ""}
              ${addrLine ? `<div class="line">${escape(addrLine)}</div>` : ""}
              <div class="line">${store?.phone ? `Tel.: ${escape(store.phone)}` : ""}${store?.email ? `${store?.phone ? " · " : ""}${escape(store.email)}` : ""}${store?.instagram ? ` · ${escape(store.instagram)}` : ""}</div>
            </div>
          </div>
        </div>
        <div class="box doctype">
          <div class="label">Documento</div>
          <div class="title">Comprovante de Venda / Pedido</div>
          <div class="num">Nº ${String(sale.sale_number ?? 0).padStart(4, "0")} · SÉRIE 1</div>
          <div class="date">Emissão: ${fmtDate(sale.created_at)}</div>
        </div>
      </div>

      <div class="section">
        <div class="label">Destinatário</div>
        <div class="grid">
          <div class="field"><span class="k">Cliente</span><span class="v">${escape(sale.customer_name || "—")}</span></div>
          <div class="field"><span class="k">CPF/CNPJ</span><span class="v">${escape(sale.customer_doc || "—")}</span></div>
          <div class="field"><span class="k">WhatsApp</span><span class="v">${escape(ex.whatsapp || ex.phone || "—")}</span></div>
          <div class="field"><span class="k">Cidade</span><span class="v">${escape(ex.city || "—")}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="label">Condição de pagamento</div>
        <div class="grid g3">
          <div class="field"><span class="k">Forma</span><span class="v">${escape(String(sale.payment_method || "").toUpperCase())}</span></div>
          <div class="field"><span class="k">Parcelas</span><span class="v">${installments > 1 ? `${installments}x` : "À vista"}</span></div>
          <div class="field"><span class="k">Vendedor</span><span class="v">${escape(ex.seller || "—")}</span></div>
        </div>
        ${dueDates.length ? `<div style="margin-top:9px;font-size:11px;color:#334155"><b>Vencimentos:</b> ${dueDates.map((d, n) => `${n + 1}ª ${d}`).join(" · ")}</div>` : ""}
      </div>

      <div style="padding:0">
        <table>
          <thead><tr>
            <th style="width:34px;text-align:center">#</th>
            <th style="width:70px">Código</th>
            <th>Descrição</th>
            ${anyImei ? `<th style="width:150px">IMEI / Série</th>` : ""}
            <th style="text-align:center;width:56px">Un.</th>
            <th style="text-align:right;width:52px">Qtd</th>
            <th style="text-align:right;width:100px">Vlr. Unit.</th>
            <th style="text-align:right;width:100px">Vlr. Total</th>
          </tr></thead>
          <tbody>
            ${items.map((i, idx) => {
              const details = [
                i.brand ? `Marca: ${escape(i.brand)}` : "",
                i.model ? `Modelo: ${escape(i.model)}` : "",
                i.category ? `Cat.: ${escape(i.category)}` : "",
              ].filter(Boolean).join(" · ");
              const discountLine = Number(i.discount_amount || 0) > 0
                ? `<div style="font-size:10.5px;margin-top:2px;color:#475569">Desconto: - ${brl(Number(i.discount_amount))}</div>` : "";
              return `<tr>
                <td style="text-align:center;color:#64748b">${idx + 1}</td>
                <td class="mono" style="font-size:10.5px">${escape(i.sku || "—")}</td>
                <td>
                  <div style="font-weight:600">${escape(i.name)}</div>
                  ${details ? `<div style="color:#64748b;font-size:10.5px;margin-top:2px">${details}</div>` : ""}
                  ${discountLine}
                </td>
                ${anyImei ? `<td class="imei">${escape(i.imei_serial || "—")}</td>` : ""}
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
        ${freight > 0 ? `<div><span>Frete</span><span>+ ${brl(freight)}</span></div>` : ""}
        ${otherExpenses > 0 ? `<div><span>Outras despesas</span><span>+ ${brl(otherExpenses)}</span></div>` : ""}
        <div class="tot"><span>TOTAL</span><span>${brl(Number(sale.total || 0))}</span></div>
      </div>

      ${tradeIns && tradeIns.length > 0 ? `
        <div class="section">
          <div class="label">Aparelho(s) recebido(s) em troca</div>
          <table>
            <thead><tr>
              <th>Marca / Modelo</th>
              <th>IMEI / Serial</th>
              <th style="text-align:right;width:120px">Valor abatido</th>
            </tr></thead>
            <tbody>
              ${tradeIns.map((t) => `<tr>
                <td>${escape([t.brand, t.model, t.storage_gb ? t.storage_gb + "GB" : ""].filter(Boolean).join(" "))}</td>
                <td class="imei">${escape(t.imei || "—")}</td>
                <td style="text-align:right;font-weight:600">${brl(Number(t.value || 0))}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      ` : ""}

      ${warrantyEnabled ? `
        <div class="warranty">
          <div class="wh">Termo de Garantia</div>
          <div class="wgrid">
            <div class="field"><span class="k" style="font-size:9.5px;color:#64748b;text-transform:uppercase">Prazo</span><div style="font-weight:700">${warrantyDays} dias</div></div>
            <div class="field"><span class="k" style="font-size:9.5px;color:#64748b;text-transform:uppercase">Início</span><div>${new Date(sale.created_at).toLocaleDateString("pt-BR")}</div></div>
            <div class="field"><span class="k" style="font-size:9.5px;color:#64748b;text-transform:uppercase">Válida até</span><div style="font-weight:700">${expDate.toLocaleDateString("pt-BR")}</div></div>
          </div>
          <table>
            <thead><tr>
              <th>Produto</th>
              <th style="width:170px">IMEI / Nº de série</th>
              <th style="width:90px;text-align:right">Prazo</th>
            </tr></thead>
            <tbody>
              ${items.map((i) => `<tr>
                <td>${escape(i.name)}</td>
                <td class="imei">${escape(String(i.imei_serial || "").trim() || "—")}</td>
                <td style="text-align:right">${warrantyDays} dias</td>
              </tr>`).join("")}
            </tbody>
          </table>
          ${hasObs ? `
            <div class="wbody" style="border-top:1px solid #e2e8f0">
              <div class="wtitle">Observações registradas na venda</div>
              ${itemNotes.map((n) => `<div>• <b>${escape(n.name)}:</b> ${escape(n.note)}</div>`).join("")}
              ${generalNotes ? `<div style="${itemNotes.length ? "margin-top:5px;" : ""}">• <b>Venda:</b> ${escape(generalNotes)}</div>` : ""}
            </div>` : ""}
          ${termsText ? `
            <div class="wbody" style="border-top:1px solid #e2e8f0">
              <div class="wtitle">Condições</div>
              <div>${escape(termsText)}</div>
            </div>` : ""}
          ${noticeText ? `<div class="notice">AVISO: ${escape(noticeText)}</div>` : ""}
        </div>
      ` : ""}

      ${store?.pdf_footer_text ? `<div class="terms" style="border-top:1px solid #cbd5e1"><div class="title">Dados adicionais</div><div>${escape(store.pdf_footer_text)}</div></div>` : ""}

      <div class="sign">
        <div>Assinatura do cliente</div>
        <div>${escape(store?.trade_name || store?.name || "")}</div>
      </div>

      ${showNonFiscal ? `<div class="footnf">${nonFiscalText}</div>` : ""}
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