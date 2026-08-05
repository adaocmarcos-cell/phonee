import { describe, it, expect } from "vitest";
import { distributeSaleDiscount, calculateSaleDiscountAmount } from "./saleDiscount";

describe("saleDiscount logic", () => {
  it("should calculate amount correctly", () => {
    expect(calculateSaleDiscountAmount(1000, "pct", 10)).toBe(100);
    expect(calculateSaleDiscountAmount(1000, "brl", 50)).toBe(50);
    expect(calculateSaleDiscountAmount(1000, "pct", 110)).toBe(1000); // clamp 100%
    expect(calculateSaleDiscountAmount(1000, "brl", 1500)).toBe(1000); // clamp subtotal
  });

  it("should distribute discount proportionally and close decimals", () => {
    const items = [
      { product_id: "1", quantity: 1, unit_price: 100, discount_amount: 0 },
      { product_id: "2", quantity: 1, unit_price: 200, discount_amount: 0 },
      { product_id: "3", quantity: 1, unit_price: 300, discount_amount: 0 },
    ];
    const totalDiscount = 10; // R$ 10,00 de desconto geral
    const result = distributeSaleDiscount(items, totalDiscount);
    
    const sum = result.reduce((a, b) => a + b.distributed_discount, 0);
    expect(Number(sum.toFixed(2))).toBe(10);
    
    // Item 3 é o maior (300/600 = 50%) -> R$ 5,00
    // Item 2 (200/600 = 33.33%) -> R$ 3,33
    // Item 1 (100/600 = 16.67%) -> R$ 1,67
    // 1.67 + 3.33 + 5.00 = 10.00
    expect(result.find(r => r.product_id === "3")?.distributed_discount).toBe(5);
  });

  it("should handle quantity > 1", () => {
    const items = [
      { product_id: "1", quantity: 2, unit_price: 50, discount_amount: 0 }, // 100
      { product_id: "2", quantity: 1, unit_price: 100, discount_amount: 0 }, // 100
    ];
    const result = distributeSaleDiscount(items, 10);
    expect(result[0].distributed_discount).toBe(5);
    expect(result[1].distributed_discount).toBe(5);
  });
});
