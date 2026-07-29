import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberInput } from "@/components/NumberInput";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { brl } from "@/lib/format";
import { buildWaMeUrl, normalizeWhatsappPhone } from "@/lib/whatsappTemplates";
import {
  MessageCircle, RefreshCw, Send, SkipForward, Users, Repeat, Sparkles,
  CalendarClock, Settings2, Save, CheckCircle2, Phone,
} from "lucide-react";

/** Gatilhos das réguas de relacionamento (espelha o CHECK de crm_rules). */
export const CRM_TRIGGERS: { key: string; label: string; hint: string; paramLabel?: string; paramKey?: string; paramDefault?: number }[] = [
  { key: "aniversario", label: "Aniversário", hint: "Cliente faz aniversário hoje." },
  { key: "inatividade_90d", label: "Cliente inativo", hint: "Sem comprar há X dias.", paramLabel: "Dias sem comprar", paramKey: "days", paramDefault: 90 },
  { key: "ciclo_upgrade_12m", label: "Ciclo de upgrade", hint: "Comprou aparelho há X meses.", paramLabel: "Meses desde a compra", paramKey: "months", paramDefault: 12 },
  { key: "garantia_vencendo_15d", label: "Garantia vencendo", hint: "Garantia vence em X dias.", paramLabel: "Dias de antecedência", paramKey: "days", paramDefault: 15 },
  { key: "pos_venda_7d", label: "Pós-venda", hint: "X dias depois da compra.", paramLabel: "Dias após a compra", paramKey: "days", paramDefault: 7 },
  { key: "os_entregue_3d", label: "Pós-reparo", hint: "X dias depois da OS entregue.", paramLabel: "Dias após a entrega", paramKey: "days", paramDefault: 3 },
];

