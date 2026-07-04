import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./VendaNova.tsx", import.meta.url), "utf8");

describe("VendaNova product search regression", () => {
  it("busca itens de venda no banco em vez de depender de um lote local de produtos", () => {
    expect(source).toContain("search_sale_products");
    expect(source).not.toMatch(/from\(["']products["']\)[\s\S]{0,500}\.range\(/);
  });

  it("sincroniza produtos recém cadastrados/alterados por realtime", () => {
    expect(source).toContain("postgres_changes");
    expect(source).toContain("table: \"products\"");
    expect(source).toContain("loadSaleProducts(productQueryDebounced)");
  });
});