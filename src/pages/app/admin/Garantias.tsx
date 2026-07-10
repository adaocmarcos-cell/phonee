import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  loadWarrantySettings,
  saveWarrantySettings,
  DEFAULT_WARRANTY,
  type WarrantySettings,
  type WarrantyOption,
} from "@/lib/warranty";
import { canManageUsers } from "@/lib/roles";

export default function Garantias() {
  const { store, role } = useAuth();
  const [s, setS] = useState<WarrantySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = canManageUsers(role as any) || role === "gerente";

  useEffect(() => {
    if (!store) return;
    loadWarrantySettings(store.id).then(setS);
  }, [store]);

  if (!store || !s) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  const update = (patch: Partial<WarrantySettings>) => setS({ ...s, ...patch });

  const addOption = () =>
    update({ options: [...s.options, { days: 30, label: "30 dias" }] });
  const removeOption = (idx: number) =>
    update({ options: s.options.filter((_, i) => i !== idx) });
  const updateOption = (idx: number, patch: Partial<WarrantyOption>) =>
    update({ options: s.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)) });

  const onSave = async () => {
    if (!canEdit) return toast.error("Sem permissão");
    if (s.options.length === 0) return toast.error("Adicione ao menos uma opção de prazo");
    if (!s.options.find((o) => o.days === s.default_days))
      return toast.error("O prazo padrão deve estar entre as opções");
    setBusy(true);
    const { error } = await saveWarrantySettings(s);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Configurações de garantia salvas");
  };

  const restore = () => setS({ ...s, ...DEFAULT_WARRANTY });

  return (
    <div>
      <PageHeader
        title="Garantias"
        description="Configure o aviso, mensagem padrão e prazos selecionáveis na venda."
        actions={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={restore}>Restaurar padrão</Button>
              <Button onClick={onSave} disabled={busy} className="bg-primary text-primary-foreground shadow-glow">
                <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Conteúdo do termo
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              Aviso de garantia (exibido em destaque)
            </Label>
            <Textarea
              rows={2}
              value={s.notice_text}
              onChange={(e) => update({ notice_text: e.target.value })}
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              Mensagem padrão / regras (impressa no comprovante)
            </Label>
            <Textarea
              rows={6}
              value={s.message_template}
              onChange={(e) => update({ message_template: e.target.value })}
              disabled={!canEdit}
            />
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="text-sm font-semibold">Prazos e padrão</div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Marcar garantia por padrão</div>
              <div className="text-xs text-muted-foreground">Vem ativado na nova venda</div>
            </div>
            <Switch
              checked={s.default_enabled}
              onCheckedChange={(v) => update({ default_enabled: v })}
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              Prazo padrão
            </Label>
            <Select
              value={String(s.default_days)}
              onValueChange={(v) => update({ default_days: Number(v) })}
              disabled={!canEdit}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {s.options.map((o, i) => (
                  <SelectItem key={i} value={String(o.days)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
                Opções selecionáveis
              </Label>
              {canEdit && (
                <Button type="button" size="sm" variant="outline" onClick={addOption}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Adicionar
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {s.options.map((o, idx) => (
                <div key={idx} className="grid grid-cols-[80px_1fr_auto] gap-2">
                  <NumberInput
                    allowDecimal={false} min={1} emptyBehavior="min" value={o.days}
                    onValueChange={(n) => updateOption(idx, { days: n })}
                    disabled={!canEdit}
                  />
                  <Input
                    value={o.label}
                    onChange={(e) => updateOption(idx, { label: e.target.value })}
                    disabled={!canEdit}
                  />
                  <Button
                    type="button" size="icon" variant="ghost"
                    onClick={() => removeOption(idx)} disabled={!canEdit}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}