// Helpers puros de diff usados por EditDiffDialog e por testes.
// Trabalha com o payload gravado pelas RPCs `update_purchase_with_stock`
// e `update_sale_with_stock` em `audit_log.details`.
//
// Shape esperado:
//   {
//     antes:  { total: number, items: Array<Item> },
//     depois: { total: number, items: Array<Item> },
//   }
// Compras (purchase_order):  Item = { product_id, name, quantity, unit_cost, total }
// Vendas  (sale):            Item = { product_id, name, is_service?, quantity, unit_price, total }

export type DiffKind = "added" | "removed" | "changed" | "unchanged";

export type DiffItem = {
  key: string;
  name: string;
  is_service?: boolean;
  before: { quantity: number; unit: number; total: number } | null;
  after: { quantity: number; unit: number; total: number } | null;
  qtyDelta: number;
  totalDelta: number;
  kind: DiffKind;
};

export type DiffSnapshot = {
  totalBefore: number;
  totalAfter: number;
  totalDelta: number;
  items: DiffItem[];
  counts: Record<DiffKind, number>;
};

type RawItem = {
  product_id?: string | null;
  name?: string | null;
  product_name?: string | null;
  is_service?: boolean;
  quantity?: number | string | null;
  unit_cost?: number | string | null;
  unit_price?: number | string | null;
  total?: number | string | null;
};

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

function itemKey(it: RawItem, idx: number): string {
  // Prioriza product_id (produto); serviços caem no nome + índice para permitir múltiplos serviços iguais.
  if (it.product_id) return `p:${it.product_id}`;
  const nm = it.name ?? it.product_name ?? `item ${idx + 1}`;
  return `s:${nm}#${idx}`;
}

function readItem(it: RawItem) {
  return {
    quantity: n(it.quantity),
    unit: n(it.unit_price ?? it.unit_cost),
    total: n(it.total ?? n(it.quantity) * n(it.unit_price ?? it.unit_cost)),
  };
}

export function buildDiff(details: any): DiffSnapshot {
  const antesItems: RawItem[] = Array.isArray(details?.antes?.items) ? details.antes.items : [];
  const depoisItems: RawItem[] = Array.isArray(details?.depois?.items) ? details.depois.items : [];

  const beforeMap = new Map<string, { it: RawItem; idx: number }>();
  antesItems.forEach((it, idx) => beforeMap.set(itemKey(it, idx), { it, idx }));
  const afterMap = new Map<string, { it: RawItem; idx: number }>();
  depoisItems.forEach((it, idx) => afterMap.set(itemKey(it, idx), { it, idx }));

  const seen = new Set<string>();
  const out: DiffItem[] = [];
  const counts: Record<DiffKind, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };

  const push = (
    key: string,
    name: string,
    is_service: boolean | undefined,
    beforeRaw: RawItem | null,
    afterRaw: RawItem | null,
  ) => {
    const before = beforeRaw ? readItem(beforeRaw) : null;
    const after = afterRaw ? readItem(afterRaw) : null;
    let kind: DiffKind;
    if (!before && after) kind = "added";
    else if (before && !after) kind = "removed";
    else if (before && after && (before.quantity !== after.quantity || before.unit !== after.unit || before.total !== after.total)) kind = "changed";
    else kind = "unchanged";
    counts[kind]++;
    out.push({
      key,
      name,
      is_service,
      before,
      after,
      qtyDelta: (after?.quantity ?? 0) - (before?.quantity ?? 0),
      totalDelta: (after?.total ?? 0) - (before?.total ?? 0),
      kind,
    });
  };

  antesItems.forEach((it, idx) => {
    const key = itemKey(it, idx);
    seen.add(key);
    const after = afterMap.get(key);
    push(key, (it.name ?? it.product_name ?? `Item ${idx + 1}`) as string, it.is_service, it, after?.it ?? null);
  });
  depoisItems.forEach((it, idx) => {
    const key = itemKey(it, idx);
    if (seen.has(key)) return;
    push(key, (it.name ?? it.product_name ?? `Item ${idx + 1}`) as string, it.is_service, null, it);
  });

  const totalBefore = n(details?.antes?.total);
  const totalAfter = n(details?.depois?.total);
  return {
    totalBefore,
    totalAfter,
    totalDelta: totalAfter - totalBefore,
    items: out,
    counts,
  };
}