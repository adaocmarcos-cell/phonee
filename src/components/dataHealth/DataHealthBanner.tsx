import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Smartphone, AlertTriangle, ShieldCheck } from "lucide-react";
import { BannerSlotItem } from "@/components/layout/BannerSlot";
import { DataHealthModal } from "./DataHealthModal";
import { REGULARIZE_ROUTE, healthTone, syncDataHealthAlert, type DataHealth } from "@/lib/dataHealth";

const TONE = {
  neutral:   { wrap: "border-info/30 bg-info/5",       accent: "text-info",    bar: "[&>div]:bg-info" },
  attention: { wrap: "border-warning/40 bg-warning/10", accent: "text-warning", bar: "[&>div]:bg-warning" },
  urgent:    { wrap: "border-danger/40 bg-danger/10",   accent: "text-danger",  bar: "[&>div]:bg-danger" },
} as const;

export function DataHealthBanner() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState<DataHealth | null>(null);

  useEffect(() => {
    if (!store?.id) { setHealth(null); return; }
    let cancelled = false;
    (async () => {
      const h = await syncDataHealthAlert(store.id);
      if (!cancelled) setHealth(h);
    })();
    return () => { cancelled = true; };
  }, [store?.id]);

  // Zerou = some para sempre nesta loja (itens novos já nascem com IMEI obrigatório).
  if (!health || health.pendentes_total <= 0) return null;

  const tone = TONE[healthTone(health)];
  const done = health.regularizados;
  const total = health.aparelhos_total;
  const pct = Number(health.pct_completo) || 0;
  const urgente = healthTone(health) === "urgent";

  const prazoTexto = health.vencido
    ? "Prazo encerrado — o IMEI passa a ser exigido no momento da venda."
    : `Faltam ${health.dias_restantes} dia(s) para concluir a regularização.`;

  return (
    <BannerSlotItem id="data-health" priority={2}>
      <>
        <DataHealthModal health={health} />
        <div className={cn("mx-4 md:mx-6 mt-3 rounded-lg border px-4 py-3", tone.wrap)}>
          <div className="flex flex-wrap items-center gap-3">
            {urgente ? (
              <AlertTriangle className={cn("h-4 w-4 shrink-0", tone.accent)} />
            ) : (
              <Smartphone className={cn("h-4 w-4 shrink-0", tone.accent)} />
            )}
            <div className="flex-1 min-w-[220px]">
              <div className="text-sm font-medium">
                {done} de {total} aparelhos com IMEI cadastrado
              </div>
              <div className="text-xs text-muted-foreground">{prazoTexto}</div>
            </div>
            <Button size="sm" variant={urgente ? "default" : "outline"} onClick={() => navigate(REGULARIZE_ROUTE)} className="gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Regularizar agora
            </Button>
          </div>
          <Progress value={pct} className={cn("h-1.5 mt-2.5", tone.bar)} />
        </div>
      </>
    </BannerSlotItem>
  );
}
