// Avalia se a ficha de entrada de trade-in está "completa": pelo menos
// N itens de checklist preenchidos (ok/defeito) e ao menos 1 foto.
// Nada disso bloqueia a entrada — é apenas guia visual/opcional.

const MIN_CHECKLIST = 6; // de 12 itens
const MIN_PHOTOS = 1;

export type TradeInCompleteness = {
  complete: boolean;
  checklistFilled: number;
  photos: number;
  missing: string[]; // sugestões de ação
};

export function evaluateCompleteness(ti: {
  checklist?: Record<string, any> | null;
  photos_in?: string[] | null;
}): TradeInCompleteness {
  const cl = ti.checklist || {};
  const checklistFilled = Object.values(cl).filter(
    (v) => v === "ok" || v === "defeito",
  ).length;
  const photos = Array.isArray(ti.photos_in) ? ti.photos_in.length : 0;
  const missing: string[] = [];
  if (checklistFilled < MIN_CHECKLIST)
    missing.push(
      `Marcar mais itens do checklist (${checklistFilled}/${MIN_CHECKLIST} mínimos sugeridos)`,
    );
  if (photos < MIN_PHOTOS)
    missing.push("Anexar ao menos 1 foto do aparelho");
  return {
    complete: missing.length === 0,
    checklistFilled,
    photos,
    missing,
  };
}