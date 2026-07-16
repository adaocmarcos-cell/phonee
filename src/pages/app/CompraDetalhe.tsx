import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canManageProducts } from "@/contexts/AuthContext";
import { useHasPermission } from "@/hooks/useHasPermission";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Pencil, Trash2, ShoppingCart } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { LastEditFooter } from "@/components/audit/LastEditFooter";

type Order = {
  id: string;
  store_id: string;
  supplier: string | null;
  status: "rascunho" | "enviado" | "recebido" | "parcial" | "cancelado";
  total_cost: number;
  notes: string | null;
  payment_method: string | null;
  payment_status: string | null;
  expected_delivery_at: string | null;
  received_at: string | null;
  due_date: string | null;
  created_at: string;
  tags: string[] | null;
};

type Item = {
  id: string;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_cost: number;
};

const STATUS_LABEL: Record<Order["status"], string> = {
  rascunho: "Rascunho", enviado: "Enviado", recebido: "Recebido", parcial: "Parcial", cancelado: "Cancelado",
};
const STATUS_COLOR: Record<Order["status"], string> = {
  rascunho: "bg-muted text-muted-foreground border-border",
  enviado: "bg-primary/15 text-primary border-primary/30",
  recebido: "bg-success/15 text-success border-success/30",
  parcial: "bg-warning/15 text-warning border-warning/30",
  cancelado: "bg-danger/15 text-danger border-danger/30",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(+dt) ? "—" : dt.toLocaleDateString("pt-BR");
}
function fmtDateTime(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(+dt) ? "—" : dt.toLocaleString("pt-BR");
}

export default function CompraDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canEdit = canManageProducts(role);
  const { allowed: canDelete } = useHasPermission("compras", "excluir");

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setItemsError(null);
    const [{ data: o, error: oErr }, { data: its, error: itsErr }] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("purchase_order_items")
        .select("id, product_name, sku, quantity, unit_cost")
        .eq("order_id", id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    ]);
    if (oErr || !o) {
      setOrder(null);
      setItems([]);
      setNotFound(true);
      setLoading(false);
      return;
    }
    setOrder(o as Order);
    if (itsErr) {
      setItems([]);
      setItemsError(itsErr.message);
      toast.error(`Erro ao carregar itens: ${itsErr.message}`);
      setLoading(false);
      return;
    }
    setItems(
      ((its ?? []) as any[]).map((r) => ({
        id: r.id,
        product_name: r.product_name,
        sku: r.sku,
        quantity: Number(r.quantity || 0),
        unit_cost: Number(r.unit_cost || 0),
      })),
    );
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const itemsTotal = useMemo(
    () => items.reduce((s, it) => s + it.quantity * it.unit_cost, 0),
    [items],
  );
  const totalMismatch = order ? Math.abs(itemsTotal - Number(order.total_cost || 0)) > 0.01 : false;

  const goEdit = () => {
    if (!order) return;
    navigate(`/painel/compras?edit=${order.id}`);
  };

  const doDelete = async () => {
    if (!order) return;
    if (!confirm("Excluir esta compra? Essa ação é registrada em auditoria.")) return;
    setDeleting(true);
    const { error } = await supabase.from("purchase_orders").delete().eq("id", order.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Compra excluída.");
    navigate("/painel/compras");
  };

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Compra"
          description="Carregando detalhes…"
          actions={<Button variant="outline" onClick={() => navigate("/painel/compras")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>}
        />
        <Card className="p-6 space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-32 w-full" />
        </Card>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div>
        <PageHeader
          title="Compra não encontrada"
          description="O pedido de compra solicitado não existe ou você não tem acesso."
          actions={<Button variant="outline" onClick={() => navigate("/painel/compras")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>}
        />
        <Card className="p-10 text-center">
          <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Nenhum registro corresponde a este identificador.</p>
          <Button onClick={() => navigate("/painel/compras")}>Voltar para Compras</Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={order.supplier ? `Compra · ${order.supplier}` : "Compra"}
        description={`Registrada em ${fmtDateTime(order.created_at)}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/painel/compras")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            {canEdit && (
              <Button onClick={goEdit} className="bg-gradient-primary">
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
            )}
            {canEdit && canDelete && (
              <Button variant="outline" onClick={doDelete} disabled={deleting} className="text-danger hover:text-danger">
                <Trash2 className="h-4 w-4 mr-1" /> {deleting ? "Excluindo…" : "Excluir"}
              </Button>
            )}
          </div>
        }
      />

      <Card className="p-4 mb-4 bg-card border-border">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Fornecedor" value={order.supplier ?? "—"} />
          <Field label="Status" value={<Badge variant="outline" className={STATUS_COLOR[order.status]}>{STATUS_LABEL[order.status]}</Badge>} />
          <Field label="Pagamento" value={order.payment_method ?? "—"} />
          <Field label="Status do pagamento" value={order.payment_status ?? "—"} />
          <Field label="Previsão de entrega" value={fmtDate(order.expected_delivery_at)} />
          <Field label="Vencimento" value={fmtDate(order.due_date)} />
          <Field label="Recebido em" value={fmtDate(order.received_at)} />
          <Field label="Total" value={<span className="font-mono font-semibold">{brl(Number(order.total_cost || 0))}</span>} />
        </div>
        {order.tags && order.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {order.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[11px]">{t}</Badge>
            ))}
          </div>
        )}
        {order.notes && (
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono mb-1">Observações</div>
            <div className="text-sm whitespace-pre-wrap">{order.notes}</div>
          </div>
        )}
      </Card>

      <Card className="bg-card border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-medium">Itens ({items.length})</div>
          <div className="text-xs font-mono">
            Subtotal itens: <span className="font-semibold">{brl(itemsTotal)}</span>
            {totalMismatch && (
              <span className="ml-2 text-warning">· divergência de {brl(itemsTotal - Number(order.total_cost || 0))}</span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Produto</th>
                <th className="text-left px-4 py-3 font-medium">SKU</th>
                <th className="text-right px-4 py-3 font-medium">Qtd</th>
                <th className="text-right px-4 py-3 font-medium">Custo unitário</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {itemsError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs">
                    <div className="text-danger font-mono mb-2">FALHA AO CARREGAR ITENS</div>
                    <div className="text-muted-foreground mb-3">{itemsError}</div>
                    <Button size="sm" variant="outline" onClick={load}>Tentar novamente</Button>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs font-mono">SEM ITENS</td></tr>
              ) : items.map((it) => (
                <tr key={it.id} className="hover:bg-surface-elevated/40">
                  <td className="px-4 py-3">{it.product_name}</td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground font-mono">{it.sku ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{it.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">{brl(it.unit_cost)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{brl(it.quantity * it.unit_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4">
        <LastEditFooter entity="purchase_order" entityId={order.id} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono mb-1">{label}</div>
      <div>{value}</div>
    </div>
  );
}