import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FONT_SIZE_OPTIONS, getFontSize, setFontSize,
  getTheme, setTheme, type Theme,
} from "@/lib/preferences";
import { ThemePicker } from "@/components/ThemePicker";
import { Moon, Sun, Type, FileText, Store, Save, Palette, Upload, Trash2, ImageIcon, Paintbrush, RefreshCw, ShieldCheck } from "lucide-react";
import { subscriptionAccess, anyGrantsAccess } from "@/lib/subscriptionAccess";
import { NotificationsSettings } from "@/components/settings/NotificationsSettings";
import { WhatsappTemplatesSettings } from "@/components/settings/WhatsappTemplatesSettings";
import { CommissionRulesSettings } from "@/components/settings/CommissionRulesSettings";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isDemoMode, isDemoUserEmail } from "@/lib/demoMode";

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function Configuracoes() {
  const [font, setFont] = useState<number>(getFontSize());
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const { store, refresh, role, user, stores, activeStoreSubscription, reloadStores } = useAuth();
  const demo = isDemoMode() || isDemoUserEmail(user?.email);
  const canEdit = !demo && (role === "dono" || role === "gerente");
  const fileRef = useRef<HTMLInputElement>(null);

  const [resyncing, setResyncing] = useState(false);
  const [resyncResult, setResyncResult] = useState<null | {
    label: string;
    ok: boolean;
    plan?: string | null;
    expiresAt?: string | null;
  }>(null);

  const handleResync = async () => {
    setResyncing(true);
    setResyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("resync-subscription");
      if (error) throw error;
      const subs = (data?.subscriptions ?? []) as any[];
      const access = anyGrantsAccess(
        subs.map((s) => ({
          status: s.status,
          expires_at: s.expires_at,
          cancel_at_period_end: s.cancel_at_period_end,
          billing_cycle: s.billing_cycle,
        }))
      );
      const best = subs.find((s) => {
        const a = subscriptionAccess({
          status: s.status,
          expires_at: s.expires_at,
          cancel_at_period_end: s.cancel_at_period_end,
          billing_cycle: s.billing_cycle,
        });
        return a.hasAccess;
      }) ?? subs[0];

      await Promise.all([refresh(), reloadStores()]);
      setResyncResult({
        ok: !!access?.hasAccess,
        label: access?.label ?? "Sem plano",
        plan: best?.plan_name ?? null,
        expiresAt: best?.expires_at ?? null,
      });
      if (access?.hasAccess) toast.success("Assinatura sincronizada. Acesso liberado.");
      else toast.warning("Nenhuma assinatura ativa encontrada para este usuário.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao sincronizar assinatura.");
    } finally {
      setResyncing(false);
    }
  };

  const currentAccess = activeStoreSubscription
    ? subscriptionAccess({
        status: activeStoreSubscription.subscription_status,
        expires_at: activeStoreSubscription.expires_at,
        billing_cycle: activeStoreSubscription.billing_cycle,
      })
    : null;

  const [storeForm, setStoreForm] = useState({
    trade_name: "", name: "", instagram: "", phone: "", tax_id: "", price_table_note: "",
    address_street: "", address_number: "", address_complement: "",
    address_neighborhood: "", address_city: "", address_uf: "",
    show_tax_id_on_docs: true, show_legal_name_on_docs: true,
    show_non_fiscal_notice: true,
    allow_negative_stock: false,
    pdf_primary_color: "#0EA5E9", pdf_accent_color: "#1E293B",
    pdf_logo_url: "", pdf_footer_text: "",
  });
  const [savingStore, setSavingStore] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const loadLogoPreview = async (path: string) => {
    if (!path) { setLogoPreview(""); return; }
    if (/^https?:\/\//i.test(path)) { setLogoPreview(path); return; }
    const { data } = await supabase.storage.from("store-logos").createSignedUrl(path, 3600);
    setLogoPreview(data?.signedUrl ?? "");
  };

  useEffect(() => {
    if (!store) return;
    const s = store as any;
    setStoreForm({
      trade_name: s.trade_name ?? "",
      name: s.name ?? "",
      instagram: s.instagram ?? "",
      phone: s.phone ?? "",
      tax_id: s.tax_id ?? "",
      price_table_note: s.price_table_note ?? "",
      address_street: s.address_street ?? "",
      address_number: s.address_number ?? "",
      address_complement: s.address_complement ?? "",
      address_neighborhood: s.address_neighborhood ?? "",
      address_city: s.address_city ?? "",
      address_uf: s.address_uf ?? "",
      show_tax_id_on_docs: s.show_tax_id_on_docs ?? true,
      show_legal_name_on_docs: s.show_legal_name_on_docs ?? true,
      show_non_fiscal_notice: s.show_non_fiscal_notice ?? true,
      allow_negative_stock: s.allow_negative_stock ?? false,
      pdf_primary_color: s.pdf_primary_color ?? "#0EA5E9",
      pdf_accent_color: s.pdf_accent_color ?? "#1E293B",
      pdf_logo_url: s.pdf_logo_url ?? "",
      pdf_footer_text: s.pdf_footer_text ?? "",
    });
    loadLogoPreview(s.pdf_logo_url ?? "");
  }, [store]);

  const setSF = (k: string, v: any) => setStoreForm((f) => ({ ...f, [k]: v }));

  const onUploadLogo = async (file: File) => {
    if (!store) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Máximo 2MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${store.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("store-logos").upload(path, file, {
      upsert: true, contentType: file.type,
    });
    if (error) { setUploading(false); toast.error(error.message); return; }
    // remove previous file (best-effort)
    if (storeForm.pdf_logo_url && !/^https?:\/\//i.test(storeForm.pdf_logo_url)) {
      await supabase.storage.from("store-logos").remove([storeForm.pdf_logo_url]);
    }
    setSF("pdf_logo_url", path);
    await loadLogoPreview(path);
    setUploading(false);
    toast.success("Logotipo enviado. Não esqueça de salvar.");
  };

  const onRemoveLogo = async () => {
    if (storeForm.pdf_logo_url && !/^https?:\/\//i.test(storeForm.pdf_logo_url)) {
      await supabase.storage.from("store-logos").remove([storeForm.pdf_logo_url]);
    }
    setSF("pdf_logo_url", "");
    setLogoPreview("");
  };

  const saveStore = async () => {
    if (!store) return;
    setSavingStore(true);
    const { error } = await supabase.from("stores").update({
      trade_name: storeForm.trade_name || null,
      name: storeForm.name || store.name,
      instagram: storeForm.instagram || null,
      phone: storeForm.phone || null,
      tax_id: storeForm.tax_id || null,
      price_table_note: storeForm.price_table_note || null,
      address_street: storeForm.address_street || null,
      address_number: storeForm.address_number || null,
      address_complement: storeForm.address_complement || null,
      address_neighborhood: storeForm.address_neighborhood || null,
      address_city: storeForm.address_city || null,
      address_uf: storeForm.address_uf || null,
      show_tax_id_on_docs: storeForm.show_tax_id_on_docs,
      show_legal_name_on_docs: storeForm.show_legal_name_on_docs,
      show_non_fiscal_notice: storeForm.show_non_fiscal_notice,
      allow_negative_stock: storeForm.allow_negative_stock,
      pdf_primary_color: storeForm.pdf_primary_color || null,
      pdf_accent_color: storeForm.pdf_accent_color || null,
      pdf_logo_url: storeForm.pdf_logo_url || null,
      pdf_footer_text: storeForm.pdf_footer_text || null,
    } as any).eq("id", store.id);
    setSavingStore(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Dados da loja atualizados");
  };

  const onFont = (v: string) => {
    const n = Number(v);
    setFont(n);
    setFontSize(n);
  };

  const onThemeChange = (next: Theme) => {
    setThemeState(next);
    setTheme(next);
  };

  return (
    <div>
      <PageHeader title="Configurações" />

      {demo && (
        <div className="mb-4 max-w-2xl rounded-md border border-primary/30 bg-primary/10 px-4 py-3 flex items-start gap-3">
          <div className="text-sm">
            <div className="font-semibold text-foreground">Modo demonstração</div>
            <div className="text-muted-foreground">
              As configurações são apenas para exibição nesta demonstração. Adquira o Phonee para personalizar a sua loja.
            </div>
          </div>
        </div>
      )}

      <fieldset disabled={demo} className={demo ? "max-w-2xl opacity-90 pointer-events-none select-none" : "max-w-2xl"}>
      <div className="grid gap-4">
        <Card className="p-5 bg-card border-border">
          <div className="flex items-start gap-3 mb-4">
            <Store className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold">Dados da loja</h3>
              <p className="text-xs text-muted-foreground">Aparecem nas notas de pedido, vendas, garantia e ordens de serviço.</p>
            </div>
          </div>

          {/* Logo upload */}
          <div className="flex items-center gap-4 mb-4 p-3 rounded-md border border-dashed">
            <div className="h-[76px] w-[76px] shrink-0 rounded-md border bg-muted/30 overflow-hidden flex items-center justify-center">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <Label className="text-xs">Logotipo da loja</Label>
              <p className="text-[11px] text-muted-foreground">
                Formato quadrado, ~2×2 cm nos documentos. PNG ou JPG, até 2 MB.
              </p>
              {canEdit && (
                <div className="flex gap-2 mt-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadLogo(f);
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    {uploading ? "Enviando…" : logoPreview ? "Substituir" : "Enviar logotipo"}
                  </Button>
                  {logoPreview && (
                    <Button size="sm" variant="ghost" onClick={onRemoveLogo}>
                      <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" />Remover
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome fantasia</Label>
              <Input value={storeForm.trade_name} onChange={(e) => setSF("trade_name", e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Razão social</Label>
              <Input value={storeForm.name} onChange={(e) => setSF("name", e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Instagram</Label>
              <Input value={storeForm.instagram} onChange={(e) => setSF("instagram", e.target.value)} placeholder="@sualoja" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={storeForm.phone} onChange={(e) => setSF("phone", e.target.value)} placeholder="(31) 99771-8170" disabled={!canEdit} />
            </div>

            {/* Endereço estruturado */}
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Rua / Logradouro</Label>
              <Input value={storeForm.address_street} onChange={(e) => setSF("address_street", e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Número</Label>
              <Input value={storeForm.address_number} onChange={(e) => setSF("address_number", e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Complemento</Label>
              <Input value={storeForm.address_complement} onChange={(e) => setSF("address_complement", e.target.value)} placeholder="Sala, andar…" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bairro</Label>
              <Input value={storeForm.address_neighborhood} onChange={(e) => setSF("address_neighborhood", e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cidade</Label>
              <Input value={storeForm.address_city} onChange={(e) => setSF("address_city", e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">UF</Label>
              <Select value={storeForm.address_uf || undefined} onValueChange={(v) => setSF("address_uf", v)} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {UF_LIST.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">CNPJ / CPF</Label>
              <Input value={storeForm.tax_id} onChange={(e) => setSF("tax_id", e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Observação final do PDF</Label>
              <Textarea
                value={storeForm.price_table_note}
                onChange={(e) => setSF("price_table_note", e.target.value)}
                placeholder="Valores sujeitos à disponibilidade de estoque e alteração sem aviso prévio."
                disabled={!canEdit}
              />
            </div>

            {/* Exibição em documentos */}
            <div className="md:col-span-2 space-y-2 rounded-md border p-3 bg-muted/20">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Exibição em pedidos e garantia</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm">Exibir CNPJ/CPF nas notas</span>
                <Switch
                  checked={storeForm.show_tax_id_on_docs}
                  onCheckedChange={(v) => setSF("show_tax_id_on_docs", v)}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Exibir razão social nas notas</span>
                <Switch
                  checked={storeForm.show_legal_name_on_docs}
                  onCheckedChange={(v) => setSF("show_legal_name_on_docs", v)}
                  disabled={!canEdit}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Exibir aviso "Este não é um documento fiscal"</span>
                <Switch
                  checked={storeForm.show_non_fiscal_notice}
                  onCheckedChange={(v) => setSF("show_non_fiscal_notice", v)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Estoque */}
            <div className="md:col-span-2 space-y-2 rounded-md border p-3 bg-muted/20">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Estoque</Label>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm">Permitir venda com estoque negativo</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Quando ativo, é possível vender produtos sem saldo em estoque. O estoque ficará negativo até ser regularizado.
                  </div>
                </div>
                <Switch
                  checked={storeForm.allow_negative_stock}
                  onCheckedChange={(v) => setSF("allow_negative_stock", v)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end mt-3">
              <Button onClick={saveStore} disabled={savingStore} className="bg-gradient-primary shadow-glow">
                <Save className="h-4 w-4 mr-1" /> {savingStore ? "Salvando…" : "Salvar dados da loja"}
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-start gap-3 mb-4">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold">Assinatura & acesso</h3>
              <p className="text-xs text-muted-foreground">
                Se você acabou de pagar e o acesso ainda não liberou, clique em sincronizar. Cobrimos os
                estados: em teste, ativa, vencida, vitalícia e cancelada com acesso até o vencimento.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm">
              <div className="text-xs text-muted-foreground">Status atual</div>
              <div className="font-medium">
                {currentAccess?.label ?? "Sem plano vinculado"}
                {activeStoreSubscription?.plan_name && (
                  <span className="text-muted-foreground"> · {activeStoreSubscription.plan_name}</span>
                )}
              </div>
              {currentAccess?.expiresAt && currentAccess.state !== "lifetime" && (
                <div className="text-xs text-muted-foreground">
                  {currentAccess.hasAccess ? "Válida até" : "Venceu em"}{" "}
                  {currentAccess.expiresAt.toLocaleDateString("pt-BR")}
                  {currentAccess.daysLeft != null && currentAccess.hasAccess && (
                    <> · {currentAccess.daysLeft} dia(s) restantes</>
                  )}
                </div>
              )}
            </div>
            <Button
              onClick={handleResync}
              disabled={resyncing}
              variant="outline"
              className="border-primary text-primary hover:bg-primary hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${resyncing ? "animate-spin" : ""}`} />
              {resyncing ? "Sincronizando…" : "Re-sincronizar assinatura"}
            </Button>
          </div>
          {resyncResult && (
            <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${resyncResult.ok ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}>
              {resyncResult.ok
                ? `Acesso liberado — ${resyncResult.label}${resyncResult.plan ? ` (${resyncResult.plan})` : ""}.`
                : `Nenhuma assinatura ativa localizada. Status: ${resyncResult.label}.`}
            </div>
          )}
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold">Exportações</h3>
              <p className="text-xs text-muted-foreground">
                Todos os PDFs e documentos exportados (vendas, garantia, OS, pedidos) são sempre gerados em <strong className="text-foreground">fundo branco</strong>, independente do tema escolhido aqui.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-start gap-3 mb-4">
            <Palette className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold">Identidade de marca nos PDFs</h3>
              <p className="text-xs text-muted-foreground">
                Personalize as cores, o logotipo e o rodapé que aparecem em todos os PDFs exportados pelo sistema.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cor primária dos PDFs</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-16 p-1"
                  value={storeForm.pdf_primary_color}
                  onChange={(e) => setSF("pdf_primary_color", e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  value={storeForm.pdf_primary_color}
                  onChange={(e) => setSF("pdf_primary_color", e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor de destaque dos PDFs</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-16 p-1"
                  value={storeForm.pdf_accent_color}
                  onChange={(e) => setSF("pdf_accent_color", e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  value={storeForm.pdf_accent_color}
                  onChange={(e) => setSF("pdf_accent_color", e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Texto institucional</Label>
              <Textarea
                value={storeForm.pdf_footer_text}
                onChange={(e) => setSF("pdf_footer_text", e.target.value)}
                placeholder="Frase de marca, slogan ou aviso legal exibido em todos os PDFs"
                disabled={!canEdit}
              />
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end mt-3">
              <Button onClick={saveStore} disabled={savingStore} className="bg-gradient-primary shadow-glow">
                <Save className="h-4 w-4 mr-1" /> Salvar identidade dos PDFs
              </Button>
            </div>
          )}
        </Card>
      </div>
      </fieldset>

      {/* Preferências locais de UI (fonte e tema) ficam FORA do fieldset de demo
          porque são apenas visuais — não tocam o backend e devem estar sempre
          clicáveis, inclusive em contas demo. */}
      <div className="max-w-2xl grid gap-4 mt-4">
        <Card className="p-5 bg-card border-border">
          <div className="flex items-start gap-3 mb-4">
            <Type className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold">Tamanho da fonte</h3>
              <p className="text-xs text-muted-foreground">Selecione o tamanho da fonte do sistema.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm w-32">Tamanho (px)</Label>
            <Select value={String(font)} onValueChange={onFont}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-start gap-3 mb-4">
            <Paintbrush className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold">Aparência</h3>
              <p className="text-xs text-muted-foreground">
                Escolha entre o tema padrão e os temas monocromáticos. Passe o mouse em
                <strong className="text-foreground"> Pré-visualizar</strong> para ver ao vivo e clique em
                <strong className="text-foreground"> Usar este tema</strong> para aplicar.
              </p>
            </div>
          </div>
          <ThemePicker value={theme} onChange={onThemeChange} />
        </Card>

        <NotificationsSettings />
        <WhatsappTemplatesSettings />
        <CommissionRulesSettings />
      </div>
    </div>
  );
}