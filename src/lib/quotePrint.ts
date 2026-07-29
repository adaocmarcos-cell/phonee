import { brl } from "./format";

type Store = {
  name: string;
  trade_name?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_uf?: string | null;
  pdf_logo_url?: string | null;
  logo_url?: string | null;
  pdf_primary_color?: string | null;
  pdf_footer_text?: string | null;
};

export type QuoteItem = {
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total: number;
  is_service: boolean;
};

export type QuoteDoc = {
  quote_number: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  valid_until: string;
  subtotal: number;
  discount: number;
  total: number;
  notes?: string | null;
  created_at: string;
  items: QuoteItem[];
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const dt = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const dtLocal = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

function addr(s: Store) {
  return [
    [s.address_street, s.address_number].filter(Boolean).join(", "),
    s.address_neighborhood,
    [s.address_city, s.address_uf].filter(Boolean).join("/"),
  ].filter(Boolean).join(" · ");
}

export function buildQuoteHtml(q: QuoteDoc, store: Store, opts: { autoPrint?: boolean } = {}) {
  const color = store.pdf_primary_color || "#0f172a";
  const logo = store.pdf_logo_url || store.logo_url;
  const rows = q.items
    .map(
      (it) => `<tr>
        <td>${esc(it.description)}${it.is_service ? ' <span class="tag">serviço</span>' : ""}</td>
        <td class="c">${Number(it.quantity)}</td>
        <td class="r">${brl(Number(it.unit_price))}</td>
        <td class="r">${Number(it.discount_amount) > 0 ? "-" + brl(Number(it.discount_amount)) : "—"}</td>
        <td class="r b">${brl(Number(it.total))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Orçamento ${q.quote_number ?? ""}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#0f172a; margin:0; padding:28px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; border-bottom:3px solid ${color}; padding-bottom:12px; }
  .logo { max-height:56px; }
  .store { font-size:12px; line-height:1.5; color:#475569; }
  .store b { color:#0f172a; font-size:15px; display:block; }
  .doc { text-align:right; }
  .doc h1 { margin:0; font-size:20px; color:${color}; }
  .doc small { color:#64748b; }
  .box { border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-top:16px; font-size:13px; }
  .grid { display:flex; gap:24px; flex-wrap:wrap; }
  .grid div { min-width:160px; }
  .lbl { color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  table { width:100%; border-collapse:collapse; margin-top:16px; font-size:13px; }
  th { background:#f1f5f9; text-align:left; padding:8px; font-size:11px; text-transform:uppercase; color:#475569; }
  td { padding:8px; border-bottom:1px solid #e2e8f0; }
  .r { text-align:right; } .c { text-align:center; } .b { font-weight:600; }
  .tag { background:#e0f2fe; color:#0369a1; font-size:10px; padding:1px 6px; border-radius:99px; }
  .totals { margin-top:14px; margin-left:auto; width:280px; font-size:13px; }
  .totals div { display:flex; justify-content:space-between; padding:4px 0; }
  .totals .tot { border-top:2px solid ${color}; margin-top:6px; padding-top:8px; font-size:17px; font-weight:700; color:${color}; }
  .foot { margin-top:26px; font-size:11px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:10px; }
  .sign { margin-top:44px; display:flex; gap:40px; }
  .sign div { flex:1; border-top:1px solid #94a3b8; padding-top:6px; font-size:11px; text-align:center; color:#64748b; }
  @media print { body { padding:12px; } }
</style></head><body>
  <div class="head">
    <div class="store">
      ${logo ? `<img class="logo" src="${esc(logo)}" alt="" />` : ""}
      <b>${esc(store.trade_name || store.name)}</b>
      ${store.tax_id ? `CNPJ/CPF: ${esc(store.tax_id)}<br/>` : ""}
      ${esc(addr(store))}<br/>
      ${[store.phone, store.email].filter(Boolean).map(esc).join(" · ")}
    </div>
    <div class="doc">
      <h1>ORÇAMENTO Nº ${q.quote_number ?? "—"}</h1>
      <small>Emitido em ${dtLocal(q.created_at)}</small><br/>
      <small><b>Válido até ${dt(q.valid_until)}</b></small>
    </div>
  </div>

  <div class="box grid">
    <div><div class="lbl">Cliente</div>${esc(q.customer_name || "Consumidor")}</div>
    <div><div class="lbl">Contato</div>${esc(q.customer_phone || "—")}</div>
    <div><div class="lbl">Itens</div>${q.items.length}</div>
  </div>

  <table>
    <thead><tr><th>Descrição</th><th class="c">Qtd</th><th class="r">Unitário</th><th class="r">Desc.</th><th class="r">Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${brl(Number(q.subtotal))}</span></div>
    <div><span>Desconto</span><span>${Number(q.discount) > 0 ? "-" + brl(Number(q.discount)) : brl(0)}</span></div>
    <div class="tot"><span>Total</span><span>${brl(Number(q.total))}</span></div>
  </div>

  ${q.notes ? `<div class="box"><div class="lbl">Observações</div>${esc(q.notes)}</div>` : ""}

  <div class="sign"><div>Assinatura do cliente</div><div>Responsável pela loja</div></div>

  <div class="foot">
    Este documento é um orçamento e não possui valor fiscal. Valores válidos até ${dt(q.valid_until)}, sujeitos a disponibilidade de estoque.
    ${store.pdf_footer_text ? `<br/>${esc(store.pdf_footer_text)}` : ""}
  </div>
  ${opts.autoPrint === false ? "" : "<script>window.onload=()=>window.print()<\/script>"}
</body></html>`;
}

export function printQuote(q: QuoteDoc, store: Store) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(buildQuoteHtml(q, store));
  w.document.close();
  return true;
}

export function quoteWhatsappText(q: QuoteDoc, storeName: string) {
  const lines = q.items.map((i) => `• ${i.description} — ${i.quantity}x ${brl(Number(i.unit_price))}`);
  return [
    `*Orçamento nº ${q.quote_number ?? ""} — ${storeName}*`,
    "",
    ...lines,
    "",
    q.discount > 0 ? `Desconto: -${brl(Number(q.discount))}` : "",
    `*Total: ${brl(Number(q.total))}*`,
    `Válido até ${dt(q.valid_until)}.`,
  ].filter(Boolean).join("\n");
}
