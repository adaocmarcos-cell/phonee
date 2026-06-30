/**
 * Cria um "tracker" de eventos com janela de deduplicação.
 * Eventos com a mesma chave dentro de `windowMs` são ignorados.
 *
 * Útil para impedir disparos duplicados de analytics em cliques rápidos,
 * eventos sintéticos (keyboard + click) e re-renderizações.
 */
export interface DedupTracker<T = unknown> {
  /** Tenta registrar `key`. Retorna `true` se passou, `false` se foi deduplicado. */
  track(key: string, payload?: T): boolean;
  /** Reseta o estado interno (útil para testes). */
  reset(): void;
  /** Última chave registrada (ou null). */
  last(): { key: string; ts: number } | null;
}

export function createDedupTracker<T = unknown>(
  windowMs = 800,
  now: () => number = () => Date.now(),
): DedupTracker<T> {
  let lastRef: { key: string; ts: number } | null = null;
  return {
    track(key: string) {
      const ts = now();
      if (lastRef && lastRef.key === key && ts - lastRef.ts < windowMs) {
        return false;
      }
      lastRef = { key, ts };
      return true;
    },
    reset() {
      lastRef = null;
    },
    last() {
      return lastRef;
    },
  };
}

/** Helper canônico para chave plano+source. */
export const planSourceKey = (plan: string, source: string) => `${plan}:${source}`;