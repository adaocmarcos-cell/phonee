export type ProductStockMetrics = {
  product_count: number;
  units: number;
  low_count: number;
  stalled_count: number;
  sale_value: number;
  cost_value: number;
  parts_count: number;
  parts_units: number;
  parts_low_count: number;
  parts_sale_value: number;
  alert_count: number;
};

const zeroMetrics: ProductStockMetrics = {
  product_count: 0,
  units: 0,
  low_count: 0,
  stalled_count: 0,
  sale_value: 0,
  cost_value: 0,
  parts_count: 0,
  parts_units: 0,
  parts_low_count: 0,
  parts_sale_value: 0,
  alert_count: 0,
};

export function normalizeProductStockMetrics(raw: any): ProductStockMetrics {
  return {
    product_count: Number(raw?.product_count ?? 0),
    units: Number(raw?.units ?? 0),
    low_count: Number(raw?.low_count ?? 0),
    stalled_count: Number(raw?.stalled_count ?? 0),
    sale_value: Number(raw?.sale_value ?? 0),
    cost_value: Number(raw?.cost_value ?? 0),
    parts_count: Number(raw?.parts_count ?? 0),
    parts_units: Number(raw?.parts_units ?? 0),
    parts_low_count: Number(raw?.parts_low_count ?? 0),
    parts_sale_value: Number(raw?.parts_sale_value ?? 0),
    alert_count: Number(raw?.alert_count ?? 0),
  };
}

export async function loadProductStockMetrics(client: any, storeId: string): Promise<ProductStockMetrics> {
  const { data, error } = await client.rpc("product_stock_metrics", { _store_id: storeId });
  if (error) throw error;
  return data ? normalizeProductStockMetrics(data) : zeroMetrics;
}