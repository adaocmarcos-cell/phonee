import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export default function PagamentosAsaas() {
  const [settings, setSettings] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-webhook`;

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    toast.success("URL do webhook copiada");
  };

  const load = async () => {
    const { data } = await supabase.from("asaas_settings").select("*").limit(1).maybeSingle();
    setSettings(data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    const { error } = await supabase.from("asaas_settings").update({
      environment: settings.environment, wallet_id: settings.wallet_id, account_email: settings.account_email,
    }).eq("id", settings.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
  };

  const test = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("asaas-test-connection");
    setTesting(false);
    if (error) return toast.error(error.message);
    if ((data as any)?.ok) toast.success("Conexão OK"); else toast.error("Falha: " + JSON.stringify((data as any)?.data ?? data));
    load();
  };

  if (!settings) return <div className="p-6">Carregando…</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Pagamentos Asaas</h1>
        <p className="text-sm text-muted-foreground">Configuração da integração. As chaves API e Webhook ficam armazenadas com segurança no backend.</p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant={settings.connection_status === "connected" ? "default" : "secondary"}>
            {settings.connection_status ?? "desconhecido"}
          </Badge>
          <Badge variant={settings.api_key_set ? "default" : "destructive"}>API Key: {settings.api_key_set ? "ok" : "ausente"}</Badge>
          <Badge variant={settings.webhook_token_set ? "default" : "destructive"}>Webhook Token: {settings.webhook_token_set ? "ok" : "ausente"}</Badge>
        </div>

        <div className="space-y-2">
          <Label>Ambiente</Label>
          <select value={settings.environment} onChange={(e) => setSettings({ ...settings, environment: e.target.value })}
            className="w-full rounded-md border bg-background px-3 py-2">
            <option value="sandbox">Sandbox (testes)</option>
            <option value="production">Produção</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>E-mail da conta Asaas</Label>
          <Input value={settings.account_email ?? ""} onChange={(e) => setSettings({ ...settings, account_email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Wallet ID (opcional)</Label>
          <Input value={settings.wallet_id ?? ""} onChange={(e) => setSettings({ ...settings, wallet_id: e.target.value })} />
        </div>
        <div className="flex gap-3">
          <Button onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
          <Button variant="outline" onClick={test} disabled={testing}>{testing ? "Testando…" : "Testar conexão"}</Button>
        </div>

      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Webhook do Asaas</h2>
          <p className="text-sm text-muted-foreground">
            Use a URL abaixo para receber notificações de pagamento do Asaas. O token de
            autenticação fica armazenado em segredo no backend e nunca é exibido aqui.
          </p>
        </div>

        <div className="space-y-2">
          <Label>URL do Webhook</Label>
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={copyWebhook}>
              <Copy className="h-4 w-4 mr-1" /> Copiar
            </Button>
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-3">
          <div className="font-semibold">Como cadastrar no Asaas — passo a passo</div>
          <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
            <li>Acesse sua conta em <strong>www.asaas.com</strong> e entre no menu <strong>Integrações → Webhooks</strong>.</li>
            <li>Clique em <strong>Adicionar novo webhook</strong>.</li>
            <li>Em <strong>URL</strong>, cole o endereço acima.</li>
            <li>Em <strong>E-mail para notificação de erros</strong>, informe o e-mail do administrador.</li>
            <li>Em <strong>Versão da API</strong>, selecione <strong>v3</strong>.</li>
            <li>Em <strong>Token de autenticação</strong>, cole exatamente o mesmo valor configurado no segredo <code>ASAAS_WEBHOOK_TOKEN</code> deste sistema (peça ao desenvolvedor caso não tenha — ele não é exibido aqui por segurança).</li>
            <li>Em <strong>Eventos</strong>, marque pelo menos: <em>PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_REFUNDED, PAYMENT_DELETED</em>.</li>
            <li>Marque <strong>Habilitado</strong> e salve.</li>
            <li>Volte aqui e clique em <strong>Testar conexão</strong> para validar a API Key.</li>
          </ol>
          <div className="text-xs text-muted-foreground border-t pt-2">
            Para trocar a API Key ou o Webhook Token, atualize os segredos <code>ASAAS_API_KEY</code> e <code>ASAAS_WEBHOOK_TOKEN</code> na seção Backend.
          </div>
        </div>
      </Card>
    </div>
  );
}