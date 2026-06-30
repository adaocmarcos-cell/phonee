import { describe, it, expect } from "vitest";
import { createDedupTracker, planSourceKey } from "./trackDedup";

describe("createDedupTracker", () => {
  it("permite o primeiro evento", () => {
    const t = createDedupTracker(800, () => 1000);
    expect(t.track("trial:pricing_card")).toBe(true);
  });

  it("deduplica evento idêntico dentro da janela", () => {
    let n = 1000;
    const t = createDedupTracker(800, () => n);
    expect(t.track("trial:pricing_card")).toBe(true);
    n = 1200; // 200ms depois
    expect(t.track("trial:pricing_card")).toBe(false);
    n = 1500; // 500ms depois
    expect(t.track("trial:pricing_card")).toBe(false);
  });

  it("permite mesmo evento após a janela", () => {
    let n = 1000;
    const t = createDedupTracker(800, () => n);
    expect(t.track("trial:pricing_card")).toBe(true);
    n = 1900; // 900ms depois (> 800)
    expect(t.track("trial:pricing_card")).toBe(true);
  });

  it("não deduplica chaves diferentes (plano ou source distintos)", () => {
    const t = createDedupTracker(800, () => 1000);
    expect(t.track(planSourceKey("trial", "pricing_card"))).toBe(true);
    expect(t.track(planSourceKey("annual", "pricing_card"))).toBe(true);
    expect(t.track(planSourceKey("trial", "header"))).toBe(true);
  });

  it("reset() limpa o estado", () => {
    const t = createDedupTracker(800, () => 1000);
    t.track("k");
    t.reset();
    expect(t.last()).toBeNull();
    expect(t.track("k")).toBe(true);
  });

  it("simula clique duplo / keyboard+click — apenas 1 evento real", () => {
    let n = 1000;
    const t = createDedupTracker(800, () => n);
    const fired: string[] = [];
    const tryFire = (k: string) => { if (t.track(k)) fired.push(k); };
    // Burst: Enter dispara keydown -> click sintético + click do mouse
    tryFire("trial:pricing_card"); n += 5;
    tryFire("trial:pricing_card"); n += 10;
    tryFire("trial:pricing_card");
    expect(fired).toEqual(["trial:pricing_card"]);
  });
});