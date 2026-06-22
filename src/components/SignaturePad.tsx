import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export function SignaturePad({
  value, onChange, label,
}: { value?: string | null; onChange: (dataUrl: string | null) => void; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [empty, setEmpty] = useState(!value);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    ctx.scale(dpr, dpr); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 2;
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
      setEmpty(false);
    }
  }, []); // eslint-disable-line

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono">{label}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => {
          const c = canvasRef.current; if (!c) return;
          const ctx = c.getContext("2d")!; ctx.clearRect(0, 0, c.width, c.height);
          setEmpty(true); onChange(null);
        }}><Eraser className="h-3 w-3 mr-1" />Limpar</Button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-32 bg-white border border-border rounded-md cursor-crosshair touch-none"
        onPointerDown={(e) => {
          setDrawing(true);
          const ctx = canvasRef.current!.getContext("2d")!;
          const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing) return;
          const ctx = canvasRef.current!.getContext("2d")!;
          const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => {
          if (!drawing) return;
          setDrawing(false);
          const c = canvasRef.current!;
          onChange(empty ? null : c.toDataURL("image/png"));
        }}
        onPointerLeave={() => setDrawing(false)}
      />
      <p className="text-[10px] text-muted-foreground">Assine no quadro acima com o mouse ou o dedo.</p>
    </div>
  );
}