import { describe, it, expect } from "vitest";
import { filterProducts, getSearchState, buildLineItemFromProduct, type ProductLite } from "./vendaSearch";

const P = (over: Partial<ProductLite>): ProductLite => ({
  id: over.id ?? crypto.randomUUID(),
  name: over.name ?? "Produto",
  ...over,
});

const products: ProductLite[] = [
  P({ id: "1", name: "CAPINHA TRANSPARENTE MAGSAFE IPHONE 15 PRO", sku: "CTMSI15PP", ean: "7890000000001", category: "Acessórios", brand: "Apple", compatible_model: "iPhone 15 Pro", sale_price: 79.9, stock_current: 2 }),
  P({ id: "2", name: "Pelicula 3D Xiaomi 13", sku: "PEL-X13", category: "Acessórios", brand: "Xiaomi", sale_price: 25 }),
  P({ id: "3", name: "Fonte Turbo 20W", sku: "FT20", ean: "7891234567890", sale_price: 59, stock_current: 5 }),
];

describe("filterProducts", () => {
  it("é case-insensitive (nome minúsculo encontra maiúsculo)", () => {
    expect(filterProducts(products, "capinha").map((p) => p.id)).toEqual(["1"]);
    expect(filterProducts(products, "CAPINHA").map((p) => p.id)).toEqual(["1"]);
  });

  it("faz match parcial em SKU", () => {
    expect(filterProducts(products, "ctmsi").map((p) => p.id)).toEqual(["1"]);
    expect(filterProducts(products, "15PP").map((p) => p.id)).toEqual(["1"]);
  });

  it("busca por EAN, marca e modelo compatível", () => {
    expect(filterProducts(products, "789000").map((p) => p.id)).toEqual(["1"]);
    expect(filterProducts(products, "xiaomi").map((p) => p.id)).toEqual(["2"]);
    expect(filterProducts(products, "iPhone 15").map((p) => p.id)).toEqual(["1"]);
  });

  it("termo vazio devolve os primeiros N (visualização inicial ao focar)", () => {
    expect(filterProducts(products, "", { emptyLimit: 2 })).toHaveLength(2);
    expect(filterProducts(products, "   ", { emptyLimit: 3 })).toHaveLength(3);
  });

  it("ignora campos nulos sem quebrar", () => {
    const withNulls: ProductLite[] = [P({ id: "x", name: "Só nome", sku: null, ean: null, brand: null })];
    expect(filterProducts(withNulls, "nome")).toHaveLength(1);
  });
});

describe("getSearchState", () => {
  it("tabela vazia -> empty-table (independe do termo)", () => {
    expect(getSearchState([], "qualquer", "qualquer").kind).toBe("empty-table");
  });

  it("termo digitado ainda não estabilizou no debounce -> searching", () => {
    expect(getSearchState(products, "capin", "").kind).toBe("searching");
    expect(getSearchState(products, "capin", "cap").kind).toBe("searching");
  });

  it("termo estabilizado sem match -> no-results com o termo", () => {
    const s = getSearchState(products, "zzz", "zzz");
    expect(s.kind).toBe("no-results");
    if (s.kind === "no-results") expect(s.term).toBe("zzz");
  });

  it("termo estabilizado com match -> results", () => {
    const s = getSearchState(products, "capinha", "capinha");
    expect(s.kind).toBe("results");
    if (s.kind === "results") expect(s.items.map((p) => p.id)).toEqual(["1"]);
  });

  it("sem termo mas com produtos -> initial (primeiros N)", () => {
    const s = getSearchState(products, "", "");
    expect(s.kind).toBe("initial");
    if (s.kind === "initial") expect(s.items.length).toBeGreaterThan(0);
  });
});

describe("buildLineItemFromProduct", () => {
  it("vincula product_id, nome, preço e estoque", () => {
    const r = buildLineItemFromProduct(products[0]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item.product_id).toBe("1");
      expect(r.item.name).toBe("CAPINHA TRANSPARENTE MAGSAFE IPHONE 15 PRO");
      expect(r.item.list_price).toBe(79.9);
      expect(r.item.unit_price).toBe(79.9);
      expect(r.item.stock_available).toBe(2);
      expect(r.warnings).toEqual([]);
    }
  });

  it("falha explícita se produto não tem id", () => {
    const r = buildLineItemFromProduct({ id: "", name: "x" } as any);
    expect(r.ok).toBe(false);
  });

  it("falha explícita se produto não tem nome", () => {
    const r = buildLineItemFromProduct(P({ id: "9", name: "   " }));
    expect(r.ok).toBe(false);
  });

  it("preço nulo -> fallback 0 + warning", () => {
    const r = buildLineItemFromProduct(P({ id: "9", name: "Sem preço", sale_price: null }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item.unit_price).toBe(0);
      expect(r.warnings.some((w) => w.includes("sem preço"))).toBe(true);
    }
  });

  it("estoque nulo -> fallback 0 + warning", () => {
    const r = buildLineItemFromProduct(P({ id: "9", name: "Sem estoque", sale_price: 10, stock_current: null }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item.stock_available).toBe(0);
      expect(r.warnings.some((w) => w.includes("sem estoque"))).toBe(true);
    }
  });

  it("preço zerado gera warning mas não falha", () => {
    const r = buildLineItemFromProduct(P({ id: "9", name: "Zerado", sale_price: 0, stock_current: 1 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some((w) => w.includes("zerado"))).toBe(true);
  });
});