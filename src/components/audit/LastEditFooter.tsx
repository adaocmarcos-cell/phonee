import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { EditDiffDialog } from "./EditDiffDialog";

type Props = {
  entity: "purchase_order" | "sale";
  entityId: string | null | undefined;
  unitLabel?: string;
  className?: string;
};

type Row = { id: string; created_at: string; user_id: string | null; details: any };

export function LastEditFooter({ entity, entityId, unitLabel, className = "" }: Props) {
  const [row, setRow] = useState<Row | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!entityId) { setRow(null); return; }
    (async () => {
      const { data } = await (supabase.from("audit_log") as any)
        .select("id, created_at, user_id, details")
        .eq("entity", entity)
        .eq("entity_id", entityId)
        .eq("action", "edicao")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      setRow((data as Row | null) ?? null);
      if (data?.user_id) {
        const { data: p } = await supabase
          .from("profiles").select("full_name, email").eq("id", data.user_id).maybeSingle();
        if (!alive) return;
        setUserName((p as any)?.full_name || (p as any)?.email || "usuário");
      } else {
        setUserName("Sistema");
      }
    })();
    return () => { alive = false; };
  }, [entity, entityId]);

  if (!row) return null;
  const when = new Date(row.created_at).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground ${className}`}
      data-testid="last-edit-footer"
    >
      <History className="h-3.5 w-3.5 text-warning shrink-0" />
      <span className="flex-1">
        Editado por <strong className="text-foreground">{userName}</strong> em{" "}
        <span className="font-mono">{when}</span>
      </span>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setOpen(true)}>
        Ver comparativo
      </Button>
      <EditDiffDialog
        open={open}
        onOpenChange={setOpen}
        title={entity === "sale" ? "Comparativo da edição — Venda" : "Comparativo da edição — Compra"}
        unitLabel={unitLabel ?? (entity === "sale" ? "Preço unit." : "Custo unit.")}
        details={row.details}
      />
    </div>
  );
}

export default LastEditFooter;