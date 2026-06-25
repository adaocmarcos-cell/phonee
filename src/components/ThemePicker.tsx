import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Eye, EyeOff } from "lucide-react";
import { applyTheme, getTheme, setTheme, THEMES, type Theme } from "@/lib/preferences";

/**
 * Cada tema tem um conjunto de tokens (HSL) usado APENAS na miniatura de preview.
 * Os valores devem espelhar os definidos em `src/index.css`.
 */
const SWATCHES: Record<Theme, {
  bg: string; surface: string; card: string; primary: string;
  sidebar: string; text: string; muted: string; border: string;
}> = {
  light: {
    bg: "0 0% 96%", surface: "0 0% 100%", card: "0 0% 100%",
    primary: "200 100% 49%", sidebar: "226 50% 21%",
    text: "210 29% 24%", muted: "217 24% 54%", border: "0 0% 91%",
  },
  dark: {
    bg: "224 38% 14%", surface: "224 25% 22%", card: "224 25% 22%",
    primary: "200 100% 49%", sidebar: "226 50% 15%",
    text: "220 7% 83%", muted: "220 5% 72%", border: "222 16% 28%",
  },
  ocean: {
    bg: "215 55% 11%", surface: "215 50% 16%", card: "215 45% 20%",
    primary: "205 90% 56%", sidebar: "215 60% 9%",
    text: "210 30% 96%", muted: "210 25% 78%", border: "215 35% 26%",
  },
  clean: {
    bg: "0 0% 100%", surface: "210 30% 98%", card: "0 0% 100%",
    primary: "210 85% 45%", sidebar: "210 32% 97%",
    text: "215 40% 18%", muted: "215 18% 48%", border: "214 28% 90%",
  },
};

function ThemePreview({ theme }: { theme: Theme }) {
  const s = SWATCHES[theme];
  return (
    <div
      className="rounded-md overflow-hidden border shadow-sm flex h-28"
      style={{ borderColor: `hsl(${s.border})`, background: `hsl(${s.bg})` }}
      aria-hidden
    >
      {/* Sidebar mock */}
      <div className="w-12 flex flex-col gap-1.5 p-1.5" style={{ background: `hsl(${s.sidebar})` }}>
        <div className="h-1.5 rounded-sm" style={{ background: `hsl(${s.primary})` }} />
        <div className="h-1 rounded-sm" style={{ background: `hsl(${s.text} / 0.35)` }} />
        <div className="h-1 rounded-sm" style={{ background: `hsl(${s.text} / 0.25)` }} />
        <div className="h-1 rounded-sm" style={{ background: `hsl(${s.text} / 0.25)` }} />
        <div className="h-1 rounded-sm" style={{ background: `hsl(${s.text} / 0.25)` }} />
      </div>
      {/* Content mock */}
      <div className="flex-1 p-2 flex flex-col gap-1.5">
        <div className="h-2 w-2/3 rounded-sm" style={{ background: `hsl(${s.text} / 0.85)` }} />
        <div className="h-1.5 w-1/2 rounded-sm" style={{ background: `hsl(${s.muted} / 0.7)` }} />
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <div className="h-8 rounded" style={{ background: `hsl(${s.card})`, border: `1px solid hsl(${s.border})` }} />
          <div className="h-8 rounded" style={{ background: `hsl(${s.surface})`, border: `1px solid hsl(${s.border})` }} />
        </div>
        <div className="mt-auto flex items-center gap-1.5">
          <div className="h-3.5 w-12 rounded" style={{ background: `hsl(${s.primary})` }} />
          <div className="h-3.5 w-8 rounded" style={{ background: `hsl(${s.muted} / 0.35)`, border: `1px solid hsl(${s.border})` }} />
        </div>
      </div>
    </div>
  );
}

interface Props {
  value: Theme;
  onChange: (t: Theme) => void;
}

export function ThemePicker({ value, onChange }: Props) {
  const [preview, setPreview] = useState<Theme | null>(null);

  // Garante que ao desmontar (ou trocar de aba) o tema real é restaurado.
  useEffect(() => {
    return () => {
      applyTheme(getTheme());
    };
  }, []);

  const startPreview = (t: Theme) => {
    if (t === value) return;
    setPreview(t);
    applyTheme(t);
  };
  const endPreview = () => {
    if (preview == null) return;
    setPreview(null);
    applyTheme(getTheme());
  };
  const choose = (t: Theme) => {
    setPreview(null);
    setTheme(t);
    onChange(t);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {THEMES.map((t) => {
        const isActive = value === t.id;
        const isPreviewing = preview === t.id;
        return (
          <div
            key={t.id}
            className={`group rounded-lg border bg-card p-3 flex flex-col gap-3 transition-shadow ${
              isActive ? "border-primary ring-1 ring-primary shadow-glow" : "border-border hover:border-primary/40"
            }`}
          >
            <ThemePreview theme={t.id} />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm truncate">{t.name}</span>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary font-semibold">
                      <Check className="h-3 w-3" /> Atual
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{t.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                onMouseEnter={() => startPreview(t.id)}
                onMouseLeave={endPreview}
                onFocus={() => startPreview(t.id)}
                onBlur={endPreview}
                onTouchStart={() => startPreview(t.id)}
                onTouchEnd={endPreview}
                disabled={isActive}
                title={isActive ? "Este já é o tema ativo" : "Pré-visualizar"}
              >
                {isPreviewing ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {isPreviewing ? "Pré-visualizando" : "Pré-visualizar"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1"
                onClick={() => choose(t.id)}
                disabled={isActive}
              >
                {isActive ? "Em uso" : "Usar este tema"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}