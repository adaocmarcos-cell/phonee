import { describe, it, expect } from "vitest";
import {
  validateProductCategory,
  friendlyCategoryError,
  subcategoriesFor,
  NONE_SUBCATEGORY,
} from "./productCategory";

describe("validateProductCategory", () => {
  it("exige categoria principal", () => {
    const r = validateProductCategory({ category: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/categoria/i);
  });

  it("rejeita categoria fora do enum", () => {
    const r = validateProductCategory({ category: "capas" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/inválida/i);
  });

  it("aceita categoria válida sem subcategoria", () => {
    const r = validateProductCategory({ category: "acessorio" });
    expect(r).toEqual({ ok: true, category: "acessorio", subcategory: null });
  });

  it("trata sentinel '__none__' como ausência de subcategoria", () => {
    const r = validateProductCategory({ category: "acessorio", subcategory: NONE_SUBCATEGORY });
    expect(r).toEqual({ ok: true, category: "acessorio", subcategory: null });
  });

  it("aceita subcategoria 'outros' quando categoria é 'peca'", () => {
    const r = validateProductCategory({ category: "peca", subcategory: "outros" });
    expect(r).toEqual({ ok: true, category: "peca", subcategory: "outros" });
  });

  it("ignora subcategoria que não pertence à categoria atual (troca de categoria)", () => {
    // 'tela' pertence a peça, não a acessório → deve ser limpa, não rejeitada.
    const r = validateProductCategory({ category: "acessorio", subcategory: "tela" });
    expect(r).toEqual({ ok: true, category: "acessorio", subcategory: null });
  });

  it("aceita subcategoria 'capas' apenas em acessorio", () => {
    const r = validateProductCategory({ category: "acessorio", subcategory: "capas" });
    expect(r).toEqual({ ok: true, category: "acessorio", subcategory: "capas" });
  });
});

describe("subcategoriesFor", () => {
  it("retorna vazio quando nenhuma categoria foi escolhida", () => {
    expect(subcategoriesFor("")).toEqual([]);
  });

  it("retorna lista contextual de acessorio (inclui capas e Outros)", () => {
    const subs = subcategoriesFor("acessorio").map((s) => s.value);
    expect(subs).toContain("capas");
    expect(subs).toContain("outros");
  });

  it("retorna lista contextual de peca (inclui tela e Outros)", () => {
    const subs = subcategoriesFor("peca").map((s) => s.value);
    expect(subs).toContain("tela");
    expect(subs).toContain("outros");
  });

  it("retorna ao menos 'Outros' para categorias sem mapeamento", () => {
    const subs = subcategoriesFor("categoria_desconhecida").map((s) => s.value);
    expect(subs).toEqual(["outros"]);
  });
});

describe("friendlyCategoryError", () => {
  it("traduz erro de enum product_category com valor", () => {
    const msg = friendlyCategoryError({
      code: "22P02",
      message: 'invalid input value for enum product_category: "capas"',
    });
    expect(msg).toContain("capas");
    expect(msg).toMatch(/válida|Acessório/i);
  });

  it("traduz erro de enum sem valor extraível", () => {
    const msg = friendlyCategoryError({
      code: "22P02",
      message: "invalid input value for enum product_category",
    });
    expect(msg).toMatch(/inválida/i);
  });

  it("retorna null para erros não relacionados", () => {
    expect(friendlyCategoryError({ code: "23505", message: "duplicate key" })).toBeNull();
    expect(friendlyCategoryError(null)).toBeNull();
    expect(friendlyCategoryError(undefined)).toBeNull();
  });
});