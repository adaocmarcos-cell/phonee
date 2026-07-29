/**
 * Cadastro unificado de itens (tabela `products`).
 *
 * Após a unificação do antigo `parts_inventory` dentro de `products`, o campo
 * `item_kind` é o único separador entre o que é estoque de VENDA e o que é
 * estoque de ASSISTÊNCIA. Todas as telas devem filtrar por um destes conjuntos
 * para não misturar peças com aparelhos/acessórios.
 */

/** Itens de assistência técnica: peças e ferramentas. */
export const PARTS_KINDS = ["peca", "ferramenta"] as const;

/** Itens de venda: aparelhos e acessórios. */
export const SALEABLE_KINDS = ["aparelho", "acessorio"] as const;

export const PARTS_KINDS_ARR: string[] = [...PARTS_KINDS];
export const SALEABLE_KINDS_ARR: string[] = [...SALEABLE_KINDS];

/**
 * Colunas de uma peça no formato legado (`category` vem de `subcategory`),
 * para manter a UI de Peças/Ferramentas sem reescrita de tipos.
 */
export const PART_SELECT =
  "id,store_id,name,category:subcategory,category_other,sku,brand,compatible_models," +
  "cost_price,sale_price,stock_current,stock_min,supplier,location,notes,item_kind";

/** Relação embutida de peça a partir de uma FK que aponta para products. */
export const partRelation = (alias: string, fk: string, cols: string) =>
  `${alias}:products!${fk}(${cols})`;