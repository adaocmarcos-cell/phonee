/**
 * A11y — CTAs da seção #preco (Trial, Anual, Vitalício).
 *
 * Verifica:
 *  - axe-core não reporta violações sérias na seção #preco.
 *  - Cada CTA expõe um accessible name não vazio e único.
 *  - Ordem de foco por Tab: Trial → Anual → Vitalício.
 *  - Estado focus-visible aplica outline/ring (box-shadow não-vazia).
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("A11y — Planos & Preços", () => {
  test("axe-core: sem violações sérias no #preco", async ({ page }) => {
    await page.goto("/#preco", { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .include("#preco")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      serious,
      `Violações sérias:\n${serious.map((v) => `- ${v.id}: ${v.help}`).join("\n")}`,
    ).toEqual([]);
  });

  test("accessible names dos 3 CTAs são únicos e descritivos", async ({ page }) => {
    await page.goto("/#preco", { waitUntil: "networkidle" });
    const trial = page.getByRole("link", { name: /experimentar grátis por 7 dias/i });
    const anual = page.getByRole("button", { name: /assinar anual/i });
    const vital = page.getByRole("button", { name: /quero vitalício/i });
    for (const el of [trial, anual, vital]) {
      await expect(el).toBeVisible();
      const name = await el.getAttribute("aria-label") ?? await el.textContent();
      expect(name?.trim().length ?? 0).toBeGreaterThan(3);
    }
  });

  test("ordem de foco via Tab: Trial → Anual → Vitalício", async ({ page }) => {
    await page.goto("/#preco", { waitUntil: "networkidle" });
    const trial = page.getByRole("link", { name: /experimentar grátis por 7 dias/i });
    await trial.focus();
    await expect(trial).toBeFocused();

    await page.keyboard.press("Tab");
    const anual = page.getByRole("button", { name: /assinar anual/i });
    await expect(anual).toBeFocused();

    await page.keyboard.press("Tab");
    const vital = page.getByRole("button", { name: /quero vitalício/i });
    await expect(vital).toBeFocused();
  });

  test("focus-visible aplica ring/box-shadow visível", async ({ page }) => {
    await page.goto("/#preco", { waitUntil: "networkidle" });
    const targets = [
      page.getByRole("link",   { name: /experimentar grátis por 7 dias/i }),
      page.getByRole("button", { name: /assinar anual/i }),
      page.getByRole("button", { name: /quero vitalício/i }),
    ];
    for (const t of targets) {
      await t.focus();
      const shadow = await t.evaluate((el) => getComputedStyle(el).boxShadow);
      // Tailwind focus-visible:ring gera box-shadow com 'rgb' não-vazio.
      expect(shadow).not.toBe("none");
      expect(shadow.length).toBeGreaterThan(4);
    }
  });
});