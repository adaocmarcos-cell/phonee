import { useEffect, useState } from "react";
import splash from "@/assets/phonee-splash.jpg.asset.json";

const SESSION_KEY = "phonee_splash_shown";
const TOTAL_MS = 2600; // visible + fade-out (under 3s)
const FADE_MS = 350;

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

export function SplashScreen() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    return isMobileViewport();
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    const t1 = window.setTimeout(() => setLeaving(true), TOTAL_MS - FADE_MS);
    const t2 = window.setTimeout(() => setVisible(false), TOTAL_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      style={{
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
      onClick={() => {
        setLeaving(true);
        window.setTimeout(() => setVisible(false), FADE_MS);
      }}
    >
      <img
        src={splash.url}
        alt="Phonee"
        className="w-[70vw] max-w-[360px] h-auto select-none pointer-events-none"
        style={{
          animation:
            "phoneeSplashIn 900ms cubic-bezier(0.22, 1, 0.36, 1) both, phoneeSplashPulse 2.2s ease-in-out 900ms infinite",
        }}
        draggable={false}
      />
      <style>{`
        @keyframes phoneeSplashIn {
          0%   { opacity: 0; transform: scale(0.92); filter: blur(6px); }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        @keyframes phoneeSplashPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.025); }
        }
      `}</style>
    </div>
  );
}