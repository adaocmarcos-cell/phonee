import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Activity, Eye, Users, Save, Filter, RotateCcw, Zap, Send, FlaskConical, ShieldCheck, Trash2,
  DollarSign, MousePointerClick, TrendingUp, Target, Megaphone, Wallet, Plus, Pencil, MessageCircle, Globe, BarChart3
} from "lucide-react";
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
  by_utm_source: { utm_source: string; total: number; leads: number; purchases: number; revenue: number }[];
  by_utm_medium: { utm_medium: string; total: number; leads: number; purchases: number; revenue: number }[];
  by_utm_campaign: { utm_campaign: string; total: number; leads: number; purchases: number; revenue: number }[];
  attribution: { utm_source: string; utm_medium: string; utm_campaign: string; total: number; leads: number; purchases: number; revenue: number }[];
  recent: {
    id: string; event_name: string; source: "browser" | "server";
    event_source_url: string | null; value: number | null; currency: string | null;
    capi_status: number | null; test_event_code: string | null; created_at: string;
    utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null;
    utm_term?: string | null; utm_content?: string | null; referrer?: string | null;
  }[];
};

type DashboardData = {
  investment: number; impressions: number; reach: number; clicks: number;
  cpc: number; cpm: number; ctr: number;
  leads: number; cpl: number;
  sales: number; cps: number;
  revenue: number; roas: number;
  by_day: { day: string; investment: number; leads: number; purchases: number; revenue: number; clicks: number }[];
  by_campaign: { campaign: string; investment: number; clicks: number; impressions: number; leads: number; sales: number; revenue: number; cpl: number; roas: number }[];
  funnel: { visits: number; view_content: number; leads: number; initiate_checkout: number; purchases: number };
};

type Investment = {
  id: string; reference_date: string; channel: string; campaign: string | null; adset: string | null; ad: string | null;
  utm_campaign: string | null; utm_source: string | null; utm_medium: string | null;
  amount_cents: number; impressions: number; reach: number; clicks: number; notes: string | null;
};

type LeadRow = {
  id: string; name: string; whatsapp: string; instagram: string;
  company: string | null; city: string | null; state: string | null;
  kind: string; status: string; notes: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  fbclid: string | null; referrer: string | null; contacted: boolean;
  created_at: string;
};

const LEAD_STATUSES = [
  { value: "novo", label: "Novo", color: "bg-sky-500/20 text-sky-300" },
  { value: "contatado", label: "Contatado", color: "bg-amber-500/20 text-amber-300" },
  { value: "qualificado", label: "Qualificado", color: "bg-violet-500/20 text-violet-300" },
  { value: "convertido", label: "Convertido", color: "bg-emerald-500/20 text-emerald-300" },
  { value: "perdido", label: "Perdido", color: "bg-rose-500/20 text-rose-300" },
];

