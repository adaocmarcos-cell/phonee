import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Save, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  WHATSAPP_EVENTS, WHATSAPP_VARIABLES, WhatsappEventKey,
  renderWhatsappTemplate,
} from "@/lib/whatsappTemplates";

type Row = {
  id: string;
  store_id: string;
  event_key: WhatsappEventKey;
  title: string;
  body: string;
  is_active: boolean;
};

const PREVIEW_VARS = {
  cliente: "João da Silva",
  loja: "Sua Loja",
  os_numero: "0128",
  aparelho: "iPhone 12 Pro 128GB",
  valor: "R$ 480,00",
  prazo: "3 dias úteis",
  garantia_ate: "17/01/2027",
  link_acompanhamento: "phonee.com.br/os/0128",
};

export function WhatsappTemplatesSettings() {
  const { store, role } = useAuth();
  const canEdit = role === "dono" || role === "gerente";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [previewKey, setPreviewKey] = useState<WhatsappEventKey | null>(null);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("whatsapp_templates")
      .select("id,store_id,event_key,title,body,is_active")
      .eq("store_id", store.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data || []) as Row[]);
    setDirty({});
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store?.id]);

  const byKey = useMemo(() => {
    const m: Record<string, Row> = {};
    rows.forEach((r) => { m[r.event_key] = r; });
    return m;
  }, [rows]);

  const patch = (key: WhatsappEventKey, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => r.event_key === key ? { ...r, ...patch } : r));
    setDirty((d) => ({ ...d, [key]: true }));
  };

  const save = async (key: WhatsappEventKey) => {
    const r = byKey[key];
    if (!r) return;
    setSaving(key);
    const { error } = await (supabase as any)
      .from("whatsapp_templates")
      .update({ title: r.title, body: r.body, is_active: r.is_active })
      .eq("id", r.id);
    setSaving(null);
    if (error) return toast.error(error.message);
    setDirty((d) => { const n = { ...d }; delete n[key]; return n; });
    toast.success("Template salvo");
  };

  const restoreDefaults = async () => {
    if (!store) return;
    if (!confirm("Excluir os templates atuais e recriar os padrões? Suas edições serão perdidas.")) return;
    setLoading(true);
    await (supabase as any).from("whatsapp_templates").delete().eq("store_id", store.id);
    await (supabase as any).rpc("seed_whatsapp_templates_for_store", { _store_id: store.id });
    await load();
    toast.success("Templates padrão restaurados.");
  };

  const preview = previewKey ? byKey[previewKey] : null;
  const previewText = preview ? renderWhatsappTemplate(preview.body, PREVIEW_VARS) : "";

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <MessageCircle className="h-5 w-5 text-success mt-0.5" />
          <div>
            <h3 className="font-semibold">Mensagens WhatsApp</h3>
            <p className="text-xs text-muted-foreground">
              Edite os modelos enviados a partir das telas de OS e vendas. Cada mensagem é aberta em nova aba
              com o texto pré-preenchido — nada é enviado automaticamente.
            </p>
          </div>
        </div>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={restoreDefaults} disabled={loading}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Restaurar padrão
          </Button>
        )}
      </div>

      <div className="rounded-md border border-dashed border-border p-3 mb-4 bg-muted/20">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono mb-1">
          Variáveis disponíveis
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WHATSAPP_VARIABLES.map((v) => (
            <code key={v} className="text-[11px] px-1.5 py-0.5 rounded bg-background border border-border">
              {"{" + v + "}"}
            </code>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {WHATSAPP_EVENTS.map((meta) => {
          const r = byKey[meta.key];
          if (!r) return null;
          const isDirty = !!dirty[meta.key];
          return (
            <div key={meta.key} className="rounded-md border border-border p-3 bg-background/40">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.title}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{meta.key}</Badge>
                    {!r.is_active && <Badge variant="secondary" className="text-[10px]">Desativado</Badge>}
                    {isDirty && <Badge className="text-[10px] bg-warning text-warning-foreground">Alterações não salvas</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{meta.hint}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Ativo</Label>
                  <Switch checked={r.is_active} onCheckedChange={(v) => patch(meta.key, { is_active: v })} disabled={!canEdit} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Título interno</Label>
                  <Input value={r.title} onChange={(e) => patch(meta.key, { title: e.target.value })} disabled={!canEdit} />
                </div>
                <div className="md:col-span-1 flex items-end justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreviewKey(meta.key)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />Pré-visualizar
                  </Button>
                  {canEdit && (
                    <Button size="sm" onClick={() => save(meta.key)} disabled={!isDirty || saving === meta.key}>
                      <Save className="h-3.5 w-3.5 mr-1" />
                      {saving === meta.key ? "Salvando…" : "Salvar"}
                    </Button>
                  )}
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-xs">Mensagem</Label>
                  <Textarea
                    rows={7}
                    value={r.body}
                    onChange={(e) => patch(meta.key, { body: e.target.value })}
                    disabled={!canEdit}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              {previewKey === meta.key && (
                <div className="mt-3 rounded-md border border-success/40 bg-success/5 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">
                      Prévia (com dados de exemplo)
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setPreviewKey(null)}>Fechar</Button>
                  </div>
                  <pre className="whitespace-pre-wrap text-xs font-mono">{previewText}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}