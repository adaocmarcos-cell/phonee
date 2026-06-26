import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Activity, Eye, Users, Save, Filter, RotateCcw, Zap, Send, FlaskConical, ShieldCheck, Trash2 } from "lucide-react";
import { trackMetaEvent, getTestEventCode, setTestEventCode } from "@/lib/metaPixel";

type Traffic = {
  total: number;
  unique_sessions: number;
  today: number;
  by_day: { day: string; visits: number }[];
  by_path: { path: string; visits: number; unique_sessions: number }[];
};

type StoreOpt = { id: string; name: string };

type PixelOverview = {
  dias: number;
  total: number;
  browser: number;
  server: number;
  leads: number;
  purchases: number;
  revenue: number;
  by_day: { day: string; total: number; browser: number; server: number }[];
  by_event: { event_name: string; count: number }[];
  by_path: { path: string; count: number }[];
  recent: {
    id: string; event_name: string; source: "browser" | "server";
    event_source_url: string | null; value: number | null; currency: string | null;
    capi_status: number | null; test_event_code: string | null; created_at: string;
  }[];
};

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PhoneeMarketing() {
  const [pixelId, setPixelId] = useState("");
  const [token, setToken] = useState("");
  const [savedPixel, setSavedPixel] = useState("");
  const [busy, setBusy] = useState(false);
  const [traffic, setTraffic] = useState<Traffic | null>(null);

  // filtros
  const [from, setFrom] = useState(toInputDate(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(toInputDate(new Date()));
  const [storeId, setStoreId] = useState<string>("all");
  const [pathFilter, setPathFilter] = useState<string>("");
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [paths, setPaths] = useState<{ path: string; visits: number }[]>([]);
  const [loading, setLoading] = useState(false);

  // Pixel events panel
  const [pxDays, setPxDays] = useState(30);
  const [pxData, setPxData] = useState<PixelOverview | null>(null);
  const [pxLoading, setPxLoading] = useState(false);
  const [debugCode, setDebugCode] = useState<string>(getTestEventCode() ?? "");
  const [debugBusy, setDebugBusy] = useState(false);

  const loadFilters = async () => {
    const [{ data: st }, { data: pa }] = await Promise.all([
      (supabase as any).from("stores").select("id, name").order("name"),
      (supabase as any).rpc("phonee_traffic_paths"),
    ]);
    setStores(((st as any) ?? []).map((s: any) => ({ id: s.id, name: s.name })));
    setPaths(((pa as any) ?? []) as any);
  };

  const loadSettings = async () => {
    const { data: ms } = await (supabase as any)
      .from("marketing_settings")
      .select("meta_pixel_id, meta_access_token")
      .eq("id", 1)
      .maybeSingle();
    setPixelId(ms?.meta_pixel_id ?? "");
    setSavedPixel(ms?.meta_pixel_id ?? "");
    setToken(ms?.meta_access_token ?? "");
  };

  const loadTraffic = async () => {
    setLoading(true);
    const { data: tr, error } = await (supabase as any).rpc("phonee_sales_traffic", {
      _days: 30,
      _from: new Date(from + "T00:00:00").toISOString(),
      _to: new Date(to + "T23:59:59").toISOString(),
      _store_id: storeId === "all" ? null : storeId,
      _path: pathFilter || null,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else setTraffic(tr as Traffic);
  };

  useEffect(() => { loadSettings(); loadFilters(); }, []);
  useEffect(() => { loadTraffic(); /* eslint-disable-next-line */ }, [from, to, storeId, pathFilter]);

  const loadPixelOverview = async () => {
    setPxLoading(true);
    const { data, error } = await (supabase as any).rpc("phonee_pixel_events_overview", { _days: pxDays });
    setPxLoading(false);
    if (error) return toast.error(error.message);
    setPxData(data as PixelOverview);
  };
  useEffect(() => { loadPixelOverview(); /* eslint-disable-next-line */ }, [pxDays]);

  const saveDebugCode = (code: string) => {
    setDebugCode(code);
    setTestEventCode(code.trim() ? code.trim() : null);
    toast.success(code.trim() ? "Test Event Code ativado" : "Modo debug desativado");
  };

  const sendTestEvent = async (event_name: string) => {
    setDebugBusy(true);
    const id = await trackMetaEvent(event_name, {
      value: event_name === "Purchase" ? 99.9 : undefined,
      currency: "BRL",
      custom: { source: "admin_debug_panel" },
      force: true,
    });
    setDebugBusy(false);
    if (id) {
      toast.success(`Evento ${event_name} enviado (${id.slice(0, 8)}…)`);
      setTimeout(loadPixelOverview, 800);
    } else toast.error("Falha ao enviar evento");
  };

  const resetFilters = () => {
    setFrom(toInputDate(new Date(Date.now() - 30 * 86400000)));
    setTo(toInputDate(new Date()));
    setStoreId("all");
    setPathFilter("");
  };

  const setQuickRange = (days: number) => {
    setFrom(toInputDate(new Date(Date.now() - days * 86400000)));
    setTo(toInputDate(new Date()));
  };

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
  const pxMaxDay = Math.max(1, ...(pxData?.by_day.map((d) => d.total) ?? [1]));

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
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Tráfego das páginas</h2>
          <div className="flex items-center gap-2 text-xs">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setQuickRange(d)}
                className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700">
                {d} dias
              </button>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Filter className="h-3.5 w-3.5" /> Filtros
            </span>
            <button onClick={resetFilters} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Limpar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-slate-500">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="bg-slate-900 border-slate-800 h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-slate-500">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="bg-slate-900 border-slate-800 h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-slate-500">Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="bg-slate-900 border-slate-800 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-slate-500">Caminho (path)</Label>
              <Input list="path-options" value={pathFilter}
                onChange={(e) => setPathFilter(e.target.value)}
                placeholder="Ex.: /painel/vendas"
                className="bg-slate-900 border-slate-800 h-9 font-mono text-xs" />
              <datalist id="path-options">
                {paths.map((p) => <option key={p.path} value={p.path}>{p.visits} visitas</option>)}
              </datalist>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <Stat icon={<Eye className="h-4 w-4" />} label="Visitas (filtro)" value={traffic?.total ?? 0} loading={loading} />
          <Stat icon={<Users className="h-4 w-4" />} label="Sessões únicas" value={traffic?.unique_sessions ?? 0} loading={loading} />
          <Stat icon={<Activity className="h-4 w-4" />} label="Hoje" value={traffic?.today ?? 0} loading={loading} />
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
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2 flex justify-between">
            <span>Top páginas</span>
            <span>visitas · sessões únicas</span>
          </div>
          <div className="border border-slate-800 rounded-md divide-y divide-slate-800">
            {(traffic?.by_path ?? []).map((p) => (
              <button key={p.path} onClick={() => setPathFilter(p.path)}
                className="w-full flex justify-between px-3 py-2 text-sm hover:bg-slate-800/60 text-left">
                <span className={`font-mono truncate ${p.path.includes("/vendas") ? "text-[#00abfb]" : ""}`}>{p.path}</span>
                <span className="tabular-nums text-slate-300">
                  {p.visits} · <span className="text-slate-500">{p.unique_sessions ?? "—"}</span>
                </span>
              </button>
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
          Cole o ID do Pixel + Access Token para ativar o Pixel (browser) e o Conversions API (server). O CAPI mantém o tracking funcionando mesmo quando o usuário tem adblock.
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
            {token ? <span className="ml-2 inline-flex items-center gap-1 text-emerald-400"><ShieldCheck className="h-3 w-3" /> CAPI</span> : null}
          </div>
          <Button onClick={saveMarketing} disabled={busy} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90">
            <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Card>

      {/* Pixel events overview */}
      <Card className="p-5 bg-slate-900 border-slate-800 text-slate-100">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold flex items-center gap-2"><Zap className="h-4 w-4" /> Eventos do Pixel & CAPI</h2>
          <div className="flex items-center gap-2 text-xs">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setPxDays(d)}
                className={`px-3 py-1 rounded-full ${pxDays === d ? "bg-[#00abfb] text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                {d} dias
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          <Stat icon={<Activity className="h-4 w-4" />} label="Total eventos" value={pxData?.total ?? 0} loading={pxLoading} />
          <Stat icon={<Eye className="h-4 w-4" />} label="Browser" value={pxData?.browser ?? 0} loading={pxLoading} />
          <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Server (CAPI)" value={pxData?.server ?? 0} loading={pxLoading} />
          <Stat icon={<Users className="h-4 w-4" />} label="Leads" value={pxData?.leads ?? 0} loading={pxLoading} />
          <Stat icon={<Zap className="h-4 w-4" />} label="Purchases" value={pxData?.purchases ?? 0} loading={pxLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Eventos por dia</div>
            <div className="flex items-end gap-1 h-32">
              {(pxData?.by_day ?? []).map((d) => (
                <div key={d.day} className="flex-1 flex flex-col-reverse" title={`${d.day}: ${d.total} (browser ${d.browser} · server ${d.server})`}>
                  <div className="bg-[#00abfb]" style={{ height: `${(d.browser / pxMaxDay) * 100}%` }} />
                  <div className="bg-emerald-500" style={{ height: `${(d.server / pxMaxDay) * 100}%` }} />
                </div>
              ))}
              {(pxData?.by_day.length ?? 0) === 0 && <div className="text-xs text-slate-500">Sem eventos ainda.</div>}
            </div>
            <div className="mt-2 text-[10px] text-slate-500 flex gap-3">
              <span className="flex items-center gap-1"><span className="h-2 w-2 bg-[#00abfb]" /> Browser</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 bg-emerald-500" /> Server (CAPI)</span>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Top eventos</div>
            <div className="border border-slate-800 rounded-md divide-y divide-slate-800">
              {(pxData?.by_event ?? []).map((e) => (
                <div key={e.event_name} className="flex justify-between px-3 py-2 text-sm">
                  <span className="font-mono">{e.event_name}</span>
                  <span className="tabular-nums text-slate-300">{e.count}</span>
                </div>
              ))}
              {(pxData?.by_event.length ?? 0) === 0 && <div className="px-3 py-3 text-xs text-slate-500">Sem dados.</div>}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Últimos eventos</div>
          <div className="border border-slate-800 rounded-md divide-y divide-slate-800 max-h-80 overflow-auto">
            {(pxData?.recent ?? []).map((r) => (
              <div key={r.id} className="grid grid-cols-12 px-3 py-2 text-xs items-center">
                <span className="col-span-3 font-mono">{r.event_name}</span>
                <span className={`col-span-2 ${r.source === "server" ? "text-emerald-400" : "text-[#00abfb]"}`}>
                  {r.source}{r.capi_status ? ` · ${r.capi_status}` : ""}
                </span>
                <span className="col-span-5 font-mono truncate text-slate-400">{r.event_source_url ?? "—"}</span>
                <span className="col-span-2 text-right text-slate-500">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
              </div>
            ))}
            {(pxData?.recent.length ?? 0) === 0 && <div className="px-3 py-3 text-xs text-slate-500">Nenhum evento registrado ainda.</div>}
          </div>
        </div>
      </Card>

      {/* Debug / test events */}
      <Card className="p-5 bg-slate-900 border-slate-800 text-slate-100">
        <h2 className="font-semibold flex items-center gap-2 mb-1"><FlaskConical className="h-4 w-4" /> Modo debug · Test Events</h2>
        <p className="text-xs text-slate-400 mb-4">
          Cole o <span className="font-mono">Test Event Code</span> do Events Manager para que os disparos abaixo apareçam apenas na aba de teste do Meta — sem afetar otimização das campanhas em produção.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-slate-500">Test Event Code</Label>
            <Input value={debugCode} onChange={(e) => setDebugCode(e.target.value)}
              placeholder="TEST12345"
              className="bg-slate-950 border-slate-800 font-mono" />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => saveDebugCode(debugCode)} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90">
              <Save className="h-4 w-4 mr-1" /> Aplicar
            </Button>
            <Button variant="ghost" onClick={() => saveDebugCode("")}>
              <Trash2 className="h-4 w-4 mr-1" /> Desativar
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {["PageView", "ViewContent", "Lead", "InitiateCheckout", "Purchase"].map((ev) => (
            <Button key={ev} variant="outline" disabled={debugBusy}
              onClick={() => sendTestEvent(ev)}
              className="border-slate-700 text-slate-200 hover:bg-slate-800">
              <Send className="h-3.5 w-3.5 mr-1" /> Disparar {ev}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Os disparos do painel ignoram o consentimento de cookies (force=true) e marcam <span className="font-mono">source=admin_debug_panel</span> nos eventos para identificação.
        </p>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number; loading?: boolean }) {
  return (
    <div className="rounded-md bg-slate-800/40 border border-slate-800 p-3">
      <div className="flex items-center gap-2 text-xs text-slate-400">{icon}{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">
        {loading ? "…" : value.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}