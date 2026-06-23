import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, ClipboardEdit, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Adj = {
  id: string;
  created_at: string;
  item_kind: "product" | "part";
  item_name: string;
  qty_change: number;
  prev_stock: number;
  new_stock: number;
  reason: string;
  justification: string | null;
  user_id: string | null;
  approval_status: "pendente" | "aprovado" | "rejeitado";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

const REASON_LABEL: Record<string, string> = {
  perda: "Perda",
  brinde: "Brinde",
  uso_interno: "Uso interno",
  correcao: "Correção",
  entrada_manual: "Entrada manual",
  outros: "Outros",
};

export default function AjustesEstoque() {
  const { store, user } = useAuth();
  const [rows, setRows] = useState<Adj[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reviewTarget, setReviewTarget] = useState<{ adj: Adj; decision: "aprovado" | "rejeitado" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [filter, setFilter] = useState<"all" | "pendente" | "aprovado" | "rejeitado">("pendente");

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data } = await supabase
      .from("stock_adjustments")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Adj[];
    const ids = Array.from(new Set([
      ...list.map((r) => r.user_id),
      ...list.map((r) => r.reviewed_by),
    ].filter(Boolean) as string[]));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const m: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { m[p.id] = p.full_name || p.email || "—"; });
      setProfiles(m);
    }
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  const visible = useMemo(() => filter === "all" ? rows : rows.filter((r) => r.approval_status === filter), [rows, filter]);
  const pendingCount = rows.filter((r) => r.approval_status === "pendente").length;

  const decide = async () => {
    if (!reviewTarget || !user) return;
    const { adj, decision } = reviewTarget;

    // If rejecting, revert stock change
    if (decision === "rejeitado") {
      const table = adj.item_kind === "product" ? "products" : "parts_inventory";
      const targetId = adj.item_kind === "product"
        ? (await supabase.from("stock_adjustments").select("product_id").eq("id", adj.id).single()).data?.product_id
        : (await supabase.from("stock_adjustments").select("part_id").eq("id", adj.id).single()).data?.part_id;
      if (targetId) {
        const { data: cur } = await supabase.from(table).select("stock_current").eq("id", targetId).maybeSingle();
        if (cur) {
          await supabase.from(table).update({ stock_current: (cur as any).stock_current - adj.qty_change }).eq("id", targetId);
        }
      }
    }

    const { error } = await supabase
      .from("stock_adjustments")
      .update({
        approval_status: decision,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote.trim() || null,
      })
      .eq("id", adj.id);
    if (error) { toast.error(error.message); return; }

    await supabase.from("audit_log").insert({
      store_id: store!.id,
      user_id: user.id,
      module: "estoque",
      action: decision === "aprovado" ? "ajuste_aprovado" : "ajuste_rejeitado",
      entity: "stock_adjustment",
      entity_id: adj.id,
      details: { item_name: adj.item_name, qty_change: adj.qty_change, note: reviewNote.trim() || null },
      status: decision,
    });

    toast.success(decision === "aprovado" ? "Ajuste aprovado" : "Ajuste rejeitado · estoque revertido");
    setReviewTarget(null);
    setReviewNote("");
    load();
  };

  const statusBadge = (s: Adj["approval_status"]) => {
    if (s === "pendente") return <Badge className="bg-warning/15 text-warning border-warning/30"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    if (s === "aprovado") return <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="h-3 w-3 mr-1" />Aprovado</Badge>;
    return <Badge className="bg-danger/15 text-danger border-danger/30"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
  };

  return (
    <div>
      <PageHeader
        title="Ajustes de Estoque"
        description={`Aprovação e auditoria de ajustes manuais · ${pendingCount} pendente(s)`}
        actions={<Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>}
      />

      <div className="flex gap-1 p-1 bg-card border border-border rounded-md w-fit mb-4">
        {(["pendente", "aprovado", "rejeitado", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} onClick={() => setFilter(f)} className={filter === f ? "bg-primary text-primary-foreground" : ""}>
            {f === "all" ? "Todos" : f === "pendente" ? `Pendentes${pendingCount ? ` (${pendingCount})` : ""}` : f === "aprovado" ? "Aprovados" : "Rejeitados"}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          <Card className="p-12 text-center text-xs font-mono text-muted-foreground">CARREGANDO…</Card>
        ) : visible.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            <ClipboardEdit className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            Nenhum ajuste {filter !== "all" ? filter : ""}.
          </Card>
        ) : visible.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="font-semibold">{r.item_name}</h4>
                  <Badge variant="outline" className="border-border text-[10px]">{r.item_kind === "product" ? "Produto" : "Peça"}</Badge>
                  <Badge variant="outline" className="border-border text-[10px]">{REASON_LABEL[r.reason] ?? r.reason}</Badge>
                  {statusBadge(r.approval_status)}
                </div>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 mb-2">
                  <span>Estoque: <span className="font-mono text-foreground">{r.prev_stock}</span> → <span className="font-mono text-foreground">{r.new_stock}</span></span>
                  <span className={r.qty_change >= 0 ? "text-success font-mono" : "text-danger font-mono"}>
                    {r.qty_change >= 0 ? `+${r.qty_change}` : r.qty_change}
                  </span>
                </div>
                {r.justification && (
                  <div className="text-sm bg-surface-elevated/50 border border-border rounded p-2 mb-2">
                    <span className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Justificativa: </span>
                    {r.justification}
                  </div>
                )}
                {/* Timeline */}
                <div className="text-xs text-muted-foreground space-y-1 mt-2 border-l-2 border-border pl-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-mono">Criado</span> · {new Date(r.created_at).toLocaleString("pt-BR")} por <span className="text-foreground">{r.user_id ? profiles[r.user_id] ?? "—" : "—"}</span>
                  </div>
                  {r.reviewed_at && (
                    <div>
                      <span className="text-[10px] uppercase tracking-widest font-mono">{r.approval_status === "aprovado" ? "Aprovado" : "Rejeitado"}</span> · {new Date(r.reviewed_at).toLocaleString("pt-BR")} por <span className="text-foreground">{r.reviewed_by ? profiles[r.reviewed_by] ?? "—" : "—"}</span>
                      {r.review_note && <div className="text-muted-foreground italic">"{r.review_note}"</div>}
                    </div>
                  )}
                </div>
              </div>
              {r.approval_status === "pendente" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setReviewTarget({ adj: r, decision: "rejeitado" }); setReviewNote(""); }}>
                    <XCircle className="h-4 w-4 mr-1 text-danger" /> Rejeitar
                  </Button>
                  <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => { setReviewTarget({ adj: r, decision: "aprovado" }); setReviewNote(""); }}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewTarget?.decision === "aprovado" ? "Aprovar ajuste" : "Rejeitar ajuste"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {reviewTarget?.decision === "rejeitado"
              ? "Ao rejeitar, o estoque será revertido ao valor anterior. Adicione uma nota explicando o motivo."
              : "Confirme a aprovação. Você pode adicionar uma nota opcional."}
          </p>
          <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} placeholder="Nota (opcional)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancelar</Button>
            <Button
              onClick={decide}
              className={reviewTarget?.decision === "aprovado" ? "bg-success hover:bg-success/90 text-success-foreground" : "bg-danger hover:bg-danger/90 text-danger-foreground"}
            >
              Confirmar {reviewTarget?.decision === "aprovado" ? "aprovação" : "rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}