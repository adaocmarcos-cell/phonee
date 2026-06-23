import { Button } from "@/components/ui/button";
import { LogOut, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { exitDemoMode } from "@/lib/demoMode";

export function DemoBanner() {
  const navigate = useNavigate();

  const handleExit = async () => {
    await exitDemoMode();
    navigate("/", { replace: true });
  };

  return (
    <div className="bg-gradient-to-r from-primary/95 via-primary to-info text-white border-b border-primary-foreground/20 px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2 sm:gap-3">
      <span className="text-xs sm:text-sm font-semibold">
        Modo demonstração — dados fictícios. Você está explorando o Phonee.
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-3 text-xs bg-white text-primary hover:bg-white/90"
          onClick={() => {
            const host = typeof window !== "undefined" ? window.location.hostname : "";
            const base = host.endsWith("phonee.com.br") ? window.location.origin : "https://www.phonee.com.br";
            window.open(`${base}/comprar?plano=annual`, "_blank");
          }}
        >
          <ShoppingCart className="h-3.5 w-3.5 mr-1" />
          Comprar agora
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-3 text-xs text-white hover:bg-white/15"
          onClick={handleExit}
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />
          Sair da demo
        </Button>
      </div>
    </div>
  );
}