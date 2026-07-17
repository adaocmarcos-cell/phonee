import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, History, Package, CheckCircle2, CircleOff, HelpCircle, FileDown, PackagePlus, PowerOff, Eye, AlertTriangle, Wrench, Plus, Trash2, XCircle, FileText } from "lucide-react";
import { brl } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import NumberInput from "@/components/NumberInput";
import { toSimpleStatus, reasonSubtext, SIMPLE_STATUS_TOOLTIP, DEACTIVATE_REASONS, REASON_LABEL } from "@/lib/tradeInStatus";
import { printTradeInFicha, buildTradeInFichaHtml, printTradeInTimeline } from "@/lib/tradeInPrint";
import { Textarea } from "@/components/ui/textarea";
import { evaluateCompleteness } from "@/lib/tradeInCompleteness";
import { toast } from "sonner";

type TI = any;
type Audit = {
  id: string; created_at: string; action: string; user_id: string | null;
  details: any;
};

const actionLabel: Record<string, string> = {
  criacao: "Entrada criada",
  edicao: "Edição",
  mudanca_status: "Mudança de status",
};

function fmtVal(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") return String(v);
  return String(v);
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  em_avaliacao:  { label: "Em avaliação",       className: "bg-muted text-muted-foreground border-border" },
  aprovado:      { label: "Aguardando preparo", className: "bg-warning/15 text-warning border-warning/30" },
  em_estoque:    { label: "Em estoque",         className: "bg-success/15 text-success border-success/30" },
  vendido:       { label: "Vendido",            className: "bg-primary/15 text-primary border-primary/30" },
  recusado:      { label: "Recusado",           className: "bg-muted text-muted-foreground border-border" },
};

