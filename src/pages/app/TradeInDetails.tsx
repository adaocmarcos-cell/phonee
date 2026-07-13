import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, History, Package, CheckCircle2, CircleOff, HelpCircle, FileDown, PackagePlus, PowerOff } from "lucide-react";
import { brl } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toSimpleStatus, reasonSubtext, SIMPLE_STATUS_TOOLTIP, DEACTIVATE_REASONS, REASON_LABEL } from "@/lib/tradeInStatus";
import { printTradeInFicha } from "@/lib/tradeInPrint";
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

  const activateToStock = async () => {
    if (!item) return;
    setSaving(true);
    const { error } = await supabase
      .from("trade_ins")
      .update({ status: "em_estoque" })
      .eq("id", item.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Aparelho enviado ao estoque.");
    setItem({ ...item, status: "em_estoque" });
  };

  const confirmDeactivate = async () => {
    const opt = DEACTIVATE_REASONS.find((r) => r.key === reasonKey);
    if (!opt) return toast.error("Selecione um motivo.");
    setSaving(true);
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
    setSaving(false);
    setDeactivateOpen(false);
    toast.success(`Aparelho desativado: ${opt.label}`);
    setItem({ ...item, ...patch });
  };

  return (
    <TooltipProvider>
    <div>
      <PageHeader
        title={`Entrada · ${item.model || "—"}`}
        description="Detalhes da entrada de Compra & Troca com trilha de auditoria."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" onClick={() => navigate("/painel/troca")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <Button variant="outline" onClick={() => store && printTradeInFicha(item, store as any)}>
              <FileDown className="h-4 w-4 mr-1" /> Emitir PDF
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
            {simple === "em_estoque" && (
              <Button variant="outline" onClick={() => { setReasonKey(""); setDeactivateOpen(true); }}>
                <PowerOff className="h-4 w-4 mr-1" /> Desativar
              </Button>
            )}
            <Button onClick={() => navigate(`/painel/troca/${id}`)}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{item.customer_name}</h3>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1">
                <Badge className={simple === "em_estoque"
                  ? "bg-success/15 text-success border-success/30"
                  : "bg-muted text-muted-foreground border-border"}>
                  {simple === "em_estoque"
                    ? <CheckCircle2 className="h-3 w-3 mr-1" />
                    : <CircleOff className="h-3 w-3 mr-1" />}
                  {simple === "em_estoque" ? "Em estoque" : "Desativado"}
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
          <h3 className="font-semibold mb-3 flex items-center gap-2"><History className="h-4 w-4" /> Trilha de auditoria</h3>
          {audits.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem alterações registradas ainda.</p>
          ) : (
            <ol className="space-y-3">
              {audits.map((a) => (
                <li key={a.id} className="text-xs border-l-2 border-border pl-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{actionLabel[a.action] ?? a.action}</span>
                    <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="text-muted-foreground">por {a.user_id ? (people[a.user_id] ?? a.user_id.slice(0, 8)) : "sistema"}</div>
                  {a.action !== "criacao" && a.details && typeof a.details === "object" && (
                    <ul className="mt-1 space-y-0.5">
                      {Object.entries(a.details).map(([field, change]: [string, any]) => (
                        <li key={field} className="font-mono">
                          <span className="text-muted-foreground">{field}:</span>{" "}
                          <span className="line-through opacity-60">{fmtVal(change?.de)}</span>{" → "}
                          <span>{fmtVal(change?.para)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
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
    </div>
    </TooltipProvider>
  );
}