import { useEffect, useRef, useState, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, Trash2, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

function CurrencyBRLInput({
  value,
  onChange,
  className,
}: {
  value: number | string;
  onChange: (n: number) => void;
  className?: string;
}) {
  const num = Number(value) || 0;
  const display = num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <Input
      inputMode="numeric"
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
        const cents = digits === "" ? 0 : parseInt(digits, 10);
        onChange(cents / 100);
      }}
      className={className}
    />
  );
}

const CHECKLIST_ITEMS = [
  { key: "screen_ok", label: "Tela sem trincas ou manchas" },
  { key: "battery_ok", label: "Bateria saudável" },
  { key: "cam_back_ok", label: "Câmera traseira funcionando" },
  { key: "cam_front_ok", label: "Câmera frontal funcionando" },
  { key: "buttons_ok", label: "Botões físicos OK" },
  { key: "biometric_ok", label: "Face ID / Digital OK" },
  { key: "box_included", label: "Caixinha original inclusa" },
  { key: "accessories_included", label: "Acessórios inclusos" },
  { key: "icloud_removed", label: "Conta Google/iCloud removida" },
  { key: "no_mdm", label: "Sem bloqueio MDM" },
  { key: "body_ok", label: "Sem danos na lateral/traseira" },
  { key: "speaker_ok", label: "Alto-falante e microfone OK" },
];

type TradeIn = any;

