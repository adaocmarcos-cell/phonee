import type { SaleRow } from "@/lib/salesExport";

export type SaleItemSnapshot = {
  product_id?: string | null;
  name?: string | null;
  sku?: string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  unit?: string | null;
  imei_serial?: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  discount_amount?: number | null;
};

export type SaleIntegrityIssue = {
  index: number;
  field: string;
  message: string;
};

export type SaleIntegrityResult = {
  ok: boolean;
  issues: SaleIntegrityIssue[];
  computedTotal: number;
};

/**
 * Validates a sale + its items snapshot BEFORE generating any PDF/receipt.
 * Ensures we never render a comprovante with missing descriptions,
 * inconsistent totals or invalid quantities.
 */
export function validateSaleForReceipt(
  sale: Pick<SaleRow, "id" | "total" | "subtotal" | "discount" | "payment_method"> | null | undefined,
  items: SaleItemSnapshot[] | null | undefined,
): SaleIntegrityResult {
  const issues: SaleIntegrityIssue[] = [];

  if (!sale) {
    return { ok: false, issues: [{ index: -1, field: "sale", message: "Venda não encontrada" }], computedTotal: 0 };
  }
  if (!sale.payment_method) {
    issues.push({ index: -1, field: "payment_method", message: "Forma de pagamento ausente" });
  }
  if (!items || items.length === 0) {
    issues.push({ index: -1, field: "items", message: "Venda sem itens" });
    return { ok: false, issues, computedTotal: 0 };
  }

  let computedTotal = 0;
  items.forEach((it, i) => {
    const name = (it.name ?? "").trim();
    if (!name) issues.push({ index: i, field: "name", message: "Descrição do item ausente" });
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
      issues.push({ index: i, field: "quantity", message: "Quantidade inválida" });
    }
    if (!Number.isFinite(it.unit_price) || it.unit_price < 0) {
      issues.push({ index: i, field: "unit_price", message: "Preço unitário inválido" });
    }
    const expected = round2(Number(it.quantity || 0) * Number(it.unit_price || 0) - Number(it.discount_amount || 0));
    if (Math.abs(expected - Number(it.total || 0)) > 0.01) {
      issues.push({ index: i, field: "total", message: `Total do item inconsistente (esperado ${expected})` });
    }
    computedTotal += Number(it.total || 0);
  });

  computedTotal = round2(computedTotal);
  if (Math.abs(computedTotal - Number(sale.total || 0)) > 0.01) {
    issues.push({
      index: -1,
      field: "total",
      message: `Total da venda (${sale.total}) diverge da soma dos itens (${computedTotal})`,
    });
  }

  return { ok: issues.length === 0, issues, computedTotal };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}