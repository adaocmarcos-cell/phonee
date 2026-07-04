import { Button, type ButtonProps } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import {
  buildWhatsappUrl,
  SHOW_WHATSAPP,
  WHATSAPP_DEFAULT_MESSAGE,
} from "@/config/marketing";
import { getUtms } from "@/lib/utmTracking";

interface Props extends Omit<ButtonProps, "onClick" | "asChild"> {
  label?: string;
  message?: string;
}

export function WhatsappCTA({
  label = "Chamar no WhatsApp",
  message = WHATSAPP_DEFAULT_MESSAGE,
  className,
  ...rest
}: Props) {
  // Enquanto SHOW_WHATSAPP for false, nenhum botão de WhatsApp aparece.
  if (!SHOW_WHATSAPP) return null;
  const handleClick = () => {
    try {
      const utms = getUtms();
      const fbq = (window as any).fbq;
      if (typeof fbq === "function") fbq("track", "Contact");
      const url = buildWhatsappUrl(message, utms.utm_campaign);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      window.open(buildWhatsappUrl(message), "_blank", "noopener,noreferrer");
    }
  };
  return (
    <Button
      onClick={handleClick}
      className={
        "bg-[#25D366] text-white hover:bg-[#1fb457] " + (className ?? "")
      }
      {...rest}
    >
      <MessageCircle className="h-5 w-5" />
      {label}
    </Button>
  );
}