type Rule = {
  id: string; store_id: string; trigger_key: string; enabled: boolean;
  template_id: string | null; send_hour: number; params: Record<string, any>;
};
type QueueItem = {
  id: string; trigger_key: string; queue_date: string; customer_id: string | null;
  customer_name: string; phone: string | null; reason: string; message: string;
  status: "pendente" | "enviado" | "pulado"; sent_at: string | null;
  sale_id: string | null; os_id: string | null;
};
type Metrics = {
  enviados: number; pulados: number; pendentes: number;
  clientes_reativados: number; receita_atribuida: number;
  ticket_medio: number; taxa_conversao_pct: number;
  por_gatilho: { trigger: string; label: string; enviados: number }[];
};
type UpgradeCandidate = {
  customer_id: string; customer_name: string; phone: string | null;
  sale_number: number | null; sale_at: string; aparelho: string;
  imei: string | null; valor_pago: number; meses: number; entrada_estimada: number;
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const labelOf = (k: string) => CRM_TRIGGERS.find((t) => t.key === k)?.label ?? k;

export default function PosVenda() {
  const { store, role } = useAuth();
  const { toast } = useToast();
  const canEdit = role === "dono" || role === "gerente";

  const today = iso(new Date());
  const [date, setDate] = useState(today);
  const [monthFrom] = useState(iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [candidates, setCandidates] = useState<UpgradeCandidate[]>([]);
  const [upgradeMonths, setUpgradeMonths] = useState(12);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const [{ data: q }, { data: r }, { data: m }, { data: tpl }] = await Promise.all([
      (supabase as any).from("crm_queue").select("*").eq("store_id", store.id)
        .eq("queue_date", date).order("status").order("created_at"),
      (supabase as any).from("crm_rules").select("*").eq("store_id", store.id),
      (supabase as any).rpc("crm_metrics", { _store_id: store.id, _from: monthFrom, _to: today }),
      (supabase as any).from("whatsapp_templates").select("id,event_key,body")
        .eq("store_id", store.id).in("event_key", CRM_TRIGGERS.map((t) => t.key)),
    ]);
    setQueue((q || []) as QueueItem[]);
    setRules((r || []) as Rule[]);
    setMetrics((m || null) as Metrics | null);
    const map: Record<string, string> = {};
    (tpl || []).forEach((t: any) => { map[t.event_key] = t.body; });
    // Preenche os que não têm template com o texto padrão do banco.
    const missing = CRM_TRIGGERS.filter((t) => !map[t.key]);
    if (missing.length) {
      const defaults = await Promise.all(
        missing.map((t) => (supabase as any).rpc("crm_default_body", { _trigger: t.key })),
      );
      missing.forEach((t, i) => { map[t.key] = (defaults[i]?.data as string) ?? ""; });
    }
    setBodies(map);
    setLoading(false);
  }, [store, date, monthFrom, today]);

  useEffect(() => { load(); }, [load]);

  const loadCandidates = useCallback(async () => {
    if (!store) return;
    const { data, error } = await (supabase as any).rpc("crm_upgrade_candidates", {
      _store_id: store.id, _months: upgradeMonths, _limit: 200,
    });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setCandidates((data || []) as UpgradeCandidate[]);
  }, [store, upgradeMonths, toast]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const ruleOf = (key: string) => rules.find((r) => r.trigger_key === key);

  const generate = async () => {
    if (!store) return;
    setBusy("gen");
    const { data, error } = await (supabase as any).rpc("crm_build_queue", { _store_id: store.id, _date: date });
    setBusy(null);
    if (error) return toast({ title: "Erro ao gerar a fila", description: error.message, variant: "destructive" });
    toast({ title: "Fila atualizada", description: `${data?.gerados ?? 0} novo(s) contato(s) para ${date.split("-").reverse().join("/")}.` });
    load();
  };

  const send = async (item: QueueItem) => {
    const phone = normalizeWhatsappPhone(item.phone);
    if (!phone) return toast({ title: "Sem WhatsApp", description: "Este cliente não tem telefone cadastrado.", variant: "destructive" });
    window.open(buildWaMeUrl(phone, item.message), "_blank", "noopener");
    setBusy(item.id);
    const { error } = await (supabase as any).rpc("crm_mark_sent", { _queue_id: item.id });
    setBusy(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "enviado", sent_at: new Date().toISOString() } : q));
  };

  const skip = async (item: QueueItem) => {
    setBusy(item.id);
    const { error } = await (supabase as any).rpc("crm_skip", { _queue_id: item.id });
    setBusy(null);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "pulado" } : q));
  };

  const saveRule = async (key: string, patch: Partial<Rule>) => {
    if (!store || !canEdit) return;
    const existing = ruleOf(key);
    const payload = {
      store_id: store.id, trigger_key: key,
      enabled: patch.enabled ?? existing?.enabled ?? true,
      send_hour: patch.send_hour ?? existing?.send_hour ?? 9,
      params: patch.params ?? existing?.params ?? {},
      template_id: patch.template_id ?? existing?.template_id ?? null,
    };
    const { data, error } = await (supabase as any)
      .from("crm_rules").upsert(payload, { onConflict: "store_id,trigger_key" }).select().single();
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setRules((prev) => {
      const rest = prev.filter((r) => r.trigger_key !== key);
      return [...rest, data as Rule];
    });
  };

  const saveMessage = async (key: string) => {
    if (!store || !canEdit) return;
    setBusy(key);
    const meta = CRM_TRIGGERS.find((t) => t.key === key)!;
    const { data, error } = await (supabase as any).from("whatsapp_templates").upsert({
      store_id: store.id, event_key: key, title: meta.label, body: bodies[key] ?? "", is_active: true,
    }, { onConflict: "store_id,event_key" }).select("id").single();
    if (error) { setBusy(null); return toast({ title: "Erro", description: error.message, variant: "destructive" }); }
    await saveRule(key, { template_id: (data as any).id });
    setBusy(null);
    toast({ title: "Mensagem salva", description: `Régua "${meta.label}" atualizada.` });
  };

  const pendentes = useMemo(() => queue.filter((q) => q.status === "pendente"), [queue]);
  const tratados = useMemo(() => queue.filter((q) => q.status !== "pendente"), [queue]);
  const activeRules = rules.filter((r) => r.enabled).length;

  const upgradeMessage = (c: UpgradeCandidate) => {
    const first = c.customer_name.split(" ")[0];
    const base = bodies["ciclo_upgrade_12m"] || "";
    return base
      .replace(/\{cliente\}/g, first)
      .replace(/\{loja\}/g, store?.name ?? "")
      .replace(/\{aparelho\}/g, c.aparelho)
      .replace(/\{meses\}/g, String(c.meses));
  };

  const sendUpgrade = (c: UpgradeCandidate) => {
    const phone = normalizeWhatsappPhone(c.phone);
    if (!phone) return toast({ title: "Sem WhatsApp", description: "Cliente sem telefone cadastrado.", variant: "destructive" });
    window.open(buildWaMeUrl(phone, upgradeMessage(c)), "_blank", "noopener");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pós-venda"
        description="Réguas de relacionamento e a fila de contatos do dia — você dispara um a um, sem envio automático."
        actions={
          <div className="flex items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[150px]" />
            <Button onClick={generate} disabled={busy === "gen"}>
              <RefreshCw className={`h-4 w-4 mr-1 ${busy === "gen" ? "animate-spin" : ""}`} />
              Gerar fila
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Pendentes hoje" value={String(pendentes.length)} delta="Contatos na fila do dia" icon={CalendarClock} tone="info" />
        <MetricCard label="Enviados no mês" value={String(metrics?.enviados ?? 0)} delta={`${metrics?.pulados ?? 0} pulados`} icon={Send} />
        <MetricCard label="Clientes reativados" value={String(metrics?.clientes_reativados ?? 0)}
          delta={`${metrics?.taxa_conversao_pct ?? 0}% de conversão`} icon={Users} tone="success" />
        <MetricCard label="Receita atribuída" value={brl(metrics?.receita_atribuida ?? 0)}
          delta="Vendas em até 30 dias" icon={Sparkles} tone="success" />
      </div>

      <Tabs defaultValue="fila">
        <TabsList>
          <TabsTrigger value="fila">Fila do dia {pendentes.length > 0 && <Badge className="ml-2">{pendentes.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="upgrade">Prontos para upgrade</TabsTrigger>
          <TabsTrigger value="reguas">Réguas <Badge variant="outline" className="ml-2">{activeRules}</Badge></TabsTrigger>
        </TabsList>

        {/* ── FILA ── */}
        <TabsContent value="fila" className="space-y-4">
          {loading ? (
            <Card className="p-10 text-center text-xs font-mono text-muted-foreground">CARREGANDO…</Card>
          ) : queue.length === 0 ? (
            <Card className="p-10 text-center space-y-2">
              <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum contato na fila para esta data.
              </p>
              <p className="text-xs text-muted-foreground">
                {activeRules === 0
                  ? "Ative pelo menos uma régua na aba Réguas e clique em Gerar fila."
                  : "Clique em Gerar fila para montar a lista do dia."}
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendentes.map((item) => (
                  <Card key={item.id} className="p-4 space-y-3 bg-card border-border">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{item.customer_name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />{item.phone || "sem telefone"}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{labelOf(item.trigger_key)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{item.reason}</div>
                    <pre className="whitespace-pre-wrap text-xs font-mono bg-muted/30 rounded-md p-2.5 max-h-40 overflow-auto">
                      {item.message}
                    </pre>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => send(item)} disabled={busy === item.id}>
                        <Send className="h-3.5 w-3.5 mr-1" />Abrir WhatsApp
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => skip(item)} disabled={busy === item.id}>
                        <SkipForward className="h-3.5 w-3.5 mr-1" />Pular
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              {tratados.length > 0 && (
                <Card className="bg-card border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-widest font-mono text-muted-foreground">
                    Já tratados hoje ({tratados.length})
                  </div>
                  <div className="divide-y divide-border">
                    {tratados.map((t) => (
                      <div key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{t.customer_name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[10px]">{labelOf(t.trigger_key)}</Badge>
                          {t.status === "enviado" ? (
                            <Badge className="text-[10px] bg-success text-success-foreground">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Enviado
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Pulado</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── UPGRADE ── */}
        <TabsContent value="upgrade" className="space-y-4">
          <Card className="p-4 flex flex-wrap items-end gap-3 bg-card border-border">
            <div className="space-y-1.5">
              <Label className="text-xs">Comprou há pelo menos (meses)</Label>
              <NumberInput value={upgradeMonths} onValueChange={(v) => setUpgradeMonths(Math.max(1, Number(v) || 12))} className="w-28" />
            </div>
            <Button variant="outline" onClick={loadCandidates}>
              <RefreshCw className="h-4 w-4 mr-1" />Atualizar
            </Button>
            <div className="text-xs text-muted-foreground ml-auto">
              {candidates.length} cliente(s) no ciclo de troca
            </div>
          </Card>

          <Card className="bg-card border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium">Aparelho</th>
                  <th className="text-center px-4 py-3 font-medium">Uso</th>
                  <th className="text-right px-4 py-3 font-medium">Pagou</th>
                  <th className="text-right px-4 py-3 font-medium">Entrada estimada</th>
                  <th className="text-right px-4 py-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {candidates.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Nenhum cliente no ciclo de upgrade.</td></tr>
                ) : candidates.map((c) => (
                  <tr key={c.customer_id + c.sale_at} className="hover:bg-surface-elevated/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium truncate max-w-[200px]">{c.customer_name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.phone || "sem telefone"}</div>
                    </td>
                    <td className="px-4 py-2.5 max-w-[240px] truncate" title={c.aparelho}>{c.aparelho}</td>
                    <td className="px-4 py-2.5 text-center text-xs font-mono">{c.meses} meses</td>
                    <td className="px-4 py-2.5 text-right metric">{brl(c.valor_pago)}</td>
                    <td className="px-4 py-2.5 text-right metric text-success font-semibold">{brl(c.entrada_estimada)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => sendUpgrade(c)}>
                        <Repeat className="h-3.5 w-3.5 mr-1" />Oferecer troca
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-[11px] text-muted-foreground">
            A entrada estimada é uma referência automática pela depreciação do valor pago. A tabela de avaliação
            detalhada (condição, bateria e defeitos) entra na Fase 3.
          </p>
        </TabsContent>

        {/* ── RÉGUAS ── */}
        <TabsContent value="reguas" className="space-y-3">
          {!canEdit && (
            <Card className="p-3 text-xs text-muted-foreground">
              Somente dono e gerente podem alterar as réguas.
            </Card>
          )}
          {CRM_TRIGGERS.map((meta) => {
            const r = ruleOf(meta.key);
            const paramValue = meta.paramKey ? (r?.params?.[meta.paramKey] ?? meta.paramDefault) : null;
            return (
              <Card key={meta.key} className="p-4 bg-card border-border space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{meta.label}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">{meta.key}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{meta.hint}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Ativa</Label>
                    <Switch
                      checked={!!r?.enabled}
                      disabled={!canEdit}
                      onCheckedChange={(v) => saveRule(meta.key, { enabled: v })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {meta.paramKey && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{meta.paramLabel}</Label>
                      <NumberInput
                        value={Number(paramValue)}
                        disabled={!canEdit}
                        onValueChange={(v) =>
                          saveRule(meta.key, { params: { ...(r?.params ?? {}), [meta.paramKey!]: Math.max(1, Number(v) || meta.paramDefault!) } })
                        }
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Horário de geração</Label>
                    <Select
                      value={String(r?.send_hour ?? 9)}
                      disabled={!canEdit}
                      onValueChange={(v) => saveRule(meta.key, { send_hour: Number(v) })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, h) => (
                          <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Mensagem — variáveis: <code className="font-mono">{"{cliente} {loja} {aparelho} {dias} {meses} {data}"}</code>
                  </Label>
                  <Textarea
                    rows={5}
                    className="font-mono text-xs"
                    disabled={!canEdit}
                    value={bodies[meta.key] ?? ""}
                    onChange={(e) => setBodies((b) => ({ ...b, [meta.key]: e.target.value }))}
                  />
                  {canEdit && (
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => saveMessage(meta.key)} disabled={busy === meta.key}>
                        <Save className="h-3.5 w-3.5 mr-1" />Salvar mensagem
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            A fila é montada automaticamente todo dia de manhã. Nada é enviado sozinho: cada mensagem só sai
            quando você toca em "Abrir WhatsApp".
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
