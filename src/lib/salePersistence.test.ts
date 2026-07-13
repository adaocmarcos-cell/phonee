import { describe, it, expect } from "vitest";
import { validateSaleForReceipt, type SaleItemSnapshot } from "./salePersistence";
import type { SaleRow } from "./salesExport";

const baseSale: SaleRow = {
  id: "s1",
  sale_number: 12,
  created_at: new Date().toISOString(),
  customer_name: "Cliente Teste",
  customer_doc: null,
  payment_method: "pix",
  installments: 1,
  subtotal: 200,
  discount: 0,
  total: 200,
  notes: null,
};

const validItem: SaleItemSnapshot = {
  product_id: "p1",
  name: "iPhone 12 64GB",
  sku: "IP12-64",
  brand: "Apple",
  model: "12",
  unit: "un",
  quantity: 1,
  unit_price: 200,
  total: 200,
  discount_amount: 0,
};

describe("validateSaleForReceipt", () => {
  it("passes for a valid sale with valid items", () => {
    const r = validateSaleForReceipt(baseSale, [validItem]);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.computedTotal).toBe(200);
  });

  it("fails when sale is missing", () => {
    const r = validateSaleForReceipt(null, [validItem]);
    expect(r.ok).toBe(false);
    expect(r.issues[0].field).toBe("sale");
  });

  it("fails when there are no items", () => {
    const r = validateSaleForReceipt(baseSale, []);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.field === "items")).toBe(true);
  });

  it("flags item without description (snapshot missing)", () => {
    const r = validateSaleForReceipt(baseSale, [{ ...validItem, name: "" }]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.field === "name")).toBe(true);
  });

  it("flags invalid quantity and unit_price", () => {
    const r = validateSaleForReceipt(baseSale, [
      { ...validItem, quantity: 0, unit_price: -1, total: 0 },
    ]);
    expect(r.issues.some((i) => i.field === "quantity")).toBe(true);
    expect(r.issues.some((i) => i.field === "unit_price")).toBe(true);
  });

  it("flags item total inconsistent with qty * price - discount", () => {
    const r = validateSaleForReceipt(baseSale, [
      { ...validItem, quantity: 2, unit_price: 100, discount_amount: 10, total: 200 },
    ]);
    expect(r.issues.some((i) => i.field === "total" && i.index === 0)).toBe(true);
  });

  it("ignores sale.total (may include freight/other expenses) — only checks items", () => {
    const r = validateSaleForReceipt({ ...baseSale, total: 500 }, [validItem]);
    // Header total is NOT compared to sale.total anymore; items are internally consistent.
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("accepts a multi-item sale with discount and matching totals", () => {
    const items: SaleItemSnapshot[] = [
      { ...validItem, quantity: 2, unit_price: 100, discount_amount: 0, total: 200 },
      { ...validItem, name: "Capa", quantity: 1, unit_price: 50, discount_amount: 5, total: 45 },
    ];
    const r = validateSaleForReceipt({ ...baseSale, total: 245, subtotal: 250, discount: 5 }, items);
    expect(r.ok).toBe(true);
    expect(r.computedTotal).toBe(245);
  });
});