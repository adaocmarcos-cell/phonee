import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";
import { getConsent, setConsent } from "@/lib/metaPixel";

/**
 * Banner LGPD: enquanto o usuário não decide, nenhum evento de marketing é
 * disparado (nem browser pixel, nem CAPI). Após "Aceitar" o Meta Pixel é
 * carregado e o PageView inicial é enviado.
 */
export function CookieConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(getConsent() === null);
    const onChange = () => setShow(getConsent() === null);
    window.addEventListener("phn:consent-change", onChange);
    return () => window.removeEventListener("phn:consent-change", onChange);
  }, []);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentimento de cookies"
      className="fixed bottom-3 left-3 right-3 z-[100] mx-auto max-w-3xl rounded-2xl border bg-background/95 p-4 shadow-2xl backdrop-blur md:bottom-4 md:left-4 md:right-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <Cookie className="h-5 w-5" />
          </div>
          <div className="text-sm leading-snug">
            <p className="font-medium">Usamos cookies para melhorar sua experiência.</p>
            <p className="text-muted-foreground">
              Coletamos dados anônimos de navegação para personalizar conteúdo e medir
              campanhas (Meta Ads). Você pode aceitar ou recusar a qualquer momento.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 md:flex-row">
          <Button variant="ghost" size="sm" onClick={() => { setConsent("denied"); setShow(false); }}>
            Recusar
          </Button>
          <Button size="sm" onClick={() => { setConsent("granted"); setShow(false); }}>
            Aceitar
          </Button>
        </div>
      </div>
    </div>
  );
}