import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/NumberInput";
import { Gift, CalendarClock } from "lucide-react";

type BonusType = "extensao_trial" | "mes_gratis" | "periodo_personalizado";

const PRESETS: { days: number; label: string; type: BonusType }[] = [
  { days: 7, label: "+7 dias", type: "extensao_trial" },
  { days: 15, label: "+15 dias", type: "extensao_trial" },
  { days: 30, label: "+1 mês", type: "mes_gratis" },
  { days: 90, label: "+3 meses", type: "mes_gratis" },
];

export function BonusDialog({
  open,
  onOpenChange,
  email,
  storeLabel,
  onGranted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  email: string;
  storeLabel?: string | null;
  onGranted?: () => void;
}) {
  const [emailValue, setEmailValue] = useState(email);
  const [type, setType] = useState<BonusType>("mes_gratis");
  const [days, setDays] = useState<number>(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const previewDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (days || 0));
    return d.toLocaleDateString("pt-BR");
  }, [days]);

  const reset = () => {
    setEmailValue(email);
    setType("mes_gratis");
    setDays(30);
    setReason("");
  };

  const submit = async () => {
    if (!emailValue.trim()) return toast.error("Informe o e-mail do cliente.");
    if (!days || days <= 0) return toast.error("Informe uma quantidade de dias válida.");
    if (!reason.trim()) return toast.error("Motivo é obrigatório.");
    setBusy(true);
    const { error } = await supabase.rpc("grant_access_bonus" as any, {
      p_email: emailValue.trim(),
      p_bonus_type: type,
      p_days: days,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Bônus concedido — acesso até ${previewDate}.`);
    reset();
    onOpenChange(false);
    onGranted?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-emerald-300" /> Bonificar acesso
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-400">E-mail do cliente</Label>
            <Input
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              className="bg-slate-950 border-slate-700"
            />
            {storeLabel && (
              <p className="text-[11px] text-slate-500 mt-1">Loja: {storeLabel}</p>
            )}
          </div>

          <div>
            <Label className="text-xs text-slate-400">Presets</Label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setDays(p.days);
                    setType(p.type);
                  }}
                  className={`text-xs rounded-md border px-2 py-1.5 transition ${
                    days === p.days && type === p.type
                      ? "bg-[#00abfb] text-slate-900 border-[#00abfb] font-semibold"
                      : "border-slate-700 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setType("periodo_personalizado")}
                className={`col-span-4 text-xs rounded-md border px-2 py-1.5 transition ${
                  type === "periodo_personalizado"
                    ? "bg-slate-800 border-slate-500 text-slate-100"
                    : "border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                Período personalizado
              </button>
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-400">Dias</Label>
            <NumberInput
              value={days}
              onValueChange={(n) => setDays(n)}
              allowDecimal={false}
              min={1}
              className="bg-slate-950 border-slate-700"
              placeholder="Ex.: 30"
            />
          </div>

          <div>
            <Label className="text-xs text-slate-400">Motivo (obrigatório)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: cortesia comercial / compensação por instabilidade"
              className="bg-slate-950 border-slate-700"
            />
          </div>

          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 px-3 py-2 text-sm flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Acesso válido até: <b>{previewDate}</b>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {busy ? "Concedendo…" : "Conceder bônus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}