export default function TradeInDetails() {
  const { id } = useParams();
  const { store } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<TI | null>(null);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reasonKey, setReasonKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairPreviewOpen, setRepairPreviewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [invParts, setInvParts] = useState<{ id: string; name: string; stock_current: number; cost_price: number }[]>([]);
  const [rows, setRows] = useState<{ part_id: string | null; name: string; qty: number; unit_cost: number }[]>([]);
  const [manualCost, setManualCost] = useState(0);
  const [manualNotes, setManualNotes] = useState("");

  useEffect(() => {
    if (!id || !store) return;
    (async () => {
      setLoading(true);
      const [{ data: ti }, { data: log }] = await Promise.all([
        supabase.from("trade_ins").select("*").eq("id", id).maybeSingle(),
        supabase.from("audit_log").select("id,created_at,action,user_id,details")
          .eq("entity", "trade_in").eq("entity_id", id)
          .order("created_at", { ascending: false }),
      ]);
      setItem(ti);
      const a = (log ?? []) as Audit[];
      setAudits(a);
      const uids = Array.from(new Set(a.map((x) => x.user_id).filter(Boolean))) as string[];
      if (uids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", uids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name || p.email || p.id.slice(0, 8); });
        setPeople(map);
      }
      setLoading(false);
    })();
  }, [id, store]);

  if (loading) return <div className="p-8 text-center text-muted-foreground text-xs font-mono">CARREGANDO…</div>;
  if (!item) return <div className="p-8 text-center text-muted-foreground">Entrada não encontrada.</div>;

  const margin = item.intended_sale_value > 0
    ? ((item.intended_sale_value - (Number(item.entry_value) + Number(item.repair_costs || 0))) / item.intended_sale_value) * 100
    : 0;

  const simple = toSimpleStatus(item.status);
  const reason = reasonSubtext(item.status);
  const isSold = item.status === "vendido";
  const isAwaitingRepair = simple === "aguardando_preparo";

  const exportTimeline = () => {
    if (!store) return;
    const entries = audits.map((a) => ({
      created_at: a.created_at,
      action: a.action,
      user_label: a.user_id ? (people[a.user_id] ?? a.user_id.slice(0, 8)) : "sistema",
      details: a.details,
    }));
    printTradeInTimeline(item, store as any, entries);
  };

  const submitCancelRepair = async () => {
    setSaving(true);
    const { error } = await (supabase as any).rpc("cancel_trade_in_repair", {
      _trade_in_id: item.id,
      _reason: cancelReason || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Preparo cancelado. Aparelho voltou para 'Em avaliação'.");
    setCancelOpen(false);
    setCancelReason("");
    const { data: ti } = await supabase.from("trade_ins").select("*").eq("id", item.id).maybeSingle();
    setItem(ti);
    reloadAudits();
  };

  const openRepair = async () => {
    if (!store) return;
    const { data } = await supabase
      .from("parts_inventory")
      .select("id,name,stock_current,cost_price")
      .eq("store_id", store.id)
      .order("name");
    setInvParts((data ?? []) as any);
    // Prefill with existing repair_parts snapshot, if any
    const existing = Array.isArray(item.repair_parts) ? item.repair_parts : [];
    setRows(existing.map((p: any) => ({
      part_id: p.part_id ?? null,
      name: p.name || "",
      qty: Number(p.qty || 1),
      unit_cost: Number(p.unit_cost || 0),
    })));
    setManualCost(0);
    setManualNotes("");
    setRepairOpen(true);
  };

  const addRow = () => setRows((r) => [...r, { part_id: null, name: "", qty: 1, unit_cost: 0 }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<{ part_id: string | null; name: string; qty: number; unit_cost: number }>) =>
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const partsCost = rows.reduce((s, r) => s + r.qty * r.unit_cost, 0);
  const totalCost = partsCost + Number(manualCost || 0);

  // Prévia: peças com estoque insuficiente
  const missingParts = rows
    .map((r) => {
      if (!r.part_id) return null;
      const inv = invParts.find((p) => p.id === r.part_id);
      if (!inv) return { name: r.name || "?", need: r.qty, available: 0 };
      if (inv.stock_current < r.qty)
        return { name: inv.name, need: r.qty, available: inv.stock_current };
      return null;
    })
    .filter(Boolean) as { name: string; need: number; available: number }[];
  const externalParts = rows.filter((r) => !r.part_id && (r.name || r.unit_cost > 0));

  const submitRepair = async () => {
    for (const r of rows) {
      if (r.qty <= 0) return toast.error("Quantidade da peça deve ser maior que zero.");
    }
    if (missingParts.length > 0) {
      return toast.error("Há peças com estoque insuficiente. Ajuste antes de continuar.");
    }
    setSaving(true);
    const payloadParts = rows.map((r) => ({
      part_id: r.part_id,
      name: r.name || (invParts.find((x) => x.id === r.part_id)?.name ?? ""),
      qty: r.qty,
      unit_cost: r.unit_cost,
    }));
    const { error } = await (supabase as any).rpc("finish_trade_in_repair", {
      _trade_in_id: item.id,
      _parts: payloadParts,
      _manual_cost: Number(manualCost) || 0,
      _manual_notes: manualNotes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Preparo concluído. Aparelho no estoque.");
    setRepairPreviewOpen(false);
    setRepairOpen(false);
    // Reload
    const { data: ti } = await supabase.from("trade_ins").select("*").eq("id", item.id).maybeSingle();
    setItem(ti);
    reloadAudits();
  };

  const activateToStock = async () => {
    if (!item) return;
    setSaving(true);
    const de = item.status;
    const { error } = await supabase
      .from("trade_ins")
      .update({ status: "em_estoque" })
      .eq("id", item.id);
    if (!error) {
      await supabase.from("audit_log").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
        store_id: store?.id ?? null,
        action: "mudanca_status",
        entity: "trade_in",
        entity_id: item.id,
        module: "trade_in",
        details: { status: { de, para: "em_estoque" }, motivo: "Ativação para estoque" },
      });
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Aparelho enviado ao estoque.");
    setItem({ ...item, status: "em_estoque" });
    // recarrega audit trail
    reloadAudits();
  };

  const confirmDeactivate = async () => {
    const opt = DEACTIVATE_REASONS.find((r) => r.key === reasonKey);
    if (!opt) return toast.error("Selecione um motivo.");
    setSaving(true);
    const de = item.status;
    const notePrefix = `[desativado: ${opt.label}]`;
    const newNotes = item.notes ? `${notePrefix} ${item.notes}` : notePrefix;
    const patch: any = { status: opt.targetStatus, notes: newNotes };
    if (opt.scrapForParts) patch.scrap_for_parts = true;
    const { error } = await supabase.from("trade_ins").update(patch).eq("id", item.id);
    if (error) { setSaving(false); return toast.error(error.message); }
    // Se havia produto vinculado, inativa (não exclui).
    if (item.product_id) {
      await supabase.from("products").update({ status: "inativo" }).eq("id", item.product_id);
    }
    await supabase.from("audit_log").insert({
      user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      store_id: store?.id ?? null,
      action: "mudanca_status",
      entity: "trade_in",
      entity_id: item.id,
      module: "trade_in",
      details: { status: { de, para: opt.targetStatus }, motivo: opt.label },
    });
    setSaving(false);
    setDeactivateOpen(false);
    toast.success(`Aparelho desativado: ${opt.label}`);
    setItem({ ...item, ...patch });
    reloadAudits();
  };

  async function reloadAudits() {
    if (!id) return;
    const { data: log } = await supabase.from("audit_log")
      .select("id,created_at,action,user_id,details")
      .eq("entity", "trade_in").eq("entity_id", id)
      .order("created_at", { ascending: false });
    setAudits((log ?? []) as Audit[]);
  }

  const completeness = evaluateCompleteness(item);

  return (
    <TooltipProvider>
    <div>
      <PageHeader
        title={`Entrada · ${item.model || "—"}`}
        description="Detalhes da entrada de Compra & Troca com trilha de auditoria."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" onClick={() => navigate("/painel/troca")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 mr-1" /> Pré-visualizar PDF
            </Button>
            {item.product_id && (
              <Button variant="outline" onClick={() => navigate(`/painel/estoque/${item.product_id}`)}>
                <Package className="h-4 w-4 mr-1" /> Ver produto no estoque
              </Button>
            )}
            {simple === "desativado" && !isSold && (
              <Button onClick={activateToStock} disabled={saving} className="bg-success hover:bg-success/90 text-success-foreground">
                <PackagePlus className="h-4 w-4 mr-1" /> Dar entrada no estoque
              </Button>
            )}
            {isAwaitingRepair && (
              <Button onClick={openRepair} disabled={saving} className="bg-warning hover:bg-warning/90 text-warning-foreground">
                <Wrench className="h-4 w-4 mr-1" /> Registrar preparo
              </Button>
            )}
            {simple === "em_estoque" && (
              <Button variant="outline" onClick={() => { setReasonKey(""); setDeactivateOpen(true); }}>
                <PowerOff className="h-4 w-4 mr-1" /> Desativar
              </Button>
            )}
            <Button onClick={() => navigate(`/painel/troca/${id}`)}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
          </div>
        }
      />

      {!completeness.complete && (
        <Card className="p-3 mb-4 bg-warning/10 border-warning/40">
          <div className="flex items-start gap-2 text-xs">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-warning">Ficha incompleta (opcional)</div>
              <div className="text-muted-foreground mt-1">
                A entrada está válida, mas recomendamos completar:
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {completeness.missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate(`/painel/troca/${id}`)}>Completar ficha</Button>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{item.customer_name}</h3>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1">
                <Badge className={
                  simple === "em_estoque" ? "bg-success/15 text-success border-success/30" :
                  simple === "aguardando_preparo" ? "bg-warning/15 text-warning border-warning/30" :
                  "bg-muted text-muted-foreground border-border"
                }>
                  {simple === "em_estoque" ? <CheckCircle2 className="h-3 w-3 mr-1" /> :
                   simple === "aguardando_preparo" ? <Wrench className="h-3 w-3 mr-1" /> :
                   <CircleOff className="h-3 w-3 mr-1" />}
                  {simple === "em_estoque" ? "Em estoque" : simple === "aguardando_preparo" ? "Aguardando preparo" : "Desativado"}
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
                  <TooltipContent>{SIMPLE_STATUS_TOOLTIP[simple]}</TooltipContent>
                </Tooltip>
              </div>
              {reason && <span className="text-[10px] text-muted-foreground">{reason}</span>}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Aparelho:</span> {item.brand} {item.model} {item.storage_gb ? `· ${item.storage_gb}GB` : ""}</div>
            <div><span className="text-muted-foreground">IMEI:</span> <span className="font-mono">{item.imei || "—"}</span></div>
            <div><span className="text-muted-foreground">Condição:</span> {String(item.condition).replace("_", " ")}</div>
            <div><span className="text-muted-foreground">Sucata p/ peças:</span> {item.scrap_for_parts ? "sim" : "não"}</div>
            <div><span className="text-muted-foreground">Valor de entrada:</span> <span className="metric">{brl(Number(item.entry_value))}</span></div>
            <div><span className="text-muted-foreground">Custos de reparo:</span> <span className="metric">{brl(Number(item.repair_costs || 0))}</span></div>
            <div><span className="text-muted-foreground">Venda pretendida:</span> <span className="metric">{brl(Number(item.intended_sale_value))}</span></div>
            <div><span className="text-muted-foreground">Margem:</span> <span className="metric">{margin.toFixed(0)}%</span></div>
          </div>
          {item.notes && (
            <div className="text-sm pt-2 border-t border-border"><span className="text-muted-foreground">Observações:</span> {item.notes}</div>
          )}
        </Card>

        <Card className="p-5 bg-card border-border">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><History className="h-4 w-4" /> Linha do tempo</h3>
          {audits.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem alterações registradas ainda.</p>
          ) : (
            <ol className="relative border-l-2 border-border ml-1 space-y-4 pl-4">
              {audits.map((a) => {
                const d = a.details || {};
                const statusChange = d.status && typeof d.status === "object" ? d.status : null;
                const de = statusChange?.de as string | undefined;
                const para = statusChange?.para as string | undefined;
                const isStatus = a.action === "mudanca_status" && !!statusChange;
                const dotClass = isStatus
                  ? para === "em_estoque"
                    ? "bg-success"
                    : para === "aprovado"
                    ? "bg-warning"
                    : "bg-muted-foreground"
                  : "bg-primary";
                return (
                  <li key={a.id} className="text-xs relative">
                    <span
                      className={`absolute -left-[22px] top-1 h-3 w-3 rounded-full ring-2 ring-background ${dotClass}`}
                    />
                    <div className="flex justify-between gap-2 items-start">
                      <span className="font-medium">{actionLabel[a.action] ?? a.action}</span>
                      <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="text-muted-foreground">
                      por {a.user_id ? (people[a.user_id] ?? a.user_id.slice(0, 8)) : "sistema"}
                    </div>

                    {isStatus && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {de && (
                          <Badge variant="outline" className={STATUS_META[de]?.className}>
                            {STATUS_META[de]?.label ?? de}
                          </Badge>
                        )}
                        <span className="text-muted-foreground">→</span>
                        {para && (
                          <Badge variant="outline" className={STATUS_META[para]?.className}>
                            {STATUS_META[para]?.label ?? para}
                          </Badge>
                        )}
                      </div>
                    )}

                    {d.motivo && (
                      <div className="mt-1 text-muted-foreground">
                        <span className="font-medium">Motivo:</span> {String(d.motivo)}
                      </div>
                    )}
                    {d.notas_preparo && (
                      <div className="mt-1 text-muted-foreground italic">"{String(d.notas_preparo)}"</div>
                    )}
                    {(d.parts_cost !== undefined || d.manual_cost !== undefined) && (
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                        peças {brl(Number(d.parts_cost || 0))} · manual {brl(Number(d.manual_cost || 0))}
                        {d.total_cost !== undefined && <> · total <strong>{brl(Number(d.total_cost))}</strong></>}
                      </div>
                    )}
                    {Array.isArray(d.parts) && d.parts.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[11px] font-mono">
                        {d.parts.map((p: any, i: number) => (
                          <li key={i} className="text-muted-foreground">
                            • {p.name} × {p.qty} ({p.source === "estoque" ? "estoque" : "externa"})
                          </li>
                        ))}
                      </ul>
                    )}

                    {!isStatus && a.action !== "criacao" && d && typeof d === "object" && (
                      <ul className="mt-1 space-y-0.5">
                        {Object.entries(d)
                          .filter(([f]) => !["status", "motivo", "notas_preparo", "parts", "parts_cost", "manual_cost", "total_cost"].includes(f))
                          .map(([field, change]: [string, any]) => {
                            const dv = REASON_LABEL[change?.de as keyof typeof REASON_LABEL] ?? change?.de;
                            const pv = REASON_LABEL[change?.para as keyof typeof REASON_LABEL] ?? change?.para;
                            return (
                              <li key={field} className="font-mono">
                                <span className="text-muted-foreground">{field}:</span>{" "}
                                <span className="line-through opacity-60">{fmtVal(dv)}</span>{" → "}
                                <span>{fmtVal(pv)}</span>
                              </li>
                            );
                          })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar aparelho</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O aparelho sai do estoque ativo. Se houver produto vinculado ainda não vendido, ele será marcado como inativo (nunca excluído).
            </p>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={reasonKey} onValueChange={setReasonKey}>
                <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                <SelectContent>
                  {DEACTIVATE_REASONS.map((r) => (
                    <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeactivateOpen(false)}>Cancelar</Button>
            <Button onClick={confirmDeactivate} disabled={saving || !reasonKey}>
              {saving ? "Salvando…" : "Confirmar desativação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pré-visualização · Ficha de Compra & Troca</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-md border border-border overflow-hidden bg-white">
            {store && (
              <iframe
                title="preview-ficha"
                srcDoc={buildTradeInFichaHtml(item, store as any, { autoPrint: false })}
                className="w-full h-full"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Fechar</Button>
            <Button onClick={() => { setPreviewOpen(false); store && printTradeInFicha(item, store as any); }}>
              <FileDown className="h-4 w-4 mr-1" /> Emitir PDF / Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar preparo · consumo de peças</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              As peças escolhidas do estoque terão baixa automática. Se comprou peça fora do estoque, use "custo manual".
            </p>
            <div className="space-y-2">
              {rows.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhuma peça adicionada.</p>
              )}
              {rows.map((r, i) => {
                const inv = r.part_id ? invParts.find((p) => p.id === r.part_id) : null;
                const insufficient = inv && inv.stock_current < r.qty;
                return (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-end">
                    <div>
                      <Label className="text-[10px]">Peça</Label>
                      <Select
                        value={r.part_id ?? "__manual__"}
                        onValueChange={(v) => {
                          if (v === "__manual__") {
                            updateRow(i, { part_id: null });
                          } else {
                            const p = invParts.find((x) => x.id === v);
                            updateRow(i, { part_id: v, name: p?.name || "", unit_cost: Number(p?.cost_price || 0) });
                          }
                        }}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar peça" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__manual__">— Peça externa (livre) —</SelectItem>
                          {invParts.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} · estoque {p.stock_current}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!r.part_id && (
                        <Input
                          className="h-8 mt-1 text-xs"
                          placeholder="Nome da peça"
                          value={r.name}
                          onChange={(e) => updateRow(i, { name: e.target.value })}
                        />
                      )}
                      {insufficient && (
                        <div className="text-[10px] text-danger mt-1">Estoque insuficiente ({inv?.stock_current} disponível)</div>
                      )}
                    </div>
                    <div>
                      <Label className="text-[10px]">Qtd</Label>
                      <NumberInput allowDecimal={false} min={1} value={r.qty} onValueChange={(n) => updateRow(i, { qty: n })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Custo un.</Label>
                      <NumberInput value={r.unit_cost} onValueChange={(n) => updateRow(i, { unit_cost: n })} />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeRow(i)}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                );
              })}
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar peça
              </Button>
            </div>

            <div className="border-t border-border pt-3 space-y-2">
              <Label className="text-xs">Custo manual adicional (peça externa, mão-de-obra terceirizada, etc.)</Label>
              <NumberInput value={manualCost} onValueChange={setManualCost} />
              <Label className="text-xs">Notas do preparo (opcional)</Label>
              <Input value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} placeholder="Ex.: troca de tela + polimento" />
            </div>

            <div className="rounded-md bg-muted/40 p-2 text-xs flex justify-between">
              <span>Custo em peças: <strong>{brl(partsCost)}</strong> · Manual: <strong>{brl(Number(manualCost) || 0)}</strong></span>
              <span>Total do reparo: <strong className="text-primary">{brl(totalCost)}</strong></span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRepairOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => setRepairPreviewOpen(true)}
              disabled={saving || (rows.length === 0 && (Number(manualCost) || 0) === 0)}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              Revisar e concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={repairPreviewOpen} onOpenChange={setRepairPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar preparo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {missingParts.length > 0 ? (
              <div className="rounded-md border border-danger/40 bg-danger/10 p-3 space-y-1">
                <div className="flex items-center gap-2 font-medium text-danger">
                  <AlertTriangle className="h-4 w-4" /> Estoque insuficiente
                </div>
                <ul className="text-xs text-danger/90 list-disc list-inside">
                  {missingParts.map((m, i) => (
                    <li key={i}>
                      <strong>{m.name}</strong> — precisa {m.need}, disponível {m.available} (faltam {m.need - m.available})
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-md border border-success/40 bg-success/10 p-3 text-success text-xs">
                Estoque disponível para todas as peças selecionadas.
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Peças do estoque</div>
              {rows.filter((r) => r.part_id).length === 0 ? (
                <div className="text-xs text-muted-foreground italic">Nenhuma peça do estoque será consumida.</div>
              ) : (
                <ul className="text-xs space-y-0.5">
                  {rows.filter((r) => r.part_id).map((r, i) => (
                    <li key={i} className="flex justify-between font-mono">
                      <span>{r.name} × {r.qty}</span>
                      <span>{brl(r.qty * r.unit_cost)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {externalParts.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Peças externas</div>
                <ul className="text-xs space-y-0.5">
                  {externalParts.map((r, i) => (
                    <li key={i} className="flex justify-between font-mono">
                      <span>{r.name || "—"} × {r.qty}</span>
                      <span>{brl(r.qty * r.unit_cost)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-border pt-2 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Custo peças</span><span className="font-mono">{brl(partsCost)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Custo manual</span><span className="font-mono">{brl(Number(manualCost) || 0)}</span></div>
              <div className="flex justify-between text-base pt-1 border-t border-border">
                <span className="font-medium">Total estimado</span>
                <span className="font-mono text-primary font-semibold">{brl(totalCost)}</span>
              </div>
            </div>

            {manualNotes && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Notas:</span> {manualNotes}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRepairPreviewOpen(false)}>Voltar</Button>
            <Button
              onClick={submitRepair}
              disabled={saving || missingParts.length > 0}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {saving ? "Salvando…" : "Confirmar e enviar ao estoque"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
