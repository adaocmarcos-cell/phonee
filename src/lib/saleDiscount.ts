import { brl } from "./format";

export type SaleDiscountMode = "brl" | "pct";

export interface SaleDiscountState {
  mode: SaleDiscountMode;
  value: number;
}

export interface LineItemForDiscount {
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_amount: number; // Desconto já aplicado na linha (Desc R$)
}

/**
 * Calcula o valor absoluto do desconto geral a partir do modo e valor.
 * Base de cálculo: subtotal dos itens já líquido dos descontos de linha.
 */
export function calculateSaleDiscountAmount(subtotalLiquido: number, mode: SaleDiscountMode, value: number): number {
  if (value <= 0) return 0;
  let amount = 0;
  if (mode === "pct") {
    const pct = Math.min(100, Math.max(0, value));
    amount = subtotalLiquido * (pct / 100);
  } else {
    amount = Math.min(subtotalLiquido, Math.max(0, value));
  }
  return Number(amount.toFixed(2));
}

/**
 * Rateia o desconto geral entre os itens proporcionalmente ao valor bruto de cada linha (qty * unit_price).
 * Garante que a soma dos descontos rateados bata exatamente com o total esperado usando distribuição de resíduo.
 */
export function distributeSaleDiscount(
  items: LineItemForDiscount[],
  saleDiscountAmount: number
): { product_id: string; distributed_discount: number }[] {
  if (saleDiscountAmount <= 0 || items.length === 0) {
    return items.map(i => ({ product_id: i.product_id, distributed_discount: 0 }));
  }

  // O rateio é proporcional ao valor bruto da linha (antes do desconto de linha)
  // ou ao valor líquido? O requisito diz: "proporcionalmente a (quantity * unit_price)".
  const values = items.map(i => i.quantity * i.unit_price);
  const totalValue = values.reduce((a, b) => a + b, 0);

  if (totalValue === 0) {
    // Se tudo for zero, distribui igualmente (caso raro)
    const perItem = Number((saleDiscountAmount / items.length).toFixed(2));
    const result = items.map(i => ({ product_id: i.product_id, distributed_discount: perItem }));
    const diff = Number((saleDiscountAmount - (perItem * items.length)).toFixed(2));
    if (result.length > 0) result[0].distributed_discount = Number((result[0].distributed_discount + diff).toFixed(2));
    return result;
  }

  let distributedSum = 0;
  const result = items.map((item, idx) => {
    const val = values[idx];
    const share = val / totalValue;
    const amount = Number((saleDiscountAmount * share).toFixed(2));
    distributedSum = Number((distributedSum + amount).toFixed(2));
    return { product_id: item.product_id, distributed_discount: amount };
  });

  // Ajuste de resíduo na linha de maior valor
  const diff = Number((saleDiscountAmount - distributedSum).toFixed(2));
  if (Math.abs(diff) > 0.001) {
    let maxIdx = 0;
    let maxVal = -1;
    for (let i = 0; i < values.length; i++) {
      if (values[i] > maxVal) {
        maxVal = values[i];
        maxIdx = i;
      }
    }
    result[maxIdx].distributed_discount = Number((result[maxIdx].distributed_discount + diff).toFixed(2));
  }

  return result;
}
