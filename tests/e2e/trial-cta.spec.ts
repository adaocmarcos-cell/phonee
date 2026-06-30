/**
 * E2E — fluxo do CTA "Experimente grátis".
 *
 * Garante:
 *  1. Clique no CTA do card Trial navega para /testegratis.
 *  2. Apenas UM evento `Lead` (Meta) é disparado durante o fluxo.
 *  3. Nenhum evento extra duplicado é emitido após o cadastro / navegação.
 */
import { test, expect, type Page } from "@playwright/test";

type FbqCall = [string, string, Record<string, unknown>?];

async function installFbqSpy(page: Page) {
  // Instala um stub de fbq + getter para inspecionar as chamadas, ANTES da app carregar.
  await page.addInitScript(() => {
    const calls: FbqCall[] = [] as unknown as FbqCall[];
    const fn = (...args: unknown[]) => {
      // @ts-ignore
      calls.push(args as FbqCall);
    };
    // @ts-ignore
    fn.queue = [];
    // @ts-ignore
    fn.loaded = true;
    // @ts-ignore
    window.fbq = fn;
    // @ts-ignore
    window.__fbqCalls = calls;
  });
}

async function getTrackedEvents(page: Page, name?: string) {
  const calls = await page.evaluate(() => (window as any).__fbqCalls as FbqCall[]);
  return name ? calls.filter((c) => c[0] === "track" && c[1] === name) : calls;
}

test.describe("CTA Experimente Grátis — E2E", () => {
  test("navega para /testegratis e dispara apenas 1 evento Lead", async ({ page }) => {
    await installFbqSpy(page);
    await page.goto("/#preco", { waitUntil: "networkidle" });

    const cta = page.getByRole("link", { name: /experimentar grátis por 7 dias/i });
    await expect(cta).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/testegratis$/),
      cta.click(),
    ]);

    // Aguarda eventuais eventos assíncronos da nova rota.
    await page.waitForTimeout(500);

    const leads = await getTrackedEvents(page, "Lead");
    expect(leads.length, "deve disparar exatamente 1 Lead no fluxo Trial").toBe(1);

    // Não deve haver InitiateCheckout disparado pelo Trial.
    const checkouts = await getTrackedEvents(page, "InitiateCheckout");
    expect(checkouts.length).toBe(0);
  });

  test("clique duplo rápido não duplica evento (dedup 800ms)", async ({ page }) => {
    await installFbqSpy(page);
    await page.goto("/#preco", { waitUntil: "networkidle" });

    const cta = page.getByRole("link", { name: /experimentar grátis por 7 dias/i });
    await expect(cta).toBeVisible();

    // Dispara 2 cliques antes da navegação (preventDefault no segundo é natural pois já navegou).
    await cta.dispatchEvent("click");
    await cta.dispatchEvent("click");
    await page.waitForTimeout(300);

    const leads = await getTrackedEvents(page, "Lead");
    expect(leads.length).toBe(1);
  });
});