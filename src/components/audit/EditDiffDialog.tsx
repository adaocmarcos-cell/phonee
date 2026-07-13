import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { brl, num } from "@/lib/format";
import { buildDiff, type DiffKind } from "./editDiff";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  details: any;
  unitLabel?: string; // "Custo unit." (compras) | "Preço unit." (vendas)
};

const kindStyle: Record<DiffKind, string> = {
  added: "bg-success/10 text-success border-success/30",
  removed: "bg-danger/10 text-danger border-danger/30",
  changed: "bg-warning/10 text-warning border-warning/30",
  unchanged: "bg-muted text-muted-foreground border-border",
};
const kindLabel: Record<DiffKind, string> = {
  added: "Adicionado",
  removed: "Removido",
  changed: "Alterado",
  unchanged: "Sem alteração",
};

function DeltaBadge({ n, fmt = "brl" }: { n: number; fmt?: "brl" | "num" }) {
  if (!n) return <span className="text-muted-foreground text-xs">—</span>;
  const positive = n > 0;
  const text = fmt === "brl" ? brl(Math.abs(n)) : num(Math.abs(n));
  return (
    <span className={`text-xs font-mono font-semibold ${positive ? "text-success" : "text-danger"}`}>
      {positive ? "+" : "−"}{text}
    </span>
  );
}

export function EditDiffDialog({ open, onOpenChange, title = "Comparativo da edição", details, unitLabel = "Unit." }: Props) {
  const diff = buildDiff(details);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Comparação item a item entre <strong>antes</strong> e <strong>depois</strong> da edição.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(["added", "changed", "removed", "unchanged"] as DiffKind[]).map((k) => (
            <Badge key={k} className={kindStyle[k]}>
              {kindLabel[k]}: {diff.counts[k]}
            </Badge>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated/40 p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] font-mono uppercase text-muted-foreground">Total antes</div>
            <div className="text-lg font-semibold metric">{brl(diff.totalBefore)}</div>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase text-muted-foreground">Total depois</div>
            <div className="text-lg font-semibold metric">{brl(diff.totalAfter)}</div>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase text-muted-foreground">Diferença</div>
            <div className="text-lg font-semibold"><DeltaBadge n={diff.totalDelta} /></div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-wider font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Item</th>
                <th className="text-right px-3 py-2 font-medium">Qtd. antes</th>
                <th className="text-right px-3 py-2 font-medium">Qtd. depois</th>
                <th className="text-right px-3 py-2 font-medium">Δ Qtd.</th>
                <th className="text-right px-3 py-2 font-medium">{unitLabel} antes</th>
                <th className="text-right px-3 py-2 font-medium">{unitLabel} depois</th>
                <th className="text-right px-3 py-2 font-medium">Total antes</th>
                <th className="text-right px-3 py-2 font-medium">Total depois</th>
                <th className="text-right px-3 py-2 font-medium">Δ Total</th>
                <th className="text-left px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {diff.items.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground text-xs">Sem itens no snapshot.</td></tr>
              )}
              {diff.items.map((it) => (
                <tr key={it.key} className="hover:bg-surface-elevated/30">
                  <td className="px-3 py-2">
                    <div className="font-medium">{it.name}</div>
                    {it.is_service && <div className="text-[10px] font-mono uppercase text-muted-foreground">Serviço</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{it.before ? num(it.before.quantity) : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{it.after ? num(it.after.quantity) : "—"}</td>
                  <td className="px-3 py-2 text-right"><DeltaBadge n={it.qtyDelta} fmt="num" /></td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{it.before ? brl(it.before.unit) : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {it.after ? (
                      <span className="inline-flex items-center gap-1">
                        {it.before && it.before.unit !== it.after.unit && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                        {brl(it.after.unit)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{it.before ? brl(it.before.total) : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{it.after ? brl(it.after.total) : "—"}</td>
                  <td className="px-3 py-2 text-right"><DeltaBadge n={it.totalDelta} /></td>
                  <td className="px-3 py-2">
                    <Badge className={`${kindStyle[it.kind]} text-[10px]`}>{kindLabel[it.kind]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EditDiffDialog;