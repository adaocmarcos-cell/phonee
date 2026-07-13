// Mapeamento simplificado de apresentação do status de trade-in.
// O enum trade_in_status permanece intacto no banco: usamos apenas 2
// estados visíveis (Em estoque / Desativado) com um motivo sub-texto.
export type TradeInRawStatus =
  | "em_avaliacao"
  | "aprovado"
  | "em_estoque"
  | "vendido"
  | "recusado";

export type TradeInSimpleStatus = "em_estoque" | "desativado";

export const REASON_LABEL: Record<TradeInRawStatus, string> = {
  em_avaliacao: "Em avaliação",
  aprovado: "Aguardando entrada",
  em_estoque: "Em estoque",
  vendido: "Vendido",
  recusado: "Recusado",
};

export function toSimpleStatus(raw: string | null | undefined): TradeInSimpleStatus {
  return raw === "em_estoque" ? "em_estoque" : "desativado";
}

export function simpleStatusLabel(s: TradeInSimpleStatus) {
  return s === "em_estoque" ? "Em estoque" : "Desativado";
}

export function reasonSubtext(raw: string | null | undefined): string {
  if (!raw || raw === "em_estoque") return "";
  return REASON_LABEL[raw as TradeInRawStatus] ?? raw;
}

export const SIMPLE_STATUS_TOOLTIP: Record<TradeInSimpleStatus, string> = {
  em_estoque: "Aparelho ativo, disponível como produto no estoque.",
  desativado: "Fora do estoque ativo — em avaliação, recusado, vendido ou aguardando entrada.",
};

// Motivos válidos ao DESATIVAR um aparelho que estava no estoque.
// key = valor interno; label = exibido; targetStatus = enum a gravar.
export const DEACTIVATE_REASONS: {
  key: string;
  label: string;
  targetStatus: TradeInRawStatus;
  scrapForParts?: boolean;
}[] = [
  { key: "recusado", label: "Recusado", targetStatus: "recusado" },
  { key: "devolvido", label: "Devolvido ao cliente", targetStatus: "recusado" },
  { key: "sucata", label: "Sucata para peças", targetStatus: "em_avaliacao", scrapForParts: true },
];