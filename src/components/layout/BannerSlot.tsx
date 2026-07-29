import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Ctx = { register: (id: string, priority: number) => void; unregister: (id: string) => void; top: string | null };

const BannerSlotContext = createContext<Ctx>({ register: () => {}, unregister: () => {}, top: null });

/** Garante que apenas UM banner apareça por vez (menor prioridade numérica vence). */
export function BannerSlotProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, number>>({});

  const value = useMemo<Ctx>(() => {
    let top: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const [id, p] of Object.entries(items)) {
      if (p < best) { best = p; top = id; }
    }
    return {
      top,
      register: (id, priority) =>
        setItems((prev) => (prev[id] === priority ? prev : { ...prev, [id]: priority })),
      unregister: (id) =>
        setItems((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        }),
    };
  }, [items]);

  return <BannerSlotContext.Provider value={value}>{children}</BannerSlotContext.Provider>;
}

/** Envolva o conteúdo já "decidido" de um banner. Só o de maior prioridade renderiza. */
export function BannerSlotItem({ id, priority, children }: { id: string; priority: number; children: ReactNode }) {
  const { register, unregister, top } = useContext(BannerSlotContext);
  useEffect(() => {
    register(id, priority);
    return () => unregister(id);
  }, [id, priority, register, unregister]);
  if (top !== id) return null;
  return <>{children}</>;
}
