import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeftRight, Package, ShoppingCart, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Event = {
  event_at: string;
  event_type: "trade_in" | "produto" | "venda" | "os";
  ref_id: string;
  label: string;
  details: any;
};

const ICON: Record<Event["event_type"], JSX.Element> = {
  trade_in: <ArrowLeftRight className="h-4 w-4" />,
  produto: <Package className="h-4 w-4" />,
  venda: <ShoppingCart className="h-4 w-4" />,
  os: <Wrench className="h-4 w-4" />,
};

const LABEL: Record<Event["event_type"], string> = {
  trade_in: "Compra e Troca",
  produto: "Estoque",
  venda: "Venda",
  os: "Ordem de Serviço",
};

export default function RastreioImei() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [imei, setImei] = useState("");
  const [events, setEvents] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!store) return;
    const value = imei.replace(/\D/g, "");
    if (value.length !== 15) return toast.error("IMEI deve ter 15 dígitos");
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("track_device_by_imei", {
      _store_id: store.id,
      _imei: value,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setEvents((data ?? []) as Event[]);
  };

  const goTo = (e: Event) => {
    if (e.event_type === "trade_in") navigate(`/painel/troca/${e.ref_id}/detalhes`);
    else if (e.event_type === "produto") navigate(`/painel/estoque/${e.ref_id}`);
    else if (e.event_type === "venda") navigate(`/painel/vendas/${e.ref_id}/editar`);
    else if (e.event_type === "os") navigate(`/painel/ordens/${e.ref_id}`);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <PageHeader
        title="Rastreio por IMEI"
        description="Veja a linha do tempo completa de um aparelho: entrada, estoque, venda e OS."
      />
      <Card className="p-4 flex gap-2">
        <Input
          value={imei}
          onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
          placeholder="Digite o IMEI (15 dígitos)"
          inputMode="numeric"
          maxLength={15}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <Button onClick={search} disabled={loading}>
          <Search className="h-4 w-4 mr-1" /> Buscar
        </Button>
      </Card>

      {events !== null && (
        <Card className="p-4">
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              Nenhum evento encontrado para este IMEI.
            </div>
          ) : (
            <ol className="relative border-l-2 border-border ml-1 space-y-4 pl-4">
              {events.map((e, i) => (
                <li key={`${e.event_type}-${e.ref_id}-${i}`} className="relative">
                  <span className="absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                    {ICON[e.event_type]}
                  </span>
                  <button
                    onClick={() => goTo(e)}
                    className="text-left w-full hover:bg-muted/40 rounded-md p-2 -m-2 transition"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{LABEL[e.event_type]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.event_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="text-sm font-medium mt-1">{e.label}</div>
                    {e.details && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {Object.entries(e.details)
                          .filter(([, v]) => v !== null && v !== undefined && v !== "")
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}