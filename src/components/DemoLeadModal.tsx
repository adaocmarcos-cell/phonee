import { useState, FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Play, AtSign, MessageCircle, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { enterDemoMode } from "@/lib/demoMode";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DemoLeadModal({ open, onOpenChange, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);

  const formatWhats = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const valid =
    name.trim().length >= 2 &&
    instagram.trim().replace(/^@+/, "").length >= 2 &&
    whatsapp.replace(/\D/g, "").length >= 10;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    toast.loading("Preparando ambiente de demonstração…", { id: "demo" });
    const res = await enterDemoMode({
      name: name.trim(),
      instagram: instagram.trim().replace(/^@+/, ""),
      whatsapp: whatsapp.replace(/\D/g, ""),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Não foi possível abrir a demonstração", { id: "demo" });
      return;
    }
    toast.success("Bem-vindo à demonstração!", { id: "demo" });
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Acesse a demonstração do Phonee</DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo para liberar acesso ao painel com dados fictícios.
            Levamos menos de 5 segundos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="lead-name" className="text-xs">Seu nome</Label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="João Silva"
                maxLength={120}
                autoComplete="name"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-instagram" className="text-xs">@ Instagram da sua loja</Label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="lead-instagram"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="sualoja"
                maxLength={60}
                autoCapitalize="none"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-whatsapp" className="text-xs">WhatsApp</Label>
            <div className="relative">
              <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="lead-whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(formatWhats(e.target.value))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
                className="pl-9"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={!valid || busy}
            className="w-full bg-gradient-primary shadow-glow h-11"
          >
            {busy ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparando…</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Entrar na demonstração</>
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            Ao continuar você concorda em receber contato comercial da equipe Phonee.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}