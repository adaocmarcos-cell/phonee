import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Smartphone, FileCheck2, Ban } from "lucide-react";
import { hasSeenModal, markModalSeen, REGULARIZE_ROUTE, type DataHealth } from "@/lib/dataHealth";

/** Exibido UMA única vez por usuário. Escolher "Depois" também marca como visto. */
export function DataHealthModal({ health }: { health: DataHealth }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = await hasSeenModal();
      if (!cancelled && !seen) setOpen(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const close = async (goNow: boolean) => {
    setOpen(false);
    await markModalSeen();
    if (goNow) navigate(REGULARIZE_ROUTE);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" /> Cada aparelho agora tem IMEI
          </DialogTitle>
          <DialogDescription>
            Aparelhos passaram a ser cadastrados um a um, com IMEI obrigatório.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5 text-sm">
          <li className="flex gap-2"><ShieldCheck className="h-4 w-4 mt-0.5 text-success shrink-0" /> Rastreio individual do aparelho, da entrada até a venda.</li>
          <li className="flex gap-2"><FileCheck2 className="h-4 w-4 mt-0.5 text-info shrink-0" /> Garantia vinculada ao aparelho certo, sem discussão com o cliente.</li>
          <li className="flex gap-2"><Ban className="h-4 w-4 mt-0.5 text-warning shrink-0" /> Bloqueio de venda duplicada do mesmo aparelho.</li>
        </ul>

        <div className="rounded-md border border-border bg-surface-elevated/50 px-3 py-2.5 text-sm">
          Você tem <strong>{health.pendentes_total}</strong> aparelho(s) pendente(s).{" "}
          {health.vencido
            ? "O prazo já encerrou — o IMEI será pedido na hora da venda."
            : <>Prazo até <strong>{health.dias_restantes} dia(s)</strong>.</>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => close(false)}>Depois</Button>
          <Button onClick={() => close(true)}>Regularizar agora</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