export default function TradeInForm() {
  const { id } = useParams();
  const editing = !!id;
  const { store, user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState<TradeIn>({
    customer_name: "", customer_doc: "", customer_phone: "", customer_email: "",
    imei: "", imei_status: "nao_verificado",
    brand: "", model: "", storage_gb: "", color: "",
    condition: "bom", battery_health: 100,
    entry_value: 0, intended_sale_value: 0,
    checklist: {} as Record<string, boolean>,
    photos_in: [] as string[],
    notes: "", status: "em_avaliacao",
  });

  useEffect(() => {
    if (!editing || !store) return;
    (async () => {
      const { data } = await supabase.from("trade_ins").select("*").eq("id", id).maybeSingle();
      if (data) setForm({ ...data, checklist: data.checklist ?? {}, photos_in: data.photos_in ?? [] });
    })();
  }, [id, editing, store]);

  const update = (patch: Partial<TradeIn>) => setForm((f: TradeIn) => ({ ...f, ...patch }));
  const toggleCheck = (k: string) =>
    setForm((f: TradeIn) => ({ ...f, checklist: { ...f.checklist, [k]: !f.checklist[k] } }));

  const checkImei = () => {
    if (!form.imei || form.imei.length < 14) return toast.error("Informe um IMEI válido (15 dígitos).");
    // Mock check — flag suspicious if ends in 000
    const suspicious = form.imei.endsWith("000");
    update({ imei_status: suspicious ? "restrito" : "limpo" });
    toast.success(suspicious ? "IMEI marcado como restrito ⚠️" : "IMEI limpo ✅");
  };

  const uploadPhoto = async (file: File) => {
    if (!store) return;
    setUploading(true);
    const path = `${store.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error } = await supabase.storage.from("trade-in-photos").upload(path, file, { upsert: false });
    if (error) { setUploading(false); return toast.error(error.message); }
    update({ photos_in: [...form.photos_in, path] });
    setUploading(false);
  };

  const photoUrl = (path: string) => {
    const { data } = supabase.storage.from("trade-in-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const removePhoto = async (path: string) => {
    await supabase.storage.from("trade-in-photos").remove([path]);
    update({ photos_in: form.photos_in.filter((p: string) => p !== path) });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!store || !user) return;
    if (!form.customer_name.trim()) return toast.error("Informe o nome do cliente.");
    if (!form.model.trim()) return toast.error("Informe o modelo do aparelho.");
    setBusy(true);
    const payload = {
      store_id: store.id,
      created_by: user.id,
      customer_name: form.customer_name.trim(),
      customer_doc: form.customer_doc || null,
      customer_phone: form.customer_phone || null,
      customer_email: form.customer_email || null,
      imei: form.imei || null,
      imei_status: form.imei_status,
      brand: form.brand || null,
      model: form.model.trim(),
      storage_gb: form.storage_gb || null,
      color: form.color || null,
      condition: form.condition,
      battery_health: Number(form.battery_health) || null,
      entry_value: Number(form.entry_value) || 0,
      intended_sale_value: Number(form.intended_sale_value) || 0,
      checklist: form.checklist,
      photos_in: form.photos_in,
      notes: form.notes || null,
      status: form.status,
    };
    const q = editing
      ? supabase.from("trade_ins").update(payload).eq("id", id!)
      : supabase.from("trade_ins").insert(payload);
    const { error } = await q;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Ficha atualizada" : "Ficha de Compra & Troca criada");
    navigate("/app/trade-in");
  };

  const margin = form.intended_sale_value > 0
    ? ((form.intended_sale_value - form.entry_value) / form.intended_sale_value) * 100 : 0;

  return (
    <div>
      <PageHeader
        title={editing ? "Editar ficha de Compra & Troca" : "Nova ficha de Compra & Troca"}
        description="Cadastro completo do aparelho seminovo recebido."
        actions={<Button variant="ghost" onClick={() => navigate("/app/trade-in")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>}
      />

      <form onSubmit={save} className="space-y-6">
        {/* Cliente */}
        <Card className="p-5 bg-card border-border">
          <h3 className="font-semibold mb-4">Cliente anterior</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.customer_name} onChange={(e) => update({ customer_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>CPF</Label><Input value={form.customer_doc} onChange={(e) => update({ customer_doc: e.target.value })} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.customer_phone} onChange={(e) => update({ customer_phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={form.customer_email} onChange={(e) => update({ customer_email: e.target.value })} /></div>
          </div>
        </Card>

        {/* Aparelho */}
        <Card className="p-5 bg-card border-border">
          <h3 className="font-semibold mb-4">Aparelho</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Marca</Label><Input value={form.brand} onChange={(e) => update({ brand: e.target.value })} placeholder="Apple, Samsung…" /></div>
            <div className="space-y-2 md:col-span-2"><Label>Modelo *</Label><Input value={form.model} onChange={(e) => update({ model: e.target.value })} placeholder="iPhone 14 Pro 256GB" /></div>
            <div className="space-y-2"><Label>Armazenamento</Label><Input value={form.storage_gb} onChange={(e) => update({ storage_gb: e.target.value })} placeholder="128 GB" /></div>
            <div className="space-y-2"><Label>Cor</Label><Input value={form.color} onChange={(e) => update({ color: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Condição</Label>
              <Select value={form.condition} onValueChange={(v) => update({ condition: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="otimo">Ótimo</SelectItem>
                  <SelectItem value="bom">Bom</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="com_defeito">Com defeito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>IMEI</Label>
              <div className="flex gap-2">
                <Input value={form.imei} onChange={(e) => update({ imei: e.target.value, imei_status: "nao_verificado" })} placeholder="15 dígitos" className="font-mono" />
                <Button type="button" variant="outline" onClick={checkImei}>Consultar</Button>
              </div>
              {form.imei_status === "limpo" && <Badge className="bg-success/15 text-success border-success/30"><ShieldCheck className="h-3 w-3 mr-1" />IMEI limpo</Badge>}
              {form.imei_status === "restrito" && <Badge className="bg-danger/15 text-danger border-danger/30"><ShieldAlert className="h-3 w-3 mr-1" />IMEI com restrição</Badge>}
            </div>
            <div className="space-y-2"><Label>Saúde da bateria (%)</Label><Input type="number" min={0} max={100} value={form.battery_health} onChange={(e) => update({ battery_health: e.target.value })} className="font-mono" /></div>
            <div className="space-y-2"><Label>Valor pago ao cliente (R$)</Label><CurrencyBRLInput value={form.entry_value} onChange={(n) => update({ entry_value: n })} className="font-mono" /></div>
            <div className="space-y-2"><Label>Valor de venda pretendido (R$)</Label><CurrencyBRLInput value={form.intended_sale_value} onChange={(n) => update({ intended_sale_value: n })} className="font-mono" /></div>
            <div className="space-y-2"><Label>Margem estimada</Label><div className={`px-3 py-2 rounded-md border border-border bg-surface-elevated font-mono font-semibold ${margin >= 25 ? "text-success" : margin >= 10 ? "text-warning" : "text-danger"}`}>{margin.toFixed(1)}%</div></div>
          </div>
        </Card>

        {/* Checklist */}
        <Card className="p-5 bg-card border-border">
          <h3 className="font-semibold mb-4">Checklist de avaliação</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {CHECKLIST_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-surface-elevated/40 cursor-pointer">
                <Checkbox checked={!!form.checklist[item.key]} onCheckedChange={() => toggleCheck(item.key)} />
                <span className="text-sm">{item.label}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* Fotos */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Fotos de entrada</h3>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-1" /> {uploading ? "Enviando…" : "Adicionar foto"}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          </div>
          {form.photos_in.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma foto enviada. Recomendado: frente, verso, laterais e detalhes de danos.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {form.photos_in.map((p: string) => (
                <div key={p} className="relative group rounded-md overflow-hidden border border-border bg-surface-elevated aspect-square">
                  <img src={photoUrl(p)} alt="Foto do aparelho" className="w-full h-full object-cover" loading="lazy" />
                  <button type="button" onClick={() => removePhoto(p)} className="absolute top-2 right-2 p-1.5 rounded-md bg-danger/90 text-danger-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Status + observações */}
        <Card className="p-5 bg-card border-border">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status da Compra & Troca</Label>
              <Select value={form.status} onValueChange={(v) => update({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_avaliacao">Em avaliação</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="em_estoque">Em estoque</SelectItem>
                  <SelectItem value="vendido">Vendido</SelectItem>
                  <SelectItem value="recusado">Recusado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:row-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => update({ notes: e.target.value })} rows={4} />
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate("/app/trade-in")}>Cancelar</Button>
          <Button type="submit" disabled={busy} className="bg-gradient-primary shadow-glow">
            {busy ? "Salvando…" : editing ? "Salvar alterações" : "Criar ficha"}
          </Button>
        </div>
      </form>
    </div>
  );
}