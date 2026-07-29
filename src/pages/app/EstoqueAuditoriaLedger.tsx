import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { handleSupabaseError } from "@/lib/supabaseFetch";
import { brl } from "@/lib/format";
import { AlertTriangle, RefreshCw, ShieldCheck, ExternalLink } from "lucide-react";

type Gap = {
  kind: string;
  movement_type: string;
  origin_table: string;
  origin_id: string;
  doc_label: string | null;
  occurred_at: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  unit_cost: number | null;
};

type Guard = { function_name: string; stock_updates: number; origin_tags: number; ok: boolean };

const KIND_LABEL: Record<string, string> = {
  venda: "Vendas",
  devolucao: "Devoluções",
  uso_os: "Peças de OS",
  transferencia_out: "Transferências (saída)",
  transferencia_in: "Transferências (entrada)",
};

function docLink(g: Gap): string | null {
  switch (g.kind) {
    case "venda": return `/painel/vendas/${g.origin_id}/editar`;
    case "devolucao": return `/painel/vendas`;
    case "uso_os": return `/painel/ordens/${g.origin_id}`;
    default: return `/painel/estoque/transferencia`;
  }
}

export default function EstoqueAuditoriaLedger() {
  const { store, role } = useAuth();
  const [rows, setRows] = useState<Gap[]>([]);
  const [guard, setGuard] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("todos");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<{ kind: string; registros: number; unidades: number }[]>([]);
  const [busy, setBusy] = useState(false);

  const isOwner = role === "dono";

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const [g, q] = await Promise.all([
      (supabase as any).rpc("stock_ledger_gaps", { _store_id: store.id }),
      (supabase as any).rpc("stock_origin_guardrail"),
    ]);
    setLoading(false);
    if (g.error) handleSupabaseError(g.error, "Erro ao carregar auditoria do estoque");
    else setRows((g.data ?? []) as Gap[]);
    if (!q.error) setGuard((q.data ?? []) as Guard[]);
  }, [store]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const m: Record<string, { registros: number; unidades: number }> = {};
    rows.forEach((r) => {
      const e = (m[r.kind] ??= { registros: 0, unidades: 0 });
      e.registros += 1;
      e.unidades += Math.abs(Number(r.quantity) || 0);
    });
    return m;
  }, [rows]);

  const filtered = useMemo(
    () => (kind === "todos" ? rows : rows.filter((r) => r.kind === kind)).slice(0, 500),
    [rows, kind],
  );

  const guardFails = guard.filter((g) => !g.ok);

  const openPreview = async () => {
    if (!store) return;
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("stock_ledger_backfill", {
      _store_id: store.id,
      _kinds: kind === "todos" ? null : [kind],
      _apply: false,
    });
    setBusy(false);
    if (error) return handleSupabaseError(error, "Erro ao gerar prévia");
    setPreview((data?.preview ?? []) as any[]);
    setConfirmOpen(true);
  };

  const applyBackfill = async () => {
    if (!store) return;
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("stock_ledger_backfill", {
      _store_id: store.id,
      _kinds: kind === "todos" ? null : [kind],
      _apply: true,
    });
    setBusy(false);
    if (error) return handleSupabaseError(error, "Erro ao inserir movimentos");
    setConfirmOpen(false);
    toast.success(`${data?.inseridos ?? 0} movimento(s) histórico(s) inserido(s). O saldo dos produtos não foi alterado.`);
    load();
  };

  const totalPreview = preview.reduce((s, p) => s + Number(p.registros || 0), 0);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Auditoria do histórico de estoque"
        description="Documentos que movimentaram estoque mas não têm movimento correspondente no livro-razão"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" />Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {Object.keys(KIND_LABEL).map((k) => (
          <Card key={k} className="p-3">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{KIND_LABEL[k]}</div>
            <div className="text-2xl metric font-semibold">{counts[k]?.registros ?? 0}</div>
            <div className="text-xs text-muted-foreground">{counts[k]?.unidades ?? 0} unidade(s)</div>
          </Card>
        ))}
      </div>

      <Card className={`p-3 mb-4 flex items-start gap-2 text-sm ${guardFails.length ? "border-danger/40 bg-danger/5" : ""}`}>
        {guardFails.length ? <AlertTriangle className="h-4 w-4 text-danger mt-0.5" /> : <ShieldCheck className="h-4 w-4 text-success mt-0.5" />}
        <div>
          <div className="font-medium">
            {guardFails.length
              ? "Rotinas alterando estoque sem declarar a origem"
              : "Todas as rotinas de estoque declaram a origem do movimento"}
          </div>
          <div className="text-xs text-muted-foreground">
            {guardFails.length
              ? guardFails.map((g) => `${g.function_name} (${g.origin_tags}/${g.stock_updates})`).join(" · ")
              : `${guard.length} rotina(s) verificada(s) — toda baixa/entrada nasce com origem consistente no livro-razão.`}
          </div>
        </div>
      </Card>

      <Card className="p-3 mb-4 flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.keys(KIND_LABEL).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!isOwner || busy || !rows.length} onClick={openPreview}>
          Inserir movimentos ausentes…
        </Button>
        <span className="text-xs text-muted-foreground">
          Só grava o histórico faltante — o saldo atual dos produtos não é alterado.
          {!isOwner && " Apenas o dono da loja pode executar."}
        </span>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Custo un.</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>}
            {!loading && !filtered.length && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum documento sem movimento. 🎉</TableCell></TableRow>
            )}
            {filtered.map((r, i) => (
              <TableRow key={`${r.kind}-${r.origin_id}-${r.product_id}-${i}`}>
                <TableCell><Badge variant="secondary">{KIND_LABEL[r.kind] ?? r.kind}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{r.doc_label ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{new Date(r.occurred_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="max-w-[260px] truncate">{r.product_name ?? "—"}</TableCell>
                <TableCell className={`text-right font-mono ${Number(r.quantity) < 0 ? "text-danger" : "text-success"}`}>
                  {Number(r.quantity) > 0 ? "+" : ""}{Number(r.quantity)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{r.unit_cost ? brl(Number(r.unit_cost)) : "—"}</TableCell>
                <TableCell>
                  {docLink(r) && (
                    <Button asChild size="icon" variant="ghost">
                      <Link to={docLink(r)!}><ExternalLink className="h-4 w-4" /></Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inserir movimentos ausentes</DialogTitle>
            <DialogDescription>
              Serão gravados apenas registros históricos no livro-razão. O saldo em estoque dos produtos
              permanece exatamente como está — nada é somado nem subtraído.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {preview.length === 0 && <p className="text-muted-foreground">Nada a inserir.</p>}
            {preview.map((p) => (
              <div key={p.kind} className="flex justify-between border-b border-border/60 pb-1">
                <span>{KIND_LABEL[p.kind] ?? p.kind}</span>
                <span className="font-mono">{p.registros} registro(s) · {p.unidades} un.</span>
              </div>
            ))}
            {preview.length > 0 && (
              <div className="flex justify-between font-semibold pt-1">
                <span>Total</span><span className="font-mono">{totalPreview}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={applyBackfill} disabled={busy || !totalPreview}>
              {busy ? "Inserindo…" : `Confirmar e inserir ${totalPreview}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}