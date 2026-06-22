import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function PagamentosAsaas() {
  const [settings, setSettings] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

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

        <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
          <div><strong>URL do Webhook:</strong> Configure no painel do Asaas apontando para a função <code>asaas-webhook</code>.</div>
          <div>Header esperado: <code>asaas-access-token: SEU_WEBHOOK_TOKEN</code> (idêntico ao secret <code>ASAAS_WEBHOOK_TOKEN</code>).</div>
          <div>Para trocar a API Key ou o Webhook Token, atualize os secrets na seção Backend.</div>
        </div>
      </Card>
    </div>
  );
}