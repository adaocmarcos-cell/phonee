/**
 * Configuração central de marketing/tráfego pago.
 * Substitua os placeholders pelos valores reais antes de rodar campanhas.
 */

/** ID do Meta Pixel (Facebook). Deixe como placeholder para desativar. */
export const META_PIXEL_ID = "COLOQUE_SEU_PIXEL_ID_AQUI";

/** Número de WhatsApp (formato internacional, apenas dígitos). */
export const WHATSAPP_NUMBER = "5531900000000";

/** Mensagem padrão enviada ao clicar em qualquer CTA de WhatsApp. */
export const WHATSAPP_DEFAULT_MESSAGE =
  "Olá! Vi o anúncio do Phonee e quero testar na minha loja";

const PLACEHOLDERS = new Set([
  "COLOQUE_SEU_PIXEL_ID_AQUI",
  "",
  "0",
]);

export function isPixelConfigured(): boolean {
  return !!META_PIXEL_ID && !PLACEHOLDERS.has(META_PIXEL_ID);
}

/** Monta a URL wa.me com mensagem pré-preenchida, anexando UTM discretamente. */
export function buildWhatsappUrl(message: string = WHATSAPP_DEFAULT_MESSAGE, utmCampaign?: string | null): string {
  const suffix = utmCampaign ? ` [origem: ${utmCampaign}]` : "";
  const text = encodeURIComponent(`${message}${suffix}`);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}