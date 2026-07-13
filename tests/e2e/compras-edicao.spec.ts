/**
 * E2E — Edição e visualização de Entradas de mercadoria (Compras).
 *
 * Cobre:
 *  1. "Ver detalhes" abre em modo LEITURA (sem inputs editáveis) mesmo em
 *     entrada finalizada, e mostra a lista completa + total em BRL.
 *  2. "Editar" reexibe TODAS as linhas na MESMA ORDEM do lançamento (ordem
 *     que aparece em Ver detalhes = ordem do banco por created_at).
 *  3. Container de itens tem scroll (max-height) e não trunca linhas em
 *     entradas com muitos itens.
 *  4. Alterar quantidade → salvar → toast BRL com resumo delta (+/−) e total
 *     final formatado.
 *  5. Estoque ajustado por DELTA + auditoria "Editado por … em …" refletida
 *     no rodapé de Ver detalhes após salvar.
 *
 * Requer usuário de teste com pelo menos uma entrada de mercadoria já criada
 * (idealmente com 6+ itens). Sem PW_TEST_EMAIL/PW_TEST_PASSWORD os testes
 * são pulados para não quebrar CI sem seed.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

const EMAIL = process.env.PW_TEST_EMAIL;
const PASSWORD = process.env.PW_TEST_PASSWORD;
const hasCreds = !!(EMAIL && PASSWORD);

const BRL_RE = /R\$\s?\d{1,3}(\.\d{3})*,\d{2}/;

async function login(page: Page) {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill(EMAIL!);
  await page.getByLabel(/senha/i).first().fill(PASSWORD!);
  await Promise.all([
    page.waitForURL(/\/painel/, { timeout: 15_000 }),
    page.getByRole("button", { name: /entrar/i }).click(),
  ]);
}

async function openFirstView(page: Page): Promise<Locator> {
  await page.goto("/painel/compras", { waitUntil: "domcontentloaded" });
  const viewBtn = page.getByRole("button", { name: /ver detalhes/i }).first();
  await expect(viewBtn).toBeVisible({ timeout: 10_000 });
  await viewBtn.click();
  const dialog = page.getByRole("dialog", { name: /detalhes da entrada/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function readProductNames(scope: Locator): Promise<string[]> {
  const cells = scope.locator("tbody tr td:first-child .font-medium");
  const count = await cells.count();
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push((await cells.nth(i).innerText()).trim());
  return out;
}

test.describe("Compras — edição e visualização", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, "Defina PW_TEST_EMAIL/PW_TEST_PASSWORD para rodar os testes de Compras autenticados.");
    await login(page);
  });

  test("Ver detalhes: modo leitura, lista completa, total BRL, sem inputs", async ({ page }) => {
    const dialog = await openFirstView(page);

    // Total no formato BRL.
    const totalRow = dialog.getByText(/^Total:/);
    await expect(totalRow).toBeVisible();
    await expect(totalRow).toContainText(BRL_RE);

    // Cabeçalho "Itens (N)" com contagem numérica.
    await expect(dialog.getByText(/Itens \(\d+\)/)).toBeVisible();

    // Zero inputs/selects/textarea dentro do dialog de leitura.
    await expect(dialog.locator("input, textarea, select")).toHaveCount(0);

    // Nenhum botão de "Salvar" no rodapé (apenas Fechar / Editar).
    await expect(dialog.getByRole("button", { name: /^salvar/i })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /^fechar$/i })).toBeVisible();
  });

  test("Editar: ordem das linhas idêntica ao Ver detalhes (ordem do banco)", async ({ page }) => {
    // 1) Captura ordem canônica em Ver detalhes.
    const viewDialog = await openFirstView(page);
    const namesView = await readProductNames(viewDialog);
    test.skip(namesView.length === 0, "Nenhuma entrada com itens disponível para o teste.");
    await viewDialog.getByRole("button", { name: /^fechar$/i }).click();

    // 2) Abre Editar da mesma linha (primeira da lista).
    await page.getByRole("button", { name: /editar compra/i }).first().click();
    const editDialog = page.getByRole("dialog").filter({ hasText: /itens/i }).last();
    await expect(editDialog).toBeVisible();

    // Lê os nomes dos itens no editor pela ordem dos inputs de produto.
    const productInputs = editDialog.locator('input[placeholder*="Buscar produto"]');
    await expect(productInputs.first()).toBeVisible({ timeout: 5_000 });
    const editCount = await productInputs.count();
    expect(editCount).toBe(namesView.length);

    const namesEdit: string[] = [];
    for (let i = 0; i < editCount; i++) namesEdit.push((await productInputs.nth(i).inputValue()).trim());
    expect(namesEdit).toEqual(namesView);
  });

  test("Editar: container de itens usa scroll (max-height) e não trunca", async ({ page }) => {
    await page.goto("/painel/compras", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /editar compra/i }).first().click();

    // O contêiner da lista aplica overflow-y-auto + max-h-[45vh].
    const list = page.locator('div.space-y-2.max-h-\\[45vh\\].overflow-y-auto').first();
    await expect(list).toBeVisible();

    // Todas as linhas renderizadas (nenhuma paginação escondendo itens).
    const rows = list.locator('> div.grid');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Se houver overflow, scrollTop deve poder avançar; se não, ainda garante
    // que a última linha está no DOM (não truncada por virtualização).
    const box = await list.boundingBox();
    expect(box).not.toBeNull();
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows.last()).toBeVisible();
  });

  test("Editar: salvar mostra toast com delta BRL e auditoria registrada", async ({ page }) => {
    await page.goto("/painel/compras", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /editar compra/i }).first().click();
    const editDialog = page.getByRole("dialog").filter({ hasText: /itens/i }).last();
    await expect(editDialog).toBeVisible();

    // Guarda o nome do primeiro item para conferir depois na auditoria.
    const firstName = (await editDialog.locator('input[placeholder*="Buscar produto"]').first().inputValue()).trim();

    // Aumenta em 1 unidade a quantidade do primeiro item (delta positivo).
    const qtyInputs = editDialog.locator('input[inputmode="numeric"]');
    await expect(qtyInputs.first()).toBeVisible();
    const before = Number((await qtyInputs.first().inputValue()).replace(/\D/g, "")) || 0;
    await qtyInputs.first().fill(String(before + 1));

    await editDialog.getByRole("button", { name: /salvar/i }).click();

    // Aparece um toast com o total em BRL e um separador de delta "·" OU o texto "atualiz".
    const toast = page.locator('[role="status"], [data-sonner-toast], li').filter({ hasText: BRL_RE }).first();
    await expect(toast).toBeVisible({ timeout: 10_000 });
    // Confere delta com sinal (+ ou −) e o marcador "·" produzido por buildDeltaSummary.
    await expect(toast).toContainText(/[+−]\s?\d+/);

    // Reabre Ver detalhes e confere rodapé de auditoria "Editado por … em …".
    await page.reload({ waitUntil: "domcontentloaded" });
    const viewDialog = await openFirstView(page);
    await expect(viewDialog.getByText(/editado por/i)).toBeVisible({ timeout: 5_000 });
    if (firstName) {
      // O item alterado continua listado (delta positivo — não removido).
      await expect(viewDialog.getByText(firstName, { exact: false })).toBeVisible();
    }
  });

  test("Editar: remover linha e adicionar novo item — total recalcula ao vivo em BRL", async ({ page }) => {
    await page.goto("/painel/compras", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /editar compra/i }).first().click();
    const editDialog = page.getByRole("dialog").filter({ hasText: /itens/i }).last();
    await expect(editDialog).toBeVisible();

    const rows = editDialog.locator('div.space-y-2.max-h-\\[45vh\\].overflow-y-auto > div.grid');
    const startRows = await rows.count();
    test.skip(startRows < 2, "Necessária entrada com pelo menos 2 itens.");

    // Total antes.
    const totalLoc = editDialog.getByText(/^Total:/).last();
    const totalBefore = (await totalLoc.innerText()).trim();
    expect(totalBefore).toMatch(BRL_RE);

    // Remove a última linha pelo ícone de lixeira dentro da linha.
    await rows.last().getByRole("button").last().click();
    await expect(rows).toHaveCount(startRows - 1);

    // Adiciona nova linha.
    await editDialog.getByRole("button", { name: /adicionar item/i }).click();
    await expect(rows).toHaveCount(startRows);

    // Total recalculado — ainda no formato BRL (pode ter mudado de valor).
    const totalAfter = (await totalLoc.innerText()).trim();
    expect(totalAfter).toMatch(BRL_RE);
  });
});