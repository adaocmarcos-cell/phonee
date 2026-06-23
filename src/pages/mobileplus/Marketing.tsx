import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Activity, Eye, Users, Save } from "lucide-react";

type Traffic = {
  total: number;
  unique_sessions: number;
  today: number;
  by_day: { day: string; visits: number }[];
  by_path: { path: string; visits: number }[];
};

export default function PhoneeMarketing() {
  const [pixelId, setPixelId] = useState("");
  const [token, setToken] = useState("");
  const [savedPixel, setSavedPixel] = useState("");
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(30);
  const [traffic, setTraffic] = useState<Traffic | null>(null);

  const loadAll = async () => {
    const { data: ms } = await (supabase as any)
      .from("marketing_settings")
      .select("meta_pixel_id, meta_access_token")
      .eq("id", 1)
      .maybeSingle();
    setPixelId(ms?.meta_pixel_id ?? "");
    setSavedPixel(ms?.meta_pixel_id ?? "");
    setToken(ms?.meta_access_token ?? "");

    const { data: tr, error } = await (supabase as any).rpc("mobileplus_sales_traffic", { _days: days });
    if (error) toast.error(error.message);
    else setTraffic(tr as Traffic);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [days]);

  const saveMarketing = async () => {
    setBusy(true);
    const { error } = await (supabase as any)
      .from("marketing_settings")
      .upsert({ id: 1, meta_pixel_id: pixelId || null, meta_access_token: token || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações de marketing salvas");
    setSavedPixel(pixelId);
  };

  const maxDay = Math.max(1, ...(traffic?.by_day.map((d) => d.visits) ?? [1]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Marketing & Tráfego</h1>
        <p className="text-sm text-slate-400">
          Monitore visitantes das páginas (incl. Vendas) e configure a integração com o Meta Ads via Pixel.
        </p>
      </header>

      {/* Traffic stats */}
      <Card className="p-5 bg-slate-900 border-slate-800 text-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Tráfego das páginas</h2>
          <div className="flex items-center gap-2 text-xs">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-full ${days === d ? "bg-[#00abfb] text-slate-900 font-semibold" : "bg-slate-800 text-slate-300"}`}>
                {d} dias
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <Stat icon={<Eye className="h-4 w-4" />} label="Visitas totais" value={traffic?.total ?? 0} />
          <Stat icon={<Users className="h-4 w-4" />} label="Sessões únicas" value={traffic?.unique_sessions ?? 0} />
          <Stat icon={<Activity className="h-4 w-4" />} label="Hoje" value={traffic?.today ?? 0} />
        </div>

        <div className="mb-5">
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Visitas por dia</div>
          <div className="flex items-end gap-1 h-32">
            {(traffic?.by_day ?? []).map((d) => (
              <div key={d.day} className="flex-1 group relative" title={`${d.day}: ${d.visits}`}>
                <div className="bg-[#00abfb] rounded-t" style={{ height: `${(d.visits / maxDay) * 100}%` }} />
              </div>
            ))}
            {(traffic?.by_day.length ?? 0) === 0 && (
              <div className="text-xs text-slate-500">Sem visitas no período.</div>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Top páginas</div>
          <div className="border border-slate-800 rounded-md divide-y divide-slate-800">
            {(traffic?.by_path ?? []).map((p) => (
              <div key={p.path} className="flex justify-between px-3 py-2 text-sm">
                <span className={`font-mono truncate ${p.path.includes("/vendas") ? "text-[#00abfb]" : ""}`}>{p.path}</span>
                <span className="tabular-nums">{p.visits}</span>
              </div>
            ))}
            {(traffic?.by_path.length ?? 0) === 0 && (
              <div className="px-3 py-3 text-xs text-slate-500">Sem dados ainda.</div>
            )}
          </div>
        </div>
      </Card>

      {/* Meta Pixel config */}
      <Card className="p-5 bg-slate-900 border-slate-800 text-slate-100">
        <h2 className="font-semibold mb-1">Integração Meta Ads (Pixel)</h2>
        <p className="text-xs text-slate-400 mb-4">
          Cole o ID do Pixel para começar a capturar eventos (PageView, ViewContent, Purchase). O pixel passa a carregar automaticamente em todas as páginas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-slate-500">ID do Pixel</Label>
            <Input value={pixelId} onChange={(e) => setPixelId(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Ex.: 1234567890123456"
              className="bg-slate-950 border-slate-800" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-slate-500">Access Token (opcional · CAPI)</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="EAAB..." type="password"
              className="bg-slate-950 border-slate-800" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {savedPixel ? <>Status: <span className="text-emerald-400">Ativo (ID {savedPixel})</span></> : "Status: desativado"}
          </div>
          <Button onClick={saveMarketing} disabled={busy} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90">
            <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-800/40 border border-slate-800 p-3">
      <div className="flex items-center gap-2 text-xs text-slate-400">{icon}{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}