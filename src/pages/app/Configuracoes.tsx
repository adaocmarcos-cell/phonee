import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FONT_SIZE_OPTIONS, getFontSize, setFontSize,
  getTheme, setTheme, type Theme,
} from "@/lib/preferences";
import { Moon, Sun, Type, FileText } from "lucide-react";

export default function Configuracoes() {
  const [font, setFont] = useState<number>(getFontSize());
  const [theme, setThemeState] = useState<Theme>(getTheme());

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