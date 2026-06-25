import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

export type SortableItem = { id: string; node: ReactNode };

interface Props {
  storageKey: string;
  items: SortableItem[];
  editing: boolean;
  className?: string;
}

/**
 * Grid de cards reordenáveis via drag-and-drop.
 * Mantém a ordem em localStorage por `storageKey`.
 * Quando `editing` é falso, os cards renderizam normalmente.
 */
export function SortableCards({ storageKey, items, editing, className }: Props) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const idsKey = ids.join("|");

  const [order, setOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const filtered = parsed.filter((id) => ids.includes(id));
        const missing = ids.filter((id) => !filtered.includes(id));
        return [...filtered, ...missing];
      }
    } catch {
      /* ignore */
    }
    return ids;
  });

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Sincroniza quando items mudam (cards adicionados/removidos)
  useEffect(() => {
    setOrder((prev) => {
      const filtered = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !filtered.includes(id));
      const next = [...filtered, ...missing];
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, storageKey]);

  const move = (from: string, to: string) => {
    setOrder((prev) => {
      const a = prev.indexOf(from);
      const b = prev.indexOf(to);
      if (a < 0 || b < 0 || a === b) return prev;
      const next = [...prev];
      next.splice(a, 1);
      next.splice(b, 0, from);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const map = new Map(items.map((i) => [i.id, i.node] as const));

  return (
    <div className={className}>
      {order.map((id) => {
        const node = map.get(id);
        if (!node) return null;
        const isDragging = dragId === id;
        const isOver = overId === id && dragId && dragId !== id;
        return (
          <div
            key={id}
            draggable={editing}
            onDragStart={(e) => {
              if (!editing) return;
              setDragId(id);
              e.dataTransfer.effectAllowed = "move";
              try {
                e.dataTransfer.setData("text/plain", id);
              } catch {
                /* ignore */
              }
            }}
            onDragOver={(e) => {
              if (!editing || !dragId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overId !== id) setOverId(id);
            }}
            onDragLeave={() => {
              if (overId === id) setOverId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (editing && dragId && dragId !== id) move(dragId, id);
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className={`relative transition ${
              editing ? "cursor-grab active:cursor-grabbing" : ""
            } ${isDragging ? "opacity-50 scale-[0.98]" : ""} ${
              isOver ? "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl" : ""
            }`}
          >
            {editing && (
              <div
                aria-hidden
                className="absolute -top-2 -left-2 z-10 bg-primary text-primary-foreground rounded-full p-1 shadow-md pointer-events-none animate-fade-in"
                title="Arraste para reordenar"
              >
                <GripVertical className="h-3 w-3" />
              </div>
            )}
            {node}
          </div>
        );
      })}
    </div>
  );
}