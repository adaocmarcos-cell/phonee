import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getConsent, trackMetaEvent } from "@/lib/metaPixel";

/**
 * Carrega o Meta Pixel a partir de marketing_settings (admin master).
 * Dispara PageView a cada navegação SPA.
 */
export function MetaPixel() {
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if ((window as any).__phnPixelLoaded) return;
      if (getConsent() !== "granted") return;
      const { data } = await (supabase as any).rpc("get_meta_pixel_id");
      const pixelId = (typeof data === "string" ? data : "")?.trim();
      if (cancelled || !pixelId) return;
      // Loader oficial do Meta Pixel
      (function (f: any, b: Document, e: string, v: string) {
        if (f.fbq) return;
        const n: any = (f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        });
        if (!f._fbq) f._fbq = n;
        n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
        const t = b.createElement(e) as HTMLScriptElement;
        t.async = true; t.src = v;
        const s = b.getElementsByTagName(e)[0];
        s.parentNode!.insertBefore(t, s);
      })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      (window as any).fbq("init", pixelId);
      (window as any).__phnPixelLoaded = true;
      // Primeiro PageView (browser + CAPI deduplicados)
      trackMetaEvent("PageView");
    };
    init();
    const onConsent = () => init();
    window.addEventListener("phn:consent-change", onConsent);
    return () => { cancelled = true; window.removeEventListener("phn:consent-change", onConsent); };
  }, []);

  useEffect(() => {
    if (getConsent() !== "granted") return;
    if (!(window as any).__phnPixelLoaded) return;
    trackMetaEvent("PageView");
  }, [location.pathname]);

  return null;
}