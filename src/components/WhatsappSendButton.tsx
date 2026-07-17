import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  WHATSAPP_EVENTS, WhatsappEventKey, WhatsappVars,
  renderWhatsappTemplate, normalizeWhatsappPhone, buildWaMeUrl,
  isHighlightOsStatus, suggestedOsEvents,
} from "@/lib/whatsappTemplates";

type Props = {
  storeId: string;
  phone: string | null | undefined;
  /** Contexto — passe os IDs relevantes; um deles é obrigatório. */
  osId?: string | null;
  saleId?: string | null;
  /** Status atual da OS (para sugerir o template e destacar quando "pronto"). */
  osStatus?: string;
  budgetStatus?: string;
  /** Restringe os eventos disponíveis (default: por contexto). */
  allowedEvents?: WhatsappEventKey[];
  /** Valores a substituir nas variáveis. */
  vars: WhatsappVars;
  size?: "sm" | "default" | "lg";
  className?: string;
  /** Callback opcional depois que o wa.me abre e o log é gravado. */
  onSent?: () => void;
};

type Template = {
  id: string;
  event_key: WhatsappEventKey;
  title: string;
  body: string;
  is_active: boolean;
};

export function WhatsappSendButton({
  storeId, phone, osId, saleId, osStatus, budgetStatus,
  allowedEvents, vars, size = "sm", className, onSent,
}: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<WhatsappEventKey | "">("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const contextEvents = useMemo<WhatsappEventKey[]>(() => {
    if (allowedEvents?.length) return allowedEvents;
    if (osId) return WHATSAPP_EVENTS.filter((e) => e.context === "os").map((e) => e.key);
    return WHATSAPP_EVENTS.filter((e) => e.context === "venda").map((e) => e.key);
  }, [allowedEvents, osId]);

  const suggested = useMemo(() => {
    if (osId && osStatus) return suggestedOsEvents(osStatus, budgetStatus)[0];
    if (saleId) return "venda_concluida" as WhatsappEventKey;
    return contextEvents[0];
  }, [osId, osStatus, budgetStatus, saleId, contextEvents]);

  const normalizedPhone = normalizeWhatsappPhone(phone);
  const highlight = !!(osStatus && isHighlightOsStatus(osStatus));

  useEffect(() => {
    if (!open || !storeId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_templates")
        .select("id,event_key,title,body,is_active")
        .eq("store_id", storeId)
        .in("event_key", contextEvents);
      setLoading(false);
      if (error) return toast.error(error.message);
      const list = (data || []) as Template[];
      setTemplates(list);
      const pick = list.find((t) => t.event_key === suggested && t.is_active)
                ?? list.find((t) => t.is_active)
                ?? list[0];
      if (pick) {
        setSelected(pick.event_key);
        setText(renderWhatsappTemplate(pick.body, vars));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storeId]);

  const pickEvent = (key: WhatsappEventKey) => {
    setSelected(key);
    const t = templates.find((x) => x.event_key === key);
    if (t) setText(renderWhatsappTemplate(t.body, vars));
  };

  const submit = async () => {
    if (!normalizedPhone) return toast.error("Cliente sem WhatsApp cadastrado.");
    if (!text.trim()) return toast.error("Mensagem vazia.");
    if (!selected) return toast.error("Escolha um modelo.");
    const template = templates.find((t) => t.event_key === selected);
    setSending(true);
    const { error } = await (supabase as any)
      .from("whatsapp_messages_log")
      .insert({
        store_id: storeId,
        os_id: osId ?? null,
        sale_id: saleId ?? null,
        event_key: selected,
        template_id: template?.id ?? null,
        template_title: template?.title ?? null,
        phone: normalizedPhone,
        message_text: text,
        sent_by: user?.id ?? null,
      });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    window.open(buildWaMeUrl(normalizedPhone, text), "_blank", "noopener,noreferrer");
    toast.success("WhatsApp aberto e envio registrado no histórico.");
    setOpen(false);
    onSent?.();
  };

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={highlight ? "default" : "outline"}
        onClick={() => setOpen(true)}
        className={
          (highlight
            ? "bg-success text-success-foreground hover:bg-success/90 shadow-glow animate-pulse "
            : "") + (className ?? "")
        }
        title="Enviar mensagem no WhatsApp"
      >
        <MessageCircle className="h-4 w-4 mr-1" />
        {highlight ? "Avisar cliente — aparelho pronto" : "WhatsApp"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar WhatsApp</DialogTitle>
            <DialogDescription>
              A mensagem abre em nova aba no WhatsApp com o texto já preenchido. Você ainda precisa clicar em enviar lá.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Modelo</label>
              <Select value={selected} onValueChange={(v) => pickEvent(v as WhatsappEventKey)} disabled={loading}>
                <SelectTrigger><SelectValue placeholder={loading ? "Carregando…" : "Escolher modelo"} /></SelectTrigger>
                <SelectContent>
                  {contextEvents.map((k) => {
                    const meta = WHATSAPP_EVENTS.find((e) => e.key === k)!;
                    const t = templates.find((x) => x.event_key === k);
                    const label = t?.title || meta.label;
                    const disabled = !!t && !t.is_active;
                    return (
                      <SelectItem key={k} value={k} disabled={disabled}>
                        {label}{disabled ? " (desativado)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Mensagem</label>
              <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Enviar para <strong className="font-mono">{normalizedPhone || "—"}</strong>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={submit}
              disabled={sending || !normalizedPhone}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              {sending ? "Registrando…" : "Abrir no WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}