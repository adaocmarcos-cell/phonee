import { describe, expect, it, vi } from "vitest";
import { loadProductStockMetrics, normalizeProductStockMetrics } from "./stockMetrics";

describe("stockMetrics", () => {
  it("normaliza contagens reais acima de 1000 sem truncar", () => {
    const metrics = normalizeProductStockMetrics({
      product_count: "1250",
      low_count: "1001",
      stalled_count: "1002",
      units: "3400",
      sale_value: "98765.43",
      cost_value: "45678.9",
      parts_count: "22",
      parts_units: "80",
      parts_low_count: "7",
      parts_sale_value: "1200",
      alert_count: "1008",
    });

    expect(metrics.product_count).toBe(1250);
    expect(metrics.low_count).toBe(1001);
    expect(metrics.stalled_count).toBe(1002);
  });

  it("carrega métricas por agregação no banco, não por paginação de produtos", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { product_count: 1501, low_count: 1200, stalled_count: 1300 },
      error: null,
    });

    const metrics = await loadProductStockMetrics({ rpc }, "store-1");

    expect(rpc).toHaveBeenCalledWith("product_stock_metrics", { _store_id: "store-1" });
    expect(metrics.product_count).toBe(1501);
    expect(metrics.low_count).toBe(1200);
    expect(metrics.stalled_count).toBe(1300);
  });
});