import { brl } from "./format";
import { REASON_LABEL } from "./tradeInStatus";

type Store = {
  name: string;
  trade_name?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_uf?: string | null;
  logo_url?: string | null;
  pdf_logo_url?: string | null;
  pdf_primary_color?: string | null;
  pdf_footer_text?: string | null;
};

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function addr(s: Store) {
  const parts = [
    [s.address_street, s.address_number].filter(Boolean).join(", "),
    s.address_complement,
    s.address_neighborhood,
    [s.address_city, s.address_uf].filter(Boolean).join("/"),
  ].filter(Boolean);
  return parts.join(" · ");
}

const CHECK_LABEL: Record<string, string> = {
  screen_ok: "Tela sem trincas",
  battery_ok: "Bateria saudável",
  cam_back_ok: "Câmera traseira",
  cam_front_ok: "Câmera frontal",
  buttons_ok: "Botões físicos",
  biometric_ok: "Face ID / Digital",
  box_included: "Caixa original",
  accessories_included: "Acessórios",
  icloud_removed: "iCloud/Google removidos",
  no_mdm: "Sem MDM",
  body_ok: "Corpo sem danos",
  speaker_ok: "Alto-falante/microfone",
};

export function buildTradeInFichaHtml(ti: any, store: Store, opts: { autoPrint?: boolean } = {}) {
  const logo = store.pdf_logo_url || store.logo_url || "";
  const primary = store.pdf_primary_color || "#0f172a";
  const totalCost = Number(ti.entry_value || 0) + Number(ti.repair_costs || 0);
  const margin = ti.intended_sale_value > 0
    ? ((Number(ti.intended_sale_value) - totalCost) / Number(ti.intended_sale_value)) * 100
    : 0;

  const checklist = ti.checklist || {};
  const checklistRows = Object.keys(CHECK_LABEL)
    .map((k) => {
      const v = checklist[k];
      const mark = v === "ok" ? "✓ OK" : v === "defeito" ? "✗ Defeito" : "—";
      const cls = v === "ok" ? "ok" : v === "defeito" ? "bad" : "muted";
      return `<tr><td>${esc(CHECK_LABEL[k])}</td><td class="${cls} right">${mark}</td></tr>`;
    })
    .join("");

  const parts = (ti.repair_parts || []) as any[];
  const partsRows = parts.length
    ? parts
        .map(
          (p) =>
            `<tr><td>${esc(p.name)}</td><td class="right">${p.qty}</td><td class="right">${brl(Number(p.unit_cost))}</td><td class="right">${brl(Number(p.qty) * Number(p.unit_cost))}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="muted center">Sem peças vinculadas.</td></tr>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Ficha de Compra & Troca — ${esc(ti.model || "")}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;margin:24px;font-size:12px;line-height:1.4}
  h1{font-size:18px;margin:0 0 2px}
  h2{font-size:12px;margin:16px 0 6px;padding-bottom:4px;border-bottom:2px solid ${primary};color:${primary};text-transform:uppercase;letter-spacing:.08em}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${primary};padding-bottom:12px;margin-bottom:8px}
  .head img{max-height:56px;max-width:180px;object-fit:contain}
  .store{font-size:11px;color:#475569;text-align:right}
  .store strong{color:#0f172a;font-size:13px}
  .meta{display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  th,td{padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
  th{background:#f8fafc;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#475569}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px}
  .grid div{padding:3px 0;border-bottom:1px dotted #e2e8f0}
  .grid .k{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  .right{text-align:right}
  .center{text-align:center}
  .ok{color:#059669;font-weight:600}
  .bad{color:#dc2626;font-weight:600}
  .muted{color:#94a3b8}
  .totals{margin-top:8px;display:flex;justify-content:flex-end;gap:24px}
  .totals div{text-align:right}
  .totals .lbl{font-size:10px;color:#64748b;text-transform:uppercase}
  .totals .val{font-size:15px;font-weight:700}
  .sig{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}
  .sig div{border-top:1px solid #0f172a;padding-top:6px;text-align:center;font-size:11px}
  .status{display:inline-block;padding:2px 10px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  .status.on{background:#dcfce7;color:#166534}
  .status.off{background:#e2e8f0;color:#475569}
  .terms{margin-top:16px;font-size:10px;color:#475569;padding:8px 10px;border:1px dashed #cbd5e1;border-radius:6px;line-height:1.5}
  .foot{margin-top:24px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center}
  @media print{body{margin:12mm}}
</style></head><body>
<div class="head">
  <div>
    ${logo ? `<img src="${esc(logo)}" alt="logo"/>` : `<h1>${esc(store.trade_name || store.name)}</h1>`}
  </div>
  <div class="store">
    <strong>${esc(store.trade_name || store.name)}</strong><br>
    ${store.tax_id ? esc(store.tax_id) + "<br>" : ""}
    ${esc(addr(store))}<br>
    ${store.phone ? esc(store.phone) : ""}${store.phone && store.email ? " · " : ""}${store.email ? esc(store.email) : ""}
  </div>
</div>
<h1>Ficha de Compra & Troca</h1>
<div class="meta">
  <div>Nº ${esc(String(ti.id || "").slice(0, 8).toUpperCase())} · Emitido em ${new Date().toLocaleString("pt-BR")}</div>
  <div>
    <span class="status ${ti.status === "em_estoque" ? "on" : "off"}">
      ${ti.status === "em_estoque" ? "Em estoque" : "Desativado"}
    </span>
    ${ti.status !== "em_estoque" ? ` <span class="muted">· ${esc(REASON_LABEL[ti.status as keyof typeof REASON_LABEL] ?? ti.status)}</span>` : ""}
  </div>
</div>

<h2>Dono anterior</h2>
<div class="grid">
  <div><span class="k">Nome</span><br>${esc(ti.customer_name || "—")}</div>
  <div><span class="k">CPF/CNPJ</span><br>${esc(ti.customer_doc || "—")}</div>
  <div><span class="k">Telefone</span><br>${esc(ti.customer_phone || "—")}</div>
  <div><span class="k">E-mail</span><br>${esc(ti.customer_email || "—")}</div>
</div>

<h2>Aparelho</h2>
<div class="grid">
  <div><span class="k">Marca / Modelo</span><br>${esc([ti.brand, ti.model].filter(Boolean).join(" "))}</div>
  <div><span class="k">Armazenamento / Cor</span><br>${esc([ti.storage_gb ? ti.storage_gb + "GB" : "", ti.color].filter(Boolean).join(" · ") || "—")}</div>
  <div><span class="k">IMEI</span><br><span style="font-family:monospace">${esc(ti.imei || "—")}</span> ${ti.imei_status === "limpo" ? '<span class="ok">(limpo)</span>' : ti.imei_status === "restrito" ? '<span class="bad">(restrito)</span>' : ""}</div>
  <div><span class="k">Condição</span><br>${esc(String(ti.condition || "").replace("_", " "))}</div>
  <div><span class="k">Saúde da bateria</span><br>${ti.battery_health ? esc(ti.battery_health) + "%" : "—"}</div>
  <div><span class="k">Sucata p/ peças</span><br>${ti.scrap_for_parts ? "Sim" : "Não"}</div>
</div>

<h2>Checklist de avaliação</h2>
<table>${checklistRows}</table>

<h2>Peças de reparo</h2>
<table>
  <thead><tr><th>Peça</th><th class="right">Qtd</th><th class="right">Custo un.</th><th class="right">Subtotal</th></tr></thead>
  <tbody>${partsRows}</tbody>
</table>

<h2>Valores</h2>
<div class="grid">
  <div><span class="k">Valor pago ao cliente</span><br><strong>${brl(Number(ti.entry_value || 0))}</strong></div>
  <div><span class="k">Custos de reparo</span><br><strong>${brl(Number(ti.repair_costs || 0))}</strong></div>
  <div><span class="k">Venda pretendida</span><br><strong>${brl(Number(ti.intended_sale_value || 0))}</strong></div>
  <div><span class="k">Margem estimada</span><br><strong>${margin.toFixed(1)}%</strong></div>
</div>
<div class="totals">
  <div><div class="lbl">Custo total</div><div class="val">${brl(totalCost)}</div></div>
</div>

${ti.notes ? `<h2>Observações</h2><div>${esc(ti.notes).replace(/\n/g, "<br>")}</div>` : ""}

<div class="terms">
  Declaro que sou o legítimo proprietário do aparelho descrito acima, que ele não é produto de crime,
  não possui restrição, bloqueio judicial ou financeiro, e autorizo sua entrega em caráter definitivo
  como parte do processo de compra/troca. Recebi o valor acordado como pagamento total.
</div>

<div class="sig">
  <div>Assinatura do cliente<br><span class="muted">${esc(ti.customer_name || "")}</span></div>
  <div>Responsável pela loja<br><span class="muted">${esc(store.trade_name || store.name)}</span></div>
</div>

<div class="foot">${esc(store.pdf_footer_text || "Emitido pelo Phonee")}</div>

${opts.autoPrint ? '<script>window.onload=()=>{setTimeout(()=>window.print(),200)}</script>' : ""}
</body></html>`;
  return html;
}

export function printTradeInFicha(ti: any, store: Store) {
  const html = buildTradeInFichaHtml(ti, store, { autoPrint: true });
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) {
    alert("Habilite pop-ups para emitir o PDF da ficha.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ============ Linha do tempo (auditoria) ============

type TimelineEntry = {
  created_at: string;
  action: string;
  user_label: string;
  details: any;
};

const STATUS_LABEL: Record<string, string> = {
  em_avaliacao: "Em avaliação",
  aprovado: "Aguardando preparo",
  em_estoque: "Em estoque",
  vendido: "Vendido",
  recusado: "Recusado",
};

export function buildTradeInTimelineHtml(
  ti: any,
  store: Store,
  entries: TimelineEntry[],
  opts: { autoPrint?: boolean } = {},
): string {
  const rows = entries
    .map((e) => {
      const d = e.details || {};
      const st = d.status && typeof d.status === "object" ? d.status : null;
      const status = st
        ? `<div class="pill from">${esc(STATUS_LABEL[st.de] ?? st.de ?? "—")}</div>
           <span class="arrow">→</span>
           <div class="pill to">${esc(STATUS_LABEL[st.para] ?? st.para ?? "—")}</div>`
        : "";
      const parts = Array.isArray(d.parts) && d.parts.length
        ? `<div class="parts"><strong>Peças:</strong><ul>${d.parts
            .map(
              (p: any) =>
                `<li>${esc(p.name)} × ${esc(p.qty)} · ${brl(Number(p.unit_cost || 0))}
                 <span class="src">(${p.source === "estoque" ? "estoque" : "externa"})</span></li>`,
            )
            .join("")}</ul></div>`
        : "";
      const costs =
        d.parts_cost !== undefined || d.manual_cost !== undefined
          ? `<div class="costs">Peças ${brl(Number(d.parts_cost || 0))} · Manual ${brl(
              Number(d.manual_cost || 0),
            )} · <strong>Total ${brl(Number(d.total_cost || Number(d.parts_cost || 0) + Number(d.manual_cost || 0)))}</strong></div>`
          : "";
      const notes = d.notas_preparo ? `<div class="notes">"${esc(d.notas_preparo)}"</div>` : "";
      const motivo = d.motivo ? `<div class="motivo">Motivo: ${esc(d.motivo)}</div>` : "";
      return `<tr>
        <td class="when">${esc(new Date(e.created_at).toLocaleString("pt-BR"))}</td>
        <td class="who">${esc(e.user_label)}</td>
        <td class="what">
          <div class="action">${esc(
            e.action === "criacao" ? "Entrada criada" : e.action === "edicao" ? "Edição" : "Mudança de status",
          )}</div>
          ${status ? `<div class="status">${status}</div>` : ""}
          ${motivo}${notes}${costs}${parts}
        </td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Linha do tempo · ${esc(ti.model || "")}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial; color: #111; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #ddd; padding: 8px; vertical-align: top; text-align: left; }
  th { background: #f4f4f5; text-transform: uppercase; font-size: 10px; color: #555; }
  .when { white-space: nowrap; color: #333; width: 140px; }
  .who { width: 160px; color: #333; }
  .action { font-weight: 600; margin-bottom: 4px; }
  .status { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; border: 1px solid #ccc; background: #fafafa; }
  .pill.to { background: #e6f7ec; border-color: #6bb686; color: #135a2a; }
  .arrow { color: #888; }
  .motivo, .notes, .costs { font-size: 11px; color: #444; margin-top: 2px; }
  .notes { font-style: italic; }
  .parts ul { margin: 4px 0 0 16px; padding: 0; }
  .parts li { font-size: 11px; color: #333; }
  .src { color: #777; }
  .foot { margin-top: 20px; font-size: 10px; color: #888; text-align: right; }
</style></head><body>
<h1>Linha do tempo — ${esc(ti.brand || "")} ${esc(ti.model || "")}</h1>
<div class="sub">
  Cliente: <strong>${esc(ti.customer_name || "—")}</strong> ·
  IMEI: <span style="font-family:monospace">${esc(ti.imei || "—")}</span> ·
  Loja: ${esc(store.trade_name || store.name)} ·
  Emitido em ${new Date().toLocaleString("pt-BR")}
</div>
<table>
  <thead><tr><th>Quando</th><th>Quem</th><th>O que aconteceu</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="3" style="color:#777;text-align:center;padding:24px">Sem eventos registrados.</td></tr>`}</tbody>
</table>
<div class="foot">${esc(store.pdf_footer_text || "Emitido pelo Phonee")}</div>
${opts.autoPrint ? '<script>window.onload=()=>{setTimeout(()=>window.print(),200)}</script>' : ""}
</body></html>`;
}

export function printTradeInTimeline(
  ti: any,
  store: Store,
  entries: TimelineEntry[],
) {
  const html = buildTradeInTimelineHtml(ti, store, entries, { autoPrint: true });
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) {
    alert("Habilite pop-ups para exportar a linha do tempo.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}