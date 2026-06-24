import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Copy, Share2, MessageCircle, Instagram, Facebook, Link as LinkIcon,
  DollarSign, Gift, ArrowRight, Check, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const BASE_URL = "https://phonee.com.br";

function shortCode(full: string | null) {
  if (!full) return "";
  return full.replace(/^PHONEE-/, "");
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function IndiqueGanheQuickDialog({ open, onOpenChange }: Props) {
  const { user, profile } = useAuth() as any;
  const navigate = useNavigate();
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Ensures a code exists for this user
      await supabase.rpc("generate_referral_code");
      const { data } = await supabase.rpc("referral_dashboard");
      if (!cancelled) {
        setCode(((data as any)?.code ?? "") as string);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user]);

  const shareCode = shortCode(code);
  const link = shareCode ? `${BASE_URL}/comprar?ref=${shareCode}` : "";
  const msg = link
    ? `Olá! Conheci a Phonee — sistema completo para lojas de smartphones e assistências (estoque, vendas, financeiro e indicadores em tempo real). Te indiquei pra experimentar com vantagens. Cadastre-se pelo meu link: ${link}`
    : "";

  const logIndication = async (channel: string) => {
    if (!user || !shareCode) return;
    try {
      await (supabase.from("demo_leads") as any).insert({
        kind: "indicacao",
        name: (profile?.full_name as string) || (user.email as string) || "Indicador",
        instagram: shareCode,
        whatsapp: channel,
        referral_code: code,
        referrer: link,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
    } catch {
      // best-effort: nunca bloquear o compartilhamento
    }
  };

  const copy = async (txt: string, label: string, channel: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      toast.success(`${label} copiado!`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      logIndication(channel);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const shareWA = () => {
    if (!msg) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    logIndication("whatsapp");
  };
  const shareFB = () => {
    if (!link) return;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, "_blank");
    logIndication("facebook");
  };
  const shareIG = async () => {
    if (!msg) return;
    await copy(`${msg}`, "Mensagem", "instagram");
    window.open("https://instagram.com", "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
              <DollarSign className="h-4 w-4" />
            </span>
            Indique e Ganhe — R$ 10 por assinatura
          </DialogTitle>
          <DialogDescription>
            Compartilhe seu link rastreável. Você recebe R$ 10 de crédito a cada nova
            assinatura confirmada (liberado 7 dias após a compra do indicado).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="text-xs text-foreground/80">
              Seu código é único e rastreável — toda conversão é vinculada a você
              automaticamente.
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5" /> Seu código de indicador
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={loading ? "Gerando…" : (shareCode || "—")}
                className="font-mono tracking-widest uppercase font-bold"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!shareCode}
                onClick={() => copy(shareCode, "Código", "codigo")}
                title="Copiar código"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5" /> Link de indicação
            </Label>
            <div className="flex gap-2">
              <Input readOnly value={link || "—"} className="text-xs" />
              <Button
                type="button"
                disabled={!link}
                onClick={() => copy(link, "Link", "link")}
                className="bg-gradient-primary text-primary-foreground shadow-glow hover:brightness-110"
              >
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "Copiado" : "Copiar link"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" disabled={!link} onClick={shareWA}>
              <MessageCircle className="h-4 w-4 mr-1 text-emerald-600" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm" disabled={!link} onClick={shareIG}>
              <Instagram className="h-4 w-4 mr-1 text-pink-500" /> Instagram
            </Button>
            <Button variant="outline" size="sm" disabled={!link} onClick={shareFB}>
              <Facebook className="h-4 w-4 mr-1 text-blue-500" /> Facebook
            </Button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <Badge variant="secondary" className="text-[10px]">
              Saque liberado após 7 dias
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { onOpenChange(false); navigate("/painel/indique-e-ganhe"); }}
            >
              Painel completo <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
