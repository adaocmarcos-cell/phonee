import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/pages/app/Dashboard.tsx"), "utf8");

describe("Dashboard stock metrics regression", () => {
  it("usa métricas agregadas no banco para estoque baixo, encalhado e total", () => {
    expect(source).toContain("loadProductStockMetrics");
    expect(source).toContain("product_stock_metrics");
  });

  it("não volta a contar produtos por range paginado/truncado", () => {
    expect(source).not.toMatch(/from\(["']products["']\)[\s\S]{0,400}\.range\(/);
    expect(source).not.toContain(".range(0, 999)");
    expect(source).not.toContain(".range(0, 1000)");
    expect(source).not.toContain(".range(0, 49999)");
  });
});