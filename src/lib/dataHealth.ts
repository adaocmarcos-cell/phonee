import { supabase } from "@/integrations/supabase/client";

export type DataHealth = {
  store_id: string;
  aparelhos_total: number;
  aparelhos_sem_imei: number;
  seminovos_multi_unidade: number;
  pendentes_total: number;
  regularizados: number;
  pct_completo: number;
  prazo_em_dias: number;
  dias_restantes: number;
  vencido: boolean;
  iniciado_em: string | null;
  concluido_em: string | null;
};

export const REGULARIZE_ROUTE = "/painel/estoque/aparelhos/regularizar";

/** Tom escalonado pelo prazo restante. */
export type HealthTone = "neutral" | "attention" | "urgent";

export function healthTone(h: Pick<DataHealth, "dias_restantes" | "vencido">): HealthTone {
  if (h.vencido || h.dias_restantes < 5) return "urgent";
  if (h.dias_restantes <= 15) return "attention";
  return "neutral";
}

export async function loadDataHealth(storeId: string): Promise<DataHealth | null> {
  const { data, error } = await (supabase as any).rpc("store_data_health", { _store_id: storeId });
  if (error || !data) return null;
  return data as DataHealth;
}

/** Recalcula e sincroniza o alerta único da loja (cria/atualiza/resolve). */
export async function syncDataHealthAlert(storeId: string): Promise<DataHealth | null> {
  const { data, error } = await (supabase as any).rpc("sync_data_health_alert", { _store_id: storeId });
  if (error || !data) return null;
  return data as DataHealth;
}

export async function markModalSeen() {
  await (supabase as any).rpc("mark_data_health_modal_seen");
}

export async function hasSeenModal(): Promise<boolean> {
  const { data } = await (supabase as any).rpc("my_data_health_modal_seen");
  return data === true;
}

/** Produtos pendentes de regularização (aparelho sem IMEI ou com quantidade > 1). */
export async function loadPendingDevices(storeId: string, limit = 300) {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,brand,sku,imei,color,storage_gb,stock_current,condition")
    .eq("store_id", storeId)
    .eq("item_kind", "aparelho")
    .gt("stock_current", 0)
    .or("imei.is.null,imei.eq.,stock_current.gt.1")
    .order("name")
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as any[];
}
