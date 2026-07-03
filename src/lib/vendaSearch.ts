// Utilitários puros e testáveis usados pela tela Nova Venda para a busca
// de "Itens da Venda". Mantidos fora do componente para que possamos cobri-los
// com testes de unidade sem precisar montar o React/Supabase.

export type ProductLite = {
  id: string;
  name: string | null;
  sku?: string | null;
  ean?: string | null;
  category?: string | null;
  brand?: string | null;
  compatible_model?: string | null;
  color?: string | null;
  storage?: string | null;
  sale_price?: number | string | null;
  cost_price?: number | string | null;
  stock_current?: number | string | null;
};

const SEARCHABLE_FIELDS: (keyof ProductLite)[] = [
  "name", "sku", "ean", "category", "brand", "compatible_model",
];

/**
 * Busca case-insensitive e parcial sobre todas as colunas identificadoras.
 * Termo vazio -> primeiros N (visualização inicial ao focar).
 */
export function filterProducts(
  products: ProductLite[],
  rawQuery: string,
  opts: { emptyLimit?: number; matchLimit?: number } = {}
): ProductLite[] {
  const emptyLimit = opts.emptyLimit ?? 8;
  const matchLimit = opts.matchLimit ?? 20;
  const q = (rawQuery ?? "").trim().toLowerCase();
  if (!q) return products.slice(0, emptyLimit);
  return products
    .filter((p) =>
      SEARCHABLE_FIELDS
        .map((f) => p[f])
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .some((v) => v.toLowerCase().includes(q))
    )
    .slice(0, matchLimit);
}

export type SearchState =
  | { kind: "empty-table" }
  | { kind: "searching" }
  | { kind: "no-results"; term: string }
  | { kind: "results"; items: ProductLite[] }
  | { kind: "initial"; items: ProductLite[] };

/**
 * Máquina de estados do dropdown: distingue tabela vazia, busca em andamento
 * (debounce), sem resultado para o termo e resultados.
 */
export function getSearchState(
  products: ProductLite[],
  rawQuery: string,
  debouncedQuery: string
): SearchState {
  if (products.length === 0) return { kind: "empty-table" };
  const raw = (rawQuery ?? "").trim();
  const deb = (debouncedQuery ?? "").trim();
  if (raw !== deb) return { kind: "searching" };
  const items = filterProducts(products, deb);
  if (!deb) return { kind: "initial", items };
  if (items.length === 0) return { kind: "no-results", term: deb };
  return { kind: "results", items };
}

export type LineItemDraft = {
  product_id: string;
  name: string;
  code?: string | null;
  category?: string | null;
  color?: string | null;
  storage?: string | null;
  quantity: number;
  list_price: number;
  discount_pct: number;
  discount_brl: number;
  unit_price: number;
  stock_available: number;
};

export type BuildResult =
  | { ok: true; item: LineItemDraft; warnings: string[] }
  | { ok: false; error: string };

/**
 * Vincula os campos essenciais (product_id, nome, preço, estoque) ao item
 * da venda. Falha explícita se o produto vier sem id ou sem nome; caso
 * preço/estoque venham nulos, aplica fallback 0 e devolve um warning para
 * a UI mostrar via toast.
 */
export function buildLineItemFromProduct(p: ProductLite | null | undefined): BuildResult {
  if (!p || !p.id) return { ok: false, error: "Produto inválido (sem id)." };
  const name = (p.name ?? "").trim();
  if (!name) return { ok: false, error: "Produto sem nome cadastrado." };

  const warnings: string[] = [];
  const price = p.sale_price == null ? NaN : Number(p.sale_price);
  const stock = p.stock_current == null ? NaN : Number(p.stock_current);
  const safePrice = Number.isFinite(price) ? price : 0;
  const safeStock = Number.isFinite(stock) ? stock : 0;

  if (!Number.isFinite(price)) warnings.push(`"${name}" está sem preço de venda — usando R$ 0,00. Ajuste no cadastro do produto.`);
  else if (price <= 0) warnings.push(`"${name}" está com preço de venda zerado — confira antes de fechar a venda.`);
  if (!Number.isFinite(stock)) warnings.push(`"${name}" está sem estoque informado — considerando 0.`);

  return {
    ok: true,
    warnings,
    item: {
      product_id: p.id,
      name,
      code: p.sku ?? null,
      category: p.category ?? null,
      color: p.color ?? null,
      storage: p.storage ?? null,
      quantity: 1,
      list_price: safePrice,
      discount_pct: 0,
      discount_brl: 0,
      unit_price: safePrice,
      stock_available: safeStock,
    },
  };
}