const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => Number(n || 0).toLocaleString("pt-BR");
const pct = (n: number) => `${Number(n || 0).toFixed(2)}%`;

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

  // Dashboard / Investimentos / Leads
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [invDialog, setInvDialog] = useState(false);
  const [editingInv, setEditingInv] = useState<Partial<Investment> | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>("all");
  const [leadKindFilter, setLeadKindFilter] = useState<string>("all");
  const [leadSearch, setLeadSearch] = useState("");

  const loadDashboard = async () => {
    setDashLoading(true);
    const { data, error } = await (supabase as any).rpc("phonee_marketing_dashboard", {
      _from: new Date(from + "T00:00:00").toISOString(),
      _to: new Date(to + "T23:59:59").toISOString(),
    });
    setDashLoading(false);
    if (error) return toast.error(error.message);
    setDash(data as DashboardData);
  };

  const loadInvestments = async () => {
    const { data, error } = await (supabase as any)
      .from("marketing_investments")
      .select("*")
      .gte("reference_date", from)
      .lte("reference_date", to)
      .order("reference_date", { ascending: false });
    if (error) return toast.error(error.message);
    setInvestments((data as Investment[]) ?? []);
  };

  const saveInvestment = async () => {
    if (!editingInv) return;
    const payload: any = {
      reference_date: editingInv.reference_date || toInputDate(new Date()),
      channel: editingInv.channel || "meta_ads",
      campaign: editingInv.campaign || null,
      adset: editingInv.adset || null,
      ad: editingInv.ad || null,
      utm_source: editingInv.utm_source || null,
      utm_medium: editingInv.utm_medium || null,
      utm_campaign: editingInv.utm_campaign || null,
      amount_cents: Math.round(Number((editingInv as any).amount_brl || 0) * 100),
      impressions: Number(editingInv.impressions || 0),
      reach: Number(editingInv.reach || 0),
      clicks: Number(editingInv.clicks || 0),
      notes: editingInv.notes || null,
    };
    const q = editingInv.id
      ? (supabase as any).from("marketing_investments").update(payload).eq("id", editingInv.id)
      : (supabase as any).from("marketing_investments").insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success("Investimento salvo");
    setInvDialog(false); setEditingInv(null);
    loadInvestments(); loadDashboard();
  };

  const deleteInvestment = async (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await (supabase as any).from("marketing_investments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lançamento removido");
    loadInvestments(); loadDashboard();
  };

  const loadLeads = async () => {
    setLeadsLoading(true);
    let q = (supabase as any).from("demo_leads").select("*").order("created_at", { ascending: false }).limit(500);
    if (leadKindFilter !== "all") q = q.eq("kind", leadKindFilter);
    if (leadStatusFilter !== "all") q = q.eq("status", leadStatusFilter);
    const { data, error } = await q;
    setLeadsLoading(false);
    if (error) return toast.error(error.message);
    setLeads((data as LeadRow[]) ?? []);
  };

  const updateLeadStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "contatado") { patch.contacted = true; patch.contacted_at = new Date().toISOString(); }
    const { error } = await (supabase as any).from("demo_leads").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

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
  useEffect(() => { loadTraffic(); loadDashboard(); loadInvestments(); /* eslint-disable-next-line */ }, [from, to, storeId, pathFilter]);
  useEffect(() => { loadLeads(); /* eslint-disable-next-line */ }, [leadKindFilter, leadStatusFilter]);

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
  const dashMaxDay = Math.max(1, ...((dash?.by_day ?? []).flatMap((d) => [d.investment, d.revenue])), 1);

  const filteredLeads = leads.filter((l) => {
    if (!leadSearch) return true;
    const q = leadSearch.toLowerCase();
    return [l.name, l.whatsapp, l.company, l.city, l.utm_campaign, l.utm_source]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Marketing & Tráfego</h1>
        <p className="text-sm text-slate-400">
          Painel central de campanhas, visitantes, leads e conversões — investimento, ROAS, funil e atribuição em um único lugar.
        </p>
      </header>

      {/* Filtros globais */}
      <Card className="p-4 bg-slate-900 border-slate-800 text-slate-100">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-950 border-slate-800 h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-950 border-slate-800 h-9 w-[150px]" />
          </div>
          <div className="flex gap-1">
            {[7, 30, 60, 90].map((d) => (
              <button key={d} onClick={() => setQuickRange(d)}
                className="px-3 py-1.5 text-xs rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700">{d}d</button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-slate-400">
            <RotateCcw className="h-3 w-3 mr-1" /> Limpar
          </Button>
        </div>
      </Card>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="bg-slate-900 border border-slate-800 flex-wrap h-auto">
          <TabsTrigger value="dashboard"><BarChart3 className="h-3.5 w-3.5 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="funil"><Target className="h-3.5 w-3.5 mr-1" /> Funil</TabsTrigger>
          <TabsTrigger value="leads"><Users className="h-3.5 w-3.5 mr-1" /> Leads</TabsTrigger>
          <TabsTrigger value="campanhas"><Megaphone className="h-3.5 w-3.5 mr-1" /> Campanhas</TabsTrigger>
          <TabsTrigger value="investimentos"><Wallet className="h-3.5 w-3.5 mr-1" /> Investimentos</TabsTrigger>
          <TabsTrigger value="trafego"><Globe className="h-3.5 w-3.5 mr-1" /> Tráfego</TabsTrigger>
          <TabsTrigger value="integracao"><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Pixel & CAPI</TabsTrigger>
        </TabsList>

        {/* === DASHBOARD === */}
        <TabsContent value="dashboard" className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI icon={<DollarSign className="h-4 w-4" />} label="Investimento" value={brl(dash?.investment ?? 0)} loading={dashLoading} />
            <KPI icon={<Eye className="h-4 w-4" />} label="Impressões" value={num(dash?.impressions ?? 0)} loading={dashLoading} />
            <KPI icon={<Users className="h-4 w-4" />} label="Alcance" value={num(dash?.reach ?? 0)} loading={dashLoading} />
            <KPI icon={<MousePointerClick className="h-4 w-4" />} label="Cliques" value={num(dash?.clicks ?? 0)} loading={dashLoading} />
            <KPI icon={<Activity className="h-4 w-4" />} label="CTR" value={pct(dash?.ctr ?? 0)} loading={dashLoading} />
            <KPI icon={<DollarSign className="h-4 w-4" />} label="CPC" value={brl(dash?.cpc ?? 0)} loading={dashLoading} />
            <KPI icon={<DollarSign className="h-4 w-4" />} label="CPM" value={brl(dash?.cpm ?? 0)} loading={dashLoading} />
            <KPI icon={<Target className="h-4 w-4" />} label="Leads" value={num(dash?.leads ?? 0)} loading={dashLoading} />
            <KPI icon={<DollarSign className="h-4 w-4" />} label="Custo / Lead" value={brl(dash?.cpl ?? 0)} loading={dashLoading} />
            <KPI icon={<Zap className="h-4 w-4" />} label="Vendas" value={num(dash?.sales ?? 0)} loading={dashLoading} />
            <KPI icon={<DollarSign className="h-4 w-4" />} label="Custo / Venda" value={brl(dash?.cps ?? 0)} loading={dashLoading} />
            <KPI icon={<TrendingUp className="h-4 w-4" />} label="Receita / ROAS" value={`${brl(dash?.revenue ?? 0)} · ${(dash?.roas ?? 0).toFixed(2)}x`} loading={dashLoading} />
          </div>

          <Card className="p-5 bg-slate-900 border-slate-800 text-slate-100">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">Investimento × Receita por dia</div>
            <div className="flex items-end gap-1 h-40">
              {(dash?.by_day ?? []).map((d) => (
                <div key={d.day} className="flex-1 flex gap-[2px] items-end" title={`${d.day} · invest ${brl(d.investment)} · receita ${brl(d.revenue)} · leads ${d.leads} · vendas ${d.purchases}`}>
                  <div className="flex-1 bg-sky-500 rounded-t" style={{ height: `${(d.investment / dashMaxDay) * 100}%` }} />
                  <div className="flex-1 bg-emerald-500 rounded-t" style={{ height: `${(d.revenue / dashMaxDay) * 100}%` }} />
                </div>
              ))}
              {(dash?.by_day.length ?? 0) === 0 && <div className="text-xs text-slate-500">Sem dados no período.</div>}
            </div>
            <div className="mt-2 text-[10px] text-slate-500 flex gap-3">
              <span className="flex items-center gap-1"><span className="h-2 w-2 bg-sky-500" /> Investimento</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 bg-emerald-500" /> Receita</span>
            </div>
          </Card>

          <Card className="p-5 bg-slate-900 border-slate-800 text-slate-100">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Campanhas com melhor desempenho</div>
            <div className="border border-slate-800 rounded-md overflow-hidden">
              <div className="grid grid-cols-12 px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 bg-slate-950/40">
                <span className="col-span-4">Campanha</span>
                <span className="col-span-2 text-right">Investido</span>
                <span className="col-span-1 text-right">Cliq.</span>
                <span className="col-span-1 text-right">Leads</span>
                <span className="col-span-1 text-right">Vendas</span>
                <span className="col-span-2 text-right">Receita</span>
                <span className="col-span-1 text-right">ROAS</span>
              </div>
              <div className="divide-y divide-slate-800 max-h-96 overflow-auto">
                {(dash?.by_campaign ?? []).map((c, i) => (
                  <div key={i} className="grid grid-cols-12 px-3 py-2 text-xs items-center">
                    <span className="col-span-4 font-mono truncate" title={c.campaign}>{c.campaign}</span>
                    <span className="col-span-2 text-right tabular-nums">{brl(c.investment)}</span>
                    <span className="col-span-1 text-right tabular-nums text-slate-300">{num(c.clicks)}</span>
                    <span className="col-span-1 text-right tabular-nums text-amber-300">{num(c.leads)}</span>
                    <span className="col-span-1 text-right tabular-nums text-emerald-400">{num(c.sales)}</span>
                    <span className="col-span-2 text-right tabular-nums text-emerald-400">{brl(c.revenue)}</span>
                    <span className={`col-span-1 text-right tabular-nums ${c.roas >= 1 ? "text-emerald-400" : "text-rose-400"}`}>{c.roas.toFixed(2)}x</span>
                  </div>
                ))}
                {(dash?.by_campaign.length ?? 0) === 0 && <div className="px-3 py-3 text-xs text-slate-500">Sem dados de campanhas.</div>}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* === FUNIL === */}
        <TabsContent value="funil" className="space-y-4">
          <Card className="p-5 bg-slate-900 border-slate-800 text-slate-100">
            <h2 className="font-semibold flex items-center gap-2 mb-4"><Target className="h-4 w-4" /> Funil de Conversão</h2>
            {(() => {
              const f = dash?.funnel ?? { visits: 0, view_content: 0, leads: 0, initiate_checkout: 0, purchases: 0 };
              const steps = [
                { label: "Visitou a página", value: f.visits, color: "bg-sky-500" },
                { label: "Visualizou conteúdo (ViewContent)", value: f.view_content, color: "bg-cyan-500" },
                { label: "Lead / Cadastro", value: f.leads, color: "bg-amber-500" },
                { label: "Iniciou checkout", value: f.initiate_checkout, color: "bg-orange-500" },
                { label: "Finalizou pagamento", value: f.purchases, color: "bg-emerald-500" },
              ];
              const max = Math.max(1, ...steps.map((s) => s.value));
              return (
                <div className="space-y-3">
                  {steps.map((s, i) => {
                    const prev = i > 0 ? steps[i - 1].value : null;
                    const conv = prev && prev > 0 ? (s.value / prev) * 100 : null;
                    return (
                      <div key={s.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300">{s.label}</span>
                          <span className="tabular-nums text-slate-400">
                            {num(s.value)}{conv !== null ? ` · ${conv.toFixed(1)}%` : ""}
                          </span>
                        </div>
                        <div className="h-7 bg-slate-800 rounded overflow-hidden">
                          <div className={`h-full ${s.color}`} style={{ width: `${(s.value / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                    Taxa global Visitas → Pagamentos: {f.visits > 0 ? ((f.purchases / f.visits) * 100).toFixed(2) : "0"}%
                  </div>
                </div>
              );
            })()}
          </Card>
        </TabsContent>

        {/* === LEADS === */}
        <TabsContent value="leads" className="space-y-4">
          <Card className="p-4 bg-slate-900 border-slate-800 text-slate-100">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 flex-1 min-w-[220px]">
                <Label className="text-[10px] uppercase tracking-widest text-slate-500">Buscar</Label>
                <Input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Nome, WhatsApp, cidade, campanha…" className="bg-slate-950 border-slate-800 h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-slate-500">Tipo</Label>
                <Select value={leadKindFilter} onValueChange={setLeadKindFilter}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 h-9 w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="demo">Demonstração</SelectItem>
                    <SelectItem value="indicacao">Indicação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-widest text-slate-500">Status</Label>
                <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 h-9 w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {LEAD_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-0 bg-slate-900 border-slate-800 text-slate-100 overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 bg-slate-950/40 border-b border-slate-800">
              <span className="col-span-3">Lead</span>
              <span className="col-span-2">Localização</span>
              <span className="col-span-3">Origem / Campanha</span>
              <span className="col-span-2">Status</span>
              <span className="col-span-2 text-right">Ações</span>
            </div>
            <div className="divide-y divide-slate-800 max-h-[600px] overflow-auto">
              {leadsLoading && <div className="px-4 py-3 text-xs text-slate-500">Carregando…</div>}
              {!leadsLoading && filteredLeads.length === 0 && <div className="px-4 py-3 text-xs text-slate-500">Nenhum lead encontrado.</div>}
              {filteredLeads.map((l) => {
                const status = LEAD_STATUSES.find((s) => s.value === l.status) ?? LEAD_STATUSES[0];
                const wa = (l.whatsapp || "").replace(/\D/g, "");
                return (
                  <div key={l.id} className="grid grid-cols-12 px-4 py-3 items-center text-sm hover:bg-slate-950/40">
                    <div className="col-span-3">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-[11px] text-slate-400">{l.whatsapp} {l.company ? `· ${l.company}` : ""}</div>
                      <div className="text-[10px] text-slate-500">{new Date(l.created_at).toLocaleString("pt-BR")}</div>
                    </div>
                    <div className="col-span-2 text-xs text-slate-300">
                      {l.city || "—"}{l.state ? `/${l.state}` : ""}
                    </div>
                    <div className="col-span-3 text-[11px] font-mono text-slate-400 truncate">
                      <Badge variant="outline" className="mr-1 capitalize">{l.kind}</Badge>
                      {l.utm_source || "(direto)"} · {l.utm_campaign || "—"}
                      {l.fbclid ? <span className="text-sky-400"> · fbclid</span> : null}
                    </div>
                    <div className="col-span-2">
                      <Select value={l.status} onValueChange={(v) => updateLeadStatus(l.id, v)}>
                        <SelectTrigger className={`h-7 text-xs border-0 ${status.color}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 flex justify-end gap-1">
                      {wa && (
                        <a href={`https://wa.me/55${wa}`} target="_blank" rel="noreferrer"
                          className="px-2 py-1 text-xs rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" /> WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        {/* === CAMPANHAS === */}
        <TabsContent value="campanhas" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { title: "Por utm_source", rows: pxData?.by_utm_source ?? [], key: "utm_source" as const },
              { title: "Por utm_medium", rows: pxData?.by_utm_medium ?? [], key: "utm_medium" as const },
              { title: "Por utm_campaign", rows: pxData?.by_utm_campaign ?? [], key: "utm_campaign" as const },
            ].map((b) => (
              <Card key={b.title} className="p-4 bg-slate-900 border-slate-800 text-slate-100">
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">{b.title}</div>
                <div className="border border-slate-800 rounded-md divide-y divide-slate-800 max-h-72 overflow-auto">
                  {b.rows.map((r: any, i: number) => (
                    <div key={i} className="grid grid-cols-12 px-3 py-2 text-xs items-center">
                      <span className="col-span-5 font-mono truncate" title={r[b.key]}>{r[b.key]}</span>
                      <span className="col-span-2 text-right tabular-nums text-slate-300">{r.total}</span>
                      <span className="col-span-2 text-right tabular-nums text-amber-300">{r.leads}</span>
                      <span className="col-span-3 text-right tabular-nums text-emerald-400">
                        {r.purchases}{r.revenue > 0 ? ` · ${brl(r.revenue)}` : ""}
                      </span>
                    </div>
                  ))}
                  {b.rows.length === 0 && <div className="px-3 py-3 text-xs text-slate-500">Sem dados UTM.</div>}
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-4 bg-slate-900 border-slate-800 text-slate-100">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Atribuição completa (source · medium · campaign)</div>
            <div className="border border-slate-800 rounded-md divide-y divide-slate-800 max-h-96 overflow-auto">
              <div className="grid grid-cols-12 px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 bg-slate-950/40">
                <span className="col-span-6">Fonte / Mídia / Campanha</span>
                <span className="col-span-2 text-right">Eventos</span>
                <span className="col-span-2 text-right">Leads</span>
                <span className="col-span-2 text-right">Compras · Receita</span>
              </div>
              {(pxData?.attribution ?? []).map((r, i) => (
                <div key={i} className="grid grid-cols-12 px-3 py-2 text-xs items-center">
                  <span className="col-span-6 font-mono truncate">
                    <span className="text-slate-300">{r.utm_source}</span>
                    <span className="text-slate-600"> · </span>
                    <span className="text-slate-400">{r.utm_medium}</span>
                    <span className="text-slate-600"> · </span>
                    <span className="text-slate-400">{r.utm_campaign}</span>
                  </span>
                  <span className="col-span-2 text-right tabular-nums text-slate-300">{r.total}</span>
                  <span className="col-span-2 text-right tabular-nums text-amber-300">{r.leads}</span>
                  <span className="col-span-2 text-right tabular-nums text-emerald-400">
                    {r.purchases}{r.revenue > 0 ? ` · ${brl(r.revenue)}` : ""}
                  </span>
                </div>
              ))}
              {(pxData?.attribution.length ?? 0) === 0 && <div className="px-3 py-3 text-xs text-slate-500">Sem dados de atribuição ainda.</div>}
            </div>
          </Card>
        </TabsContent>

        {/* === INVESTIMENTOS === */}
        <TabsContent value="investimentos" className="space-y-4">
          <Card className="p-5 bg-slate-900 border-slate-800 text-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4" /> Lançamentos de investimento</h2>
                <p className="text-xs text-slate-400 mt-1">Registre investimento, impressões, alcance e cliques por campanha — alimenta CPC, CPM, CTR, CPL e ROAS.</p>
              </div>
              <Button onClick={() => { setEditingInv({ reference_date: toInputDate(new Date()), channel: "meta_ads" }); setInvDialog(true); }}
                className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90">
                <Plus className="h-4 w-4 mr-1" /> Novo lançamento
              </Button>
            </div>

            <div className="border border-slate-800 rounded-md overflow-hidden">
              <div className="grid grid-cols-12 px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 bg-slate-950/40">
                <span className="col-span-2">Data</span>
                <span className="col-span-3">Campanha / utm</span>
                <span className="col-span-2 text-right">Investido</span>
                <span className="col-span-1 text-right">Impr.</span>
                <span className="col-span-1 text-right">Alc.</span>
                <span className="col-span-1 text-right">Cliq.</span>
                <span className="col-span-2 text-right">Ações</span>
              </div>
              <div className="divide-y divide-slate-800 max-h-[500px] overflow-auto">
                {investments.map((i) => (
                  <div key={i.id} className="grid grid-cols-12 px-3 py-2 text-xs items-center">
                    <span className="col-span-2 text-slate-300">{new Date(i.reference_date).toLocaleDateString("pt-BR")}</span>
                    <span className="col-span-3 font-mono truncate" title={`${i.campaign} · ${i.utm_campaign}`}>
                      {i.campaign || i.utm_campaign || "—"}
                      {i.adset ? <span className="text-slate-500"> · {i.adset}</span> : null}
                    </span>
                    <span className="col-span-2 text-right tabular-nums">{brl(i.amount_cents / 100)}</span>
                    <span className="col-span-1 text-right tabular-nums text-slate-400">{num(i.impressions)}</span>
                    <span className="col-span-1 text-right tabular-nums text-slate-400">{num(i.reach)}</span>
                    <span className="col-span-1 text-right tabular-nums text-slate-400">{num(i.clicks)}</span>
                    <span className="col-span-2 flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingInv({ ...i, ...({ amount_brl: i.amount_cents / 100 } as any) }); setInvDialog(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteInvestment(i.id)}>
                        <Trash2 className="h-3 w-3 text-rose-400" />
                      </Button>
                    </span>
                  </div>
                ))}
                {investments.length === 0 && <div className="px-3 py-3 text-xs text-slate-500">Nenhum lançamento no período.</div>}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* === TRÁFEGO === */}
        <TabsContent value="trafego" className="space-y-4">
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
        </TabsContent>

        {/* === INTEGRAÇÃO PIXEL & CAPI === */}
        <TabsContent value="integracao" className="space-y-4">
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

        {/* Atribuição UTM */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {[
            { title: "Por utm_source", rows: pxData?.by_utm_source ?? [], key: "utm_source" as const },
            { title: "Por utm_medium", rows: pxData?.by_utm_medium ?? [], key: "utm_medium" as const },
            { title: "Por utm_campaign", rows: pxData?.by_utm_campaign ?? [], key: "utm_campaign" as const },
          ].map((b) => (
            <div key={b.title}>
              <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">{b.title}</div>
              <div className="border border-slate-800 rounded-md divide-y divide-slate-800 max-h-72 overflow-auto">
                {b.rows.map((r: any, i: number) => (
                  <div key={i} className="grid grid-cols-12 px-3 py-2 text-xs items-center">
                    <span className="col-span-5 font-mono truncate" title={r[b.key]}>{r[b.key]}</span>
                    <span className="col-span-2 text-right tabular-nums text-slate-300">{r.total}</span>
                    <span className="col-span-2 text-right tabular-nums text-amber-300" title="Leads">{r.leads}</span>
                    <span className="col-span-3 text-right tabular-nums text-emerald-400" title="Compras / Receita">
                      {r.purchases}{r.revenue > 0 ? ` · R$ ${Number(r.revenue).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0})}` : ""}
                    </span>
                  </div>
                ))}
                {b.rows.length === 0 && <div className="px-3 py-3 text-xs text-slate-500">Sem dados UTM.</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Atribuição combinada */}
        <div className="mt-6">
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Atribuição completa (source · medium · campaign)</div>
          <div className="border border-slate-800 rounded-md divide-y divide-slate-800 max-h-80 overflow-auto">
            <div className="grid grid-cols-12 px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 bg-slate-950/40">
              <span className="col-span-6">Fonte / Mídia / Campanha</span>
              <span className="col-span-2 text-right">Eventos</span>
              <span className="col-span-2 text-right">Leads</span>
              <span className="col-span-2 text-right">Compras · Receita</span>
            </div>
            {(pxData?.attribution ?? []).map((r, i) => (
              <div key={i} className="grid grid-cols-12 px-3 py-2 text-xs items-center">
                <span className="col-span-6 font-mono truncate">
                  <span className="text-slate-300">{r.utm_source}</span>
                  <span className="text-slate-600"> · </span>
                  <span className="text-slate-400">{r.utm_medium}</span>
                  <span className="text-slate-600"> · </span>
                  <span className="text-slate-400">{r.utm_campaign}</span>
                </span>
                <span className="col-span-2 text-right tabular-nums text-slate-300">{r.total}</span>
                <span className="col-span-2 text-right tabular-nums text-amber-300">{r.leads}</span>
                <span className="col-span-2 text-right tabular-nums text-emerald-400">
                  {r.purchases}{r.revenue > 0 ? ` · R$ ${Number(r.revenue).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0})}` : ""}
                </span>
              </div>
            ))}
            {(pxData?.attribution.length ?? 0) === 0 && <div className="px-3 py-3 text-xs text-slate-500">Sem dados de atribuição UTM ainda.</div>}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Últimos eventos</div>
          <div className="border border-slate-800 rounded-md divide-y divide-slate-800 max-h-80 overflow-auto">
            {(pxData?.recent ?? []).map((r) => (
              <div key={r.id} className="grid grid-cols-12 px-3 py-2 text-xs items-center gap-y-0.5">
                <span className="col-span-3 font-mono">{r.event_name}</span>
                <span className={`col-span-2 ${r.source === "server" ? "text-emerald-400" : "text-[#00abfb]"}`}>
                  {r.source}{r.capi_status ? ` · ${r.capi_status}` : ""}
                </span>
                <span className="col-span-5 font-mono truncate text-slate-400">{r.event_source_url ?? "—"}</span>
                <span className="col-span-2 text-right text-slate-500">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                {(r.utm_source || r.utm_medium || r.utm_campaign) && (
                  <span className="col-span-12 text-[10px] text-slate-500 font-mono truncate pl-1">
                    utm: {r.utm_source ?? "—"} / {r.utm_medium ?? "—"} / {r.utm_campaign ?? "—"}
                    {r.utm_content ? ` · content=${r.utm_content}` : ""}
                    {r.utm_term ? ` · term=${r.utm_term}` : ""}
                  </span>
                )}
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
        </TabsContent>
      </Tabs>

      <Dialog open={invDialog} onOpenChange={(o) => { setInvDialog(o); if (!o) setEditingInv(null); }}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-2xl">
          <DialogHeader><DialogTitle>{editingInv?.id ? "Editar lançamento" : "Novo lançamento de investimento"}</DialogTitle></DialogHeader>
          {editingInv && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={editingInv.reference_date ?? ""} onChange={(e) => setEditingInv({ ...editingInv, reference_date: e.target.value })} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Canal</Label>
                <Select value={editingInv.channel ?? "meta_ads"} onValueChange={(v) => setEditingInv({ ...editingInv, channel: v })}>
                  <SelectTrigger className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta_ads">Meta Ads</SelectItem>
                    <SelectItem value="google_ads">Google Ads</SelectItem>
                    <SelectItem value="tiktok_ads">TikTok Ads</SelectItem>
                    <SelectItem value="influencer">Influencer</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Campanha</Label>
                <Input value={editingInv.campaign ?? ""} onChange={(e) => setEditingInv({ ...editingInv, campaign: e.target.value })} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Conjunto (adset)</Label>
                <Input value={editingInv.adset ?? ""} onChange={(e) => setEditingInv({ ...editingInv, adset: e.target.value })} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Anúncio</Label>
                <Input value={editingInv.ad ?? ""} onChange={(e) => setEditingInv({ ...editingInv, ad: e.target.value })} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">utm_source</Label>
                <Input value={editingInv.utm_source ?? ""} onChange={(e) => setEditingInv({ ...editingInv, utm_source: e.target.value })} className="bg-slate-950 border-slate-800 font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">utm_medium</Label>
                <Input value={editingInv.utm_medium ?? ""} onChange={(e) => setEditingInv({ ...editingInv, utm_medium: e.target.value })} className="bg-slate-950 border-slate-800 font-mono" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">utm_campaign (para atribuição)</Label>
                <Input value={editingInv.utm_campaign ?? ""} onChange={(e) => setEditingInv({ ...editingInv, utm_campaign: e.target.value })} className="bg-slate-950 border-slate-800 font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Investimento (R$)</Label>
                <Input type="number" step="0.01" value={(editingInv as any).amount_brl ?? ((editingInv.amount_cents ?? 0) / 100)} onChange={(e) => setEditingInv({ ...editingInv, ...({ amount_brl: e.target.value } as any) })} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Impressões</Label>
                <NumberInput allowDecimal={false} min={0} emptyBehavior="zero" value={editingInv.impressions ?? 0} onValueChange={(n) => setEditingInv({ ...editingInv, impressions: n })} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Alcance</Label>
                <NumberInput allowDecimal={false} min={0} emptyBehavior="zero" value={editingInv.reach ?? 0} onValueChange={(n) => setEditingInv({ ...editingInv, reach: n })} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cliques</Label>
                <NumberInput allowDecimal={false} min={0} emptyBehavior="zero" value={editingInv.clicks ?? 0} onValueChange={(n) => setEditingInv({ ...editingInv, clicks: n })} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Observações</Label>
                <Textarea value={editingInv.notes ?? ""} onChange={(e) => setEditingInv({ ...editingInv, notes: e.target.value })} className="bg-slate-950 border-slate-800" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setInvDialog(false); setEditingInv(null); }}>Cancelar</Button>
            <Button onClick={saveInvestment} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90">
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function KPI({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string | number; loading?: boolean }) {
  return (
    <div className="rounded-lg bg-gradient-to-br from-slate-800/60 to-slate-900 border border-slate-800 p-3">
      <div className="flex items-center gap-2 text-[11px] text-slate-400 uppercase tracking-wide">{icon}{label}</div>
      <div className="text-lg font-semibold mt-1 tabular-nums truncate">
        {loading ? "…" : value}
      </div>
    </div>
  );
}