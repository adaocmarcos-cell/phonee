import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, ArrowRight } from "lucide-react";

/**
 * Padrão Android-style (grade 3x3, dots numerados 1..9).
 * Valor é uma string "1-2-5-8-9". Início = verde, fim = vermelho, meio = amarelo.
 * Setas indicam direção do traçado. Suporta clique para adicionar/remover pontos.
 */
type Props = {
  value: string;
  onChange?: (v: string) => void;
  size?: number;
  readOnly?: boolean;
};

const parse = (v: string): number[] =>
  (v || "")
    .split(/[-,\s]+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => n >= 1 && n <= 9);

const dotPos = (i: number, size: number) => {
  const col = (i - 1) % 3;
  const row = Math.floor((i - 1) / 3);
  const pad = size * 0.16;
  const step = (size - pad * 2) / 2;
  return { x: pad + col * step, y: pad + row * step };
};

// HSL interpolation green(140) → yellow(50) → red(0)
const colorAt = (t: number) => {
  const hue = t < 0.5 ? 140 - (140 - 50) * (t / 0.5) : 50 - 50 * ((t - 0.5) / 0.5);
  return `hsl(${hue}, 80%, 45%)`;
};

export function PatternLock({ value, onChange, size = 180, readOnly = false }: Props) {
  const seq = useMemo(() => parse(value), [value]);
  const positions = useMemo(() => Array.from({ length: 9 }, (_, i) => dotPos(i + 1, size)), [size]);

  const toggle = (i: number) => {
    if (readOnly || !onChange) return;
    if (seq.includes(i)) {
      onChange(seq.filter((x) => x !== i).join("-"));
    } else {
      onChange([...seq, i].join("-"));
    }
  };

  const clear = () => onChange?.("");

  return (
    <div className="inline-flex flex-col gap-2">
      <div
        className="relative rounded-xl border border-border bg-surface-elevated p-2 shadow-inner"
        style={{ width: size, height: size }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 w-full h-full">
          <defs>
            <marker
              id="patternArrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>

          {/* Segmentos coloridos com seta */}
          {seq.slice(0, -1).map((from, idx) => {
            const to = seq[idx + 1];
            const a = positions[from - 1];
            const b = positions[to - 1];
            const t = seq.length > 1 ? idx / Math.max(1, seq.length - 2) : 0;
            const color = colorAt(t);
            return (
              <g key={`seg-${idx}`} style={{ color }}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  markerEnd="url(#patternArrow)"
                  opacity={0.9}
                />
              </g>
            );
          })}

          {/* Dots */}
          {positions.map((p, idx) => {
            const i = idx + 1;
            const orderIdx = seq.indexOf(i);
            const isFirst = orderIdx === 0;
            const isLast = orderIdx === seq.length - 1 && seq.length > 1;
            const t =
              seq.length <= 1 ? 0 : orderIdx === -1 ? -1 : orderIdx / (seq.length - 1);
            const fill =
              orderIdx === -1
                ? "hsl(var(--muted))"
                : isFirst
                ? "hsl(140, 80%, 42%)"
                : isLast
                ? "hsl(0, 80%, 50%)"
                : colorAt(t);
            return (
              <g
                key={`dot-${i}`}
                onClick={() => toggle(i)}
                style={{ cursor: readOnly ? "default" : "pointer" }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={size * 0.075}
                  fill={fill}
                  stroke={orderIdx === -1 ? "hsl(var(--border))" : "white"}
                  strokeWidth={orderIdx === -1 ? 1 : 2}
                />
                {orderIdx !== -1 && (
                  <text
                    x={p.x}
                    y={p.y + 3}
                    textAnchor="middle"
                    fontSize={size * 0.07}
                    fontWeight="700"
                    fill="white"
                    style={{ pointerEvents: "none" }}
                  >
                    {orderIdx + 1}
                  </text>
                )}
                {isFirst && (
                  <text
                    x={p.x}
                    y={p.y - size * 0.105}
                    textAnchor="middle"
                    fontSize={size * 0.055}
                    fontWeight="700"
                    fill="hsl(140, 70%, 35%)"
                    style={{ pointerEvents: "none" }}
                  >
                    INÍCIO
                  </text>
                )}
                {isLast && (
                  <text
                    x={p.x}
                    y={p.y + size * 0.155}
                    textAnchor="middle"
                    fontSize={size * 0.055}
                    fontWeight="700"
                    fill="hsl(0, 70%, 42%)"
                    style={{ pointerEvents: "none" }}
                  >
                    FIM
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: "hsl(140,80%,42%)" }} />
              início
            </span>
            <ArrowRight className="h-3 w-3" />
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: "hsl(50,90%,50%)" }} />
              meio
            </span>
            <ArrowRight className="h-3 w-3" />
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: "hsl(0,80%,50%)" }} />
              fim
            </span>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={seq.length === 0}>
            <Eraser className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
        </div>
      )}
    </div>
  );
}