/**
 * Visual regression — Planos & Preços CTAs.
 * Garante que o botão "Experimentar Grátis" fica no rodapé do card
 * (sem sobreposição) em desktop, tablet e mobile.
 *
 * Executa contra o dev server local em http://localhost:8080.
 * Rodar manualmente: `bunx playwright test tests/visual/preco-cta.spec.ts`
 */
import { test, expect } from "@playwright/test";

const VIEWS = [
  { name: "desktop", width: 1280, height: 1800 },
  { name: "tablet",  width: 820,  height: 1180 },
  { name: "mobile",  width: 390,  height: 844  },
];

for (const v of VIEWS) {
  test(`CTA Trial fica no rodapé do card — ${v.name}`, async ({ page }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.goto("http://localhost:8080/#preco", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    const cta = page.getByRole("link", { name: /experimentar grátis por 7 dias/i });
    await expect(cta).toBeVisible();

    const ctaBox  = await cta.boundingBox();
    const card    = page.locator("#preco").locator("xpath=.//a[contains(@aria-label,'Experimentar grátis')]/ancestor::*[contains(@class,'border-2')][1]");
    const cardBox = await card.boundingBox();
    if (!ctaBox || !cardBox) throw new Error("missing box");

    // Botão dentro dos limites do card (sem clipping).
    expect(ctaBox.x).toBeGreaterThanOrEqual(cardBox.x - 1);
    expect(ctaBox.x + ctaBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);

    // Botão posicionado no rodapé do card (últimos 40% da altura).
    const ctaCenterY = ctaBox.y + ctaBox.height / 2;
    expect(ctaCenterY).toBeGreaterThan(cardBox.y + cardBox.height * 0.55);

    // Altura padronizada e largura ~90% do card.
    expect(Math.round(ctaBox.height)).toBeGreaterThanOrEqual(44);
    expect(Math.round(ctaBox.height)).toBeLessThanOrEqual(52);
    expect(ctaBox.width / cardBox.width).toBeGreaterThan(0.6);
  });
}
