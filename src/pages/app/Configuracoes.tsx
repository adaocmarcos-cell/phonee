import { useEffect, useState } from "react";
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
import { Moon, Sun, Type, FileText, Store, Save, Palette } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Configuracoes() {
  const [font, setFont] = useState<number>(getFontSize());
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const { store, refresh, role } = useAuth();

  const [storeForm, setStoreForm] = useState({
    trade_name: "", name: "", instagram: "", phone: "", address: "", tax_id: "", price_table_note: "",
    pdf_primary_color: "#0EA5E9", pdf_accent_color: "#1E293B", pdf_logo_url: "", pdf_footer_text: "",
  });
  const [savingStore, setSavingStore] = useState(false);

  useEffect(() => {
    if (!store) return;
    setStoreForm({
      trade_name: store.trade_name ?? "",
      name: store.name ?? "",
      instagram: store.instagram ?? "",
      phone: store.phone ?? "",
      address: store.address ?? "",
      tax_id: store.tax_id ?? "",
      price_table_note: store.price_table_note ?? "",
      pdf_primary_color: (store as any).pdf_primary_color ?? "#0EA5E9",
      pdf_accent_color: (store as any).pdf_accent_color ?? "#1E293B",
      pdf_logo_url: (store as any).pdf_logo_url ?? "",
      pdf_footer_text: (store as any).pdf_footer_text ?? "",
    });
  }, [store]);

  const setSF = (k: string, v: string) => setStoreForm((f) => ({ ...f, [k]: v }));

  const saveStore = async () => {
    if (!store) return;
    setSavingStore(true);
    const { error } = await supabase.from("stores").update({
      trade_name: storeForm.trade_name || null,
      name: storeForm.name || store.name,
      instagram: storeForm.instagram || null,
      phone: storeForm.phone || null,
      address: storeForm.address || null,
      tax_id: storeForm.tax_id || null,
      price_table_note: storeForm.price_table_note || null,
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

  const onTheme = (dark: boolean) => {
    const next: Theme = dark ? "dark" : "light";
    setThemeState(next);
    setTheme(next);
  };

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Personalize a aparência do sistema. Documentos e PDFs exportados continuam sempre em fundo branco."
      />

      <div className="grid gap-4 max-w-2xl">
        <Card className="p-5 bg-card border-border">
          <div className="flex items-start gap-3 mb-4">
            <Store className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold">Dados da loja (rodapé dos PDFs)</h3>
              <p className="text-xs text-muted-foreground">Esses dados aparecem no rodapé das tabelas de preço, garantias e vendas exportadas.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome fantasia</Label>
              <Input value={storeForm.trade_name} onChange={(e) => setSF("trade_name", e.target.value)} disabled={role !== "dono" && role !== "gerente"} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Razão social / nome interno</Label>
              <Input value={storeForm.name} onChange={(e) => setSF("name", e.target.value)} disabled={role !== "dono" && role !== "gerente"} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Instagram</Label>
              <Input value={storeForm.instagram} onChange={(e) => setSF("instagram", e.target.value)} placeholder="@brazilera.mg" disabled={role !== "dono" && role !== "gerente"} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">WhatsApp</Label>
              <Input value={storeForm.phone} onChange={(e) => setSF("phone", e.target.value)} placeholder="(31) 99771-8170" disabled={role !== "dono" && role !== "gerente"} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Endereço</Label>
              <Input value={storeForm.address} onChange={(e) => setSF("address", e.target.value)} placeholder="Rua, número — Bairro, Cidade/UF" disabled={role !== "dono" && role !== "gerente"} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CNPJ / CPF</Label>
              <Input value={storeForm.tax_id} onChange={(e) => setSF("tax_id", e.target.value)} disabled={role !== "dono" && role !== "gerente"} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Observação final do PDF</Label>
              <Textarea
                value={storeForm.price_table_note}
                onChange={(e) => setSF("price_table_note", e.target.value)}
                placeholder="Valores sujeitos à disponibilidade de estoque e alteração sem aviso prévio."
                disabled={role !== "dono" && role !== "gerente"}
              />
            </div>
          </div>
          {(role === "dono" || role === "gerente") && (
            <div className="flex justify-end mt-3">
              <Button onClick={saveStore} disabled={savingStore} className="bg-gradient-primary shadow-glow">
                <Save className="h-4 w-4 mr-1" /> {savingStore ? "Salvando…" : "Salvar dados da loja"}
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-start gap-3 mb-4">
            <Type className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold">Tamanho da fonte</h3>
              <p className="text-xs text-muted-foreground">Selecione o tamanho da fonte do sistema, como no Word.</p>
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
            <span className="text-xs text-muted-foreground">Padrão: 16</span>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-start gap-3 mb-4">
            {theme === "dark" ? <Moon className="h-5 w-5 text-primary mt-0.5" /> : <Sun className="h-5 w-5 text-primary mt-0.5" />}
            <div>
              <h3 className="font-semibold">Aparência</h3>
              <p className="text-xs text-muted-foreground">Escolha entre modo claro e escuro.</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3 bg-surface-elevated">
            <div className="flex items-center gap-3">
              <Sun className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{theme === "dark" ? "Modo escuro" : "Modo claro"}</span>
              <Moon className="h-4 w-4 text-muted-foreground" />
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={onTheme} aria-label="Alternar tema" />
          </div>
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
      </div>
    </div>
  );
}