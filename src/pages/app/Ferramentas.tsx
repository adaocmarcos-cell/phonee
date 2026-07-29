import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NumberInput } from "@/components/NumberInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { brl } from "@/lib/format";
import { useNavigate } from "react-router-dom";
import {
  Smartphone, Calculator, QrCode, Search, Printer, Settings2, Sparkles, CreditCard, Wallet,
} from "lucide-react";

/* ============================ AVALIAÇÃO DE SEMINOVOS ============================ */

type Appraisal = {
  erro?: string;
  modelo: string; estado: string; referencia: number; amostras: number; fonte: string;
  fator_estado: number; fator_bateria: number; margem_alvo_pct: number;
  venda_estimada: number; entrada_sugerida: number; lucro_estimado: number;
};

const FONTE_LABEL: Record<string, string> = {
  historico_vendas: "Histórico de vendas da loja",
  tabela_estoque: "Preço de tabela do estoque",
  trocas_anteriores: "Trocas anteriores do mesmo modelo",
  sem_referencia: "Sem referência encontrada",
};

const CONDITIONS = [
  { v: "otimo", l: "Ótimo" },
  { v: "bom", l: "Bom" },
  { v: "regular", l: "Regular" },
  { v: "com_defeito", l: "Com defeito" },
];

function AvaliacaoTab() {
  const { store } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [model, setModel] = useState("");
  const [condition, setCondition] = useState("bom");
  const [battery, setBattery] = useState(100);
  const [storage, setStorage] = useState("");
  const [result, setResult] = useState<Appraisal | null>(null);
  const [loading, setLoading] = useState(false);

  const [settings, setSettings] = useState<any>(null);
  const [savingCfg, setSavingCfg] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!store) return;
    const { data } = await (supabase as any).from("appraisal_settings").select("*").eq("store_id", store.id).maybeSingle();
    setSettings(data ?? {
      store_id: store.id, target_margin_pct: 30, battery_threshold: 85,
      battery_penalty_pct: 8, lookback_days: 180,
      condition_factors: { otimo: 1, bom: 0.9, regular: 0.78, com_defeito: 0.55 },
    });
  }, [store]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const run = async () => {
    if (!store || model.trim().length < 3) {
      toast({ title: "Informe o modelo do aparelho", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("appraise_device", {
      _store_id: store.id, _model: model.trim(), _condition: condition,
      _battery_health: battery > 0 ? battery : null, _storage: storage || null,
    });
    setLoading(false);
    if (error) { toast({ title: "Erro na avaliação", description: error.message, variant: "destructive" }); return; }
    setResult(data as Appraisal);
  };

  const saveSettings = async () => {
    if (!store || !settings) return;
    setSavingCfg(true);
    const { error } = await (supabase as any).from("appraisal_settings").upsert({
      store_id: store.id,
      target_margin_pct: settings.target_margin_pct,
      battery_threshold: settings.battery_threshold,
      battery_penalty_pct: settings.battery_penalty_pct,
      lookback_days: settings.lookback_days,
      condition_factors: settings.condition_factors,
    }, { onConflict: "store_id" });
    setSavingCfg(false);
    if (error) { toast({ title: "Sem permissão para alterar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Parâmetros salvos" });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Avaliar aparelho seminovo</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Modelo</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ex.: iPhone 13" />
          </div>
          <div>
            <Label>Estado de conservação</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Saúde da bateria (%)</Label>
            <NumberInput value={battery} onValueChange={setBattery} allowDecimal={false} min={0} />
          </div>
          <div>
            <Label>Armazenamento</Label>
            <Input value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="128GB" />
          </div>
        </div>
        <Button onClick={run} disabled={loading} className="w-full">
          <Sparkles className="h-4 w-4 mr-2" />{loading ? "Calculando…" : "Calcular valor de entrada"}
        </Button>

        {result && !result.erro && (
          <Card className="p-4 space-y-3 bg-muted/40">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Quanto pagar pelo aparelho</span>
              <Badge variant="outline">{FONTE_LABEL[result.fonte] ?? result.fonte}</Badge>
            </div>
            <p className="text-3xl font-bold text-primary">{brl(Number(result.entrada_sugerida))}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Referência de mercado</span><br />{brl(Number(result.referencia))} ({result.amostras} amostras)</div>
              <div><span className="text-muted-foreground">Revenda estimada</span><br />{brl(Number(result.venda_estimada))}</div>
              <div><span className="text-muted-foreground">Lucro previsto</span><br /><b>{brl(Number(result.lucro_estimado))}</b></div>
              <div><span className="text-muted-foreground">Margem alvo</span><br />{Number(result.margem_alvo_pct)}%</div>
            </div>
            {Number(result.fator_bateria) < 1 && (
              <p className="text-xs text-amber-600">Desconto aplicado por bateria abaixo do limite configurado.</p>
            )}
            {Number(result.amostras) === 0 && (
              <p className="text-xs text-amber-600">
                Sem histórico deste modelo. Cadastre o preço de venda no estoque para melhorar a estimativa.
              </p>
            )}
            <Button variant="outline" className="w-full" onClick={() => navigate("/painel/troca/novo")}>
              Registrar compra e troca
            </Button>
          </Card>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Parâmetros da avaliação</h3>
        </div>
        {settings && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Margem desejada (%)</Label>
                <NumberInput value={Number(settings.target_margin_pct)}
                  onValueChange={(v) => setSettings((s: any) => ({ ...s, target_margin_pct: v }))} min={0} />
              </div>
              <div>
                <Label>Histórico considerado (dias)</Label>
                <NumberInput value={Number(settings.lookback_days)} allowDecimal={false} min={30}
                  onValueChange={(v) => setSettings((s: any) => ({ ...s, lookback_days: v }))} />
              </div>
              <div>
                <Label>Bateria mínima aceitável (%)</Label>
                <NumberInput value={Number(settings.battery_threshold)} allowDecimal={false} min={0}
                  onValueChange={(v) => setSettings((s: any) => ({ ...s, battery_threshold: v }))} />
              </div>
              <div>
                <Label>Desconto por bateria fraca (%)</Label>
                <NumberInput value={Number(settings.battery_penalty_pct)} min={0}
                  onValueChange={(v) => setSettings((s: any) => ({ ...s, battery_penalty_pct: v }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fator por estado de conservação</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {CONDITIONS.map((c) => (
                  <div key={c.v} className="flex items-center gap-2">
                    <span className="text-sm w-28 text-muted-foreground">{c.l}</span>
                    <NumberInput
                      value={Number(settings.condition_factors?.[c.v] ?? 0.8)}
                      onValueChange={(v) =>
                        setSettings((s: any) => ({ ...s, condition_factors: { ...s.condition_factors, [c.v]: v } }))
                      }
                      min={0}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                O fator multiplica o preço de referência. 1,0 = aparelho impecável; 0,55 = com defeito.
              </p>
            </div>
            <Button onClick={saveSettings} disabled={savingCfg} className="w-full">
              {savingCfg ? "Salvando…" : "Salvar parâmetros"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

/* ============================ SIMULADOR ============================ */

type Rule = {
  payment_method: string; installments_from: number; installments_to: number;
  fee_pct: number; fee_fixed_cents: number; receive_days: number;
};

function SimuladorTab() {
  const { store } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [value, setValue] = useState(1000);
  const [maxInst, setMaxInst] = useState(12);
  const [passOn, setPassOn] = useState(false);

  const [entrada, setEntrada] = useState(0);
  const [parcelas, setParcelas] = useState(6);
  const [juros, setJuros] = useState(3.5);

  useEffect(() => {
    if (!store) return;
    (supabase as any).from("card_fee_rules")
      .select("payment_method,installments_from,installments_to,fee_pct,fee_fixed_cents,receive_days")
      .eq("store_id", store.id)
      .then(({ data }: any) => setRules(data ?? []));
  }, [store]);

  const ruleFor = useCallback(
    (n: number) =>
      rules.find(
        (r) => r.payment_method === "credito" && n >= r.installments_from && n <= r.installments_to,
      ) ?? null,
    [rules],
  );

  const cardRows = useMemo(() => {
    const rows: { n: number; taxa: number; bruto: number; liquido: number; parcela: number; dias: number; temRegra: boolean }[] = [];
    for (let n = 1; n <= Math.max(Math.min(maxInst, 24), 1); n++) {
      const r = ruleFor(n);
      const pct = r ? Number(r.fee_pct) : 0;
      const fixo = r ? Number(r.fee_fixed_cents) / 100 : 0;
      // repassar a taxa: cobra a mais para receber líquido igual ao valor desejado
      const bruto = passOn && pct < 100 ? (value + fixo) / (1 - pct / 100) : value;
      const taxa = bruto * (pct / 100) + fixo;
      rows.push({
        n, taxa, bruto, liquido: bruto - taxa, parcela: bruto / n,
        dias: r ? Number(r.receive_days) : 0, temRegra: !!r,
      });
    }
    return rows;
  }, [value, maxInst, passOn, ruleFor]);

  const crediario = useMemo(() => {
    const financiado = Math.max(value - entrada, 0);
    const i = juros / 100;
    const n = Math.max(parcelas, 1);
    const parcela = i > 0 ? (financiado * i) / (1 - Math.pow(1 + i, -n)) : financiado / n;
    const totalPago = parcela * n + entrada;
    return { financiado, parcela, totalPago, jurosTotais: totalPago - value };
  }, [value, entrada, parcelas, juros]);

  return (
    <div className="space-y-4">
      <Card className="p-4 grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Valor da venda</Label>
          <NumberInput value={value} onValueChange={setValue} min={0} />
        </div>
        <div>
          <Label>Simular até (parcelas)</Label>
          <NumberInput value={maxInst} onValueChange={setMaxInst} allowDecimal={false} min={1} />
        </div>
        <div className="flex items-end gap-2">
          <Checkbox id="passOn" checked={passOn} onCheckedChange={(v) => setPassOn(!!v)} />
          <Label htmlFor="passOn" className="text-sm">Repassar a taxa ao cliente</Label>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Cartão de crédito</h3>
        </div>
        {rules.length === 0 && (
          <p className="text-sm text-amber-600 mb-3">
            Nenhuma regra de maquininha cadastrada — a simulação está sem taxas. Cadastre em Financeiro → Taxas de maquininha.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2">Parcelas</th>
                <th className="text-right">Cobrar do cliente</th>
                <th className="text-right">Valor da parcela</th>
                <th className="text-right">Taxa</th>
                <th className="text-right">Você recebe</th>
                <th className="text-right">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {cardRows.map((r) => (
                <tr key={r.n} className="border-b last:border-0">
                  <td className="py-2">{r.n}x {!r.temRegra && <span className="text-xs text-muted-foreground">(sem regra)</span>}</td>
                  <td className="text-right">{brl(r.bruto)}</td>
                  <td className="text-right">{brl(r.parcela)}</td>
                  <td className="text-right text-rose-600">-{brl(r.taxa)}</td>
                  <td className="text-right font-semibold">{brl(r.liquido)}</td>
                  <td className="text-right text-muted-foreground">{r.dias ? `${r.dias} d` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Crediário próprio</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Entrada</Label>
            <NumberInput value={entrada} onValueChange={setEntrada} min={0} />
          </div>
          <div>
            <Label>Parcelas</Label>
            <NumberInput value={parcelas} onValueChange={setParcelas} allowDecimal={false} min={1} />
          </div>
          <div>
            <Label>Juros ao mês (%)</Label>
            <NumberInput value={juros} onValueChange={setJuros} min={0} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4 text-sm">
          <Card className="p-3"><span className="text-muted-foreground">Financiado</span><p className="font-semibold">{brl(crediario.financiado)}</p></Card>
          <Card className="p-3"><span className="text-muted-foreground">Parcela</span><p className="font-semibold text-primary">{brl(crediario.parcela)}</p></Card>
          <Card className="p-3"><span className="text-muted-foreground">Total pago</span><p className="font-semibold">{brl(crediario.totalPago)}</p></Card>
          <Card className="p-3"><span className="text-muted-foreground">Juros no período</span><p className="font-semibold">{brl(crediario.jurosTotais)}</p></Card>
        </div>
        <p className="text-xs text-muted-foreground">
          Cálculo pela Tabela Price. Use no fechamento do crediário para conferir o valor da parcela antes de registrar a venda.
        </p>
      </Card>
    </div>
  );
}

/* ============================ ETIQUETAS QR ============================ */

type Prod = { id: string; name: string; sku: string | null; imei: string | null; sale_price: number; stock_current: number };

function EtiquetasTab() {
  const { store } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [prods, setProds] = useState<Prod[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [showPrice, setShowPrice] = useState(true);

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    let q = (supabase as any).from("products")
      .select("id,name,sku,imei,sale_price,stock_current")
      .eq("store_id", store.id).order("name").limit(60);
    if (search.trim().length >= 2) q = q.ilike("name", `%${search.trim()}%`);
    const { data } = await q;
    setProds(data ?? []);
    setLoading(false);
  }, [store, search]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const totalLabels = useMemo(() => Object.values(selected).reduce((s, n) => s + n, 0), [selected]);

  const toggle = (p: Prod, on: boolean) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (on) next[p.id] = next[p.id] || 1; else delete next[p.id];
      return next;
    });

  const print = async () => {
    const chosen = prods.filter((p) => selected[p.id]);
    if (chosen.length === 0) { toast({ title: "Selecione ao menos um produto", variant: "destructive" }); return; }

    const cards: string[] = [];
    for (const p of chosen) {
      const code = p.imei || p.sku || p.id.slice(0, 8).toUpperCase();
      const qr = await QRCode.toDataURL(code, { margin: 0, width: 160 });
      const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
      for (let i = 0; i < (selected[p.id] || 1); i++) {
        cards.push(`<div class="lbl">
          <img src="${qr}" />
          <div class="info">
            <div class="nm">${esc(p.name)}</div>
            <div class="cd">${esc(code)}</div>
            ${showPrice ? `<div class="pr">${brl(Number(p.sale_price))}</div>` : ""}
            <div class="st">${esc(store?.trade_name || store?.name || "")}</div>
          </div>
        </div>`);
      }
    }

    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Libere pop-ups para imprimir", variant: "destructive" }); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Etiquetas</title>
    <style>
      body { font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif; margin:8mm; display:flex; flex-wrap:wrap; gap:4mm; }
      .lbl { width:62mm; height:29mm; border:1px dashed #cbd5e1; border-radius:2mm; padding:2mm;
             display:flex; gap:2mm; align-items:center; page-break-inside:avoid; }
      .lbl img { width:22mm; height:22mm; }
      .info { min-width:0; flex:1; }
      .nm { font-size:9pt; font-weight:600; line-height:1.15; max-height:22pt; overflow:hidden; }
      .cd { font-size:7pt; color:#475569; margin-top:1mm; font-family:monospace; }
      .pr { font-size:12pt; font-weight:700; margin-top:1mm; }
      .st { font-size:6pt; color:#94a3b8; margin-top:0.5mm; }
      @media print { .lbl { border-color:transparent; } }
    </style></head><body>${cards.join("")}
    <script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <Label>Buscar produto</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do produto…" />
            </div>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Checkbox id="showPrice" checked={showPrice} onCheckedChange={(v) => setShowPrice(!!v)} />
            <Label htmlFor="showPrice" className="text-sm">Mostrar preço</Label>
          </div>
          <Button onClick={print} disabled={totalLabels === 0}>
            <Printer className="h-4 w-4 mr-2" />Imprimir {totalLabels || ""} etiqueta{totalLabels === 1 ? "" : "s"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O QR Code traz o IMEI (aparelhos) ou o SKU do produto — o mesmo código que o PDV reconhece na busca.
        </p>
      </Card>

      <Card className="divide-y">
        {loading ? (
          <p className="p-6 text-center text-muted-foreground">Carregando…</p>
        ) : prods.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">Nenhum produto encontrado.</p>
        ) : (
          prods.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <Checkbox checked={!!selected[p.id]} onCheckedChange={(v) => toggle(p, !!v)} />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-sm">{p.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.imei || p.sku || "sem código"}</p>
              </div>
              <span className="text-sm text-muted-foreground shrink-0">{brl(Number(p.sale_price))}</span>
              {selected[p.id] && (
                <div className="w-24 shrink-0">
                  <NumberInput
                    value={selected[p.id]} allowDecimal={false} min={1}
                    onValueChange={(v) => setSelected((prev) => ({ ...prev, [p.id]: Math.max(v, 1) }))}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

/* ============================ PÁGINA ============================ */

export default function Ferramentas() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ferramentas"
        description="Avaliação de seminovos, simulador de parcelamento e etiquetas com QR Code."
      />
      <Tabs defaultValue="avaliacao">
        <TabsList>
          <TabsTrigger value="avaliacao"><Smartphone className="h-4 w-4 mr-1" />Avaliação</TabsTrigger>
          <TabsTrigger value="simulador"><Calculator className="h-4 w-4 mr-1" />Simulador</TabsTrigger>
          <TabsTrigger value="etiquetas"><QrCode className="h-4 w-4 mr-1" />Etiquetas QR</TabsTrigger>
        </TabsList>
        <TabsContent value="avaliacao" className="mt-4"><AvaliacaoTab /></TabsContent>
        <TabsContent value="simulador" className="mt-4"><SimuladorTab /></TabsContent>
        <TabsContent value="etiquetas" className="mt-4"><EtiquetasTab /></TabsContent>
      </Tabs>
    </div>
  );
}
