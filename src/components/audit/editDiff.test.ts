import { describe, it, expect } from "vitest";
import { buildDiff } from "./editDiff";

describe("buildDiff — auditoria de edição", () => {
  it("detecta alteração de quantidade em item existente (venda)", () => {
    const details = {
      antes: {
        total: 100,
        items: [{ product_id: "p1", name: "Cabo USB-C", quantity: 1, unit_price: 100, total: 100 }],
      },
      depois: {
        total: 200,
        items: [{ product_id: "p1", name: "Cabo USB-C", quantity: 2, unit_price: 100, total: 200 }],
      },
    };
    const d = buildDiff(details);
    expect(d.totalDelta).toBe(100);
    expect(d.items).toHaveLength(1);
    expect(d.items[0].kind).toBe("changed");
    expect(d.items[0].qtyDelta).toBe(1);
    expect(d.items[0].totalDelta).toBe(100);
    expect(d.counts.changed).toBe(1);
  });

  it("classifica itens adicionados e removidos", () => {
    const details = {
      antes: { total: 50, items: [{ product_id: "p1", name: "Fone", quantity: 1, unit_price: 50, total: 50 }] },
      depois: { total: 80, items: [{ product_id: "p2", name: "Capa", quantity: 1, unit_price: 80, total: 80 }] },
    };
    const d = buildDiff(details);
    expect(d.counts).toMatchObject({ added: 1, removed: 1, changed: 0, unchanged: 0 });
    expect(d.totalDelta).toBe(30);
    const removed = d.items.find((i) => i.kind === "removed");
    const added = d.items.find((i) => i.kind === "added");
    expect(removed?.name).toBe("Fone");
    expect(added?.name).toBe("Capa");
    expect(removed?.after).toBeNull();
    expect(added?.before).toBeNull();
  });

  it("compras: usa unit_cost e total", () => {
    const details = {
      antes: { total: 300, items: [{ product_id: "p1", name: "Bateria", quantity: 10, unit_cost: 30, total: 300 }] },
      depois: { total: 480, items: [{ product_id: "p1", name: "Bateria", quantity: 12, unit_cost: 40, total: 480 }] },
    };
    const d = buildDiff(details);
    expect(d.items[0].before?.unit).toBe(30);
    expect(d.items[0].after?.unit).toBe(40);
    expect(d.items[0].qtyDelta).toBe(2);
    expect(d.items[0].totalDelta).toBe(180);
  });

  it("preserva itens inalterados (unchanged)", () => {
    const details = {
      antes: { total: 100, items: [{ product_id: "p1", name: "X", quantity: 1, unit_price: 100, total: 100 }] },
      depois: { total: 100, items: [{ product_id: "p1", name: "X", quantity: 1, unit_price: 100, total: 100 }] },
    };
    const d = buildDiff(details);
    expect(d.counts.unchanged).toBe(1);
    expect(d.totalDelta).toBe(0);
  });

  it("aceita payload vazio sem quebrar", () => {
    const d = buildDiff({});
    expect(d.items).toHaveLength(0);
    expect(d.totalBefore).toBe(0);
    expect(d.totalAfter).toBe(0);
  });

  it("serviços sem product_id são diferenciados por nome+índice", () => {
    const details = {
      antes: { total: 200, items: [
        { name: "Troca de tela", is_service: true, quantity: 1, unit_price: 200, total: 200 },
      ]},
      depois: { total: 500, items: [
        { name: "Troca de tela", is_service: true, quantity: 1, unit_price: 200, total: 200 },
        { name: "Limpeza",       is_service: true, quantity: 1, unit_price: 300, total: 300 },
      ]},
    };
    const d = buildDiff(details);
    expect(d.counts).toMatchObject({ unchanged: 1, added: 1 });
    expect(d.totalDelta).toBe(300);
  });
});