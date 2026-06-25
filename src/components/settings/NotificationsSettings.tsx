import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, ShoppingCart, Package, Wallet, Wrench, BarChart3, Send, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  isPushSupported, subscribeToPush, unsubscribeFromPush,
  getCurrentSubscription, sendTestPush,
} from "@/lib/pushNotifications";

type Prefs = {
  push_enabled: boolean;
  notify_new_sale: boolean;
  notify_low_stock: boolean;
  notify_bill_due: boolean;
  notify_new_service: boolean;
  notify_monthly_report: boolean;
};

const DEFAULT_PREFS: Prefs = {
  push_enabled: true,
  notify_new_sale: true,
  notify_low_stock: true,
  notify_bill_due: true,
  notify_new_service: true,
  notify_monthly_report: true,
};

const CATEGORIES: { key: keyof Prefs; label: string; description: string; Icon: any }[] = [
  { key: "notify_new_sale", label: "Novas vendas", description: "Avise sempre que uma venda for registrada.", Icon: ShoppingCart },
  { key: "notify_low_stock", label: "Estoque baixo", description: "Quando um produto atinge o estoque mínimo.", Icon: Package },
  { key: "notify_bill_due", label: "Contas a pagar vencendo", description: "Resumo diário de despesas a vencer em até 3 dias.", Icon: Wallet },
  { key: "notify_new_service", label: "Novo serviço de assistência", description: "Quando uma OS é registrada.", Icon: Wrench },
  { key: "notify_monthly_report", label: "Relatório mensal", description: "Resumo de vendas, custos e lucro no início de cada mês.", Icon: BarChart3 },
];

export function NotificationsSettings() {
  const { user, store } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const supported = isPushSupported();

  useEffect(() => {
    if (!user?.id || !store?.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .eq("store_id", store.id)
        .maybeSingle();
      if (data) {
        setPrefs({
          push_enabled: data.push_enabled,
          notify_new_sale: data.notify_new_sale,
          notify_low_stock: data.notify_low_stock,
          notify_bill_due: data.notify_bill_due,
          notify_new_service: data.notify_new_service,
          notify_monthly_report: data.notify_monthly_report,
        });
      }
      const cur = await getCurrentSubscription();
      setSubscribed(!!cur);
      setLoading(false);
    })();
  }, [user?.id, store?.id]);

  const savePrefs = async (next: Prefs) => {
    if (!user?.id || !store?.id) return;
    setPrefs(next);
    setSaving(true);
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: user.id,
      store_id: store.id,
      ...next,
    }, { onConflict: "user_id,store_id" });
    setSaving(false);
    if (error) toast.error("Não foi possível salvar: " + error.message);
  };

  const toggleField = (k: keyof Prefs, v: boolean) => savePrefs({ ...prefs, [k]: v });

  const enablePush = async () => {
    if (!store?.id) return;
    const res = await subscribeToPush(store.id);
    if (res.ok) {
      setSubscribed(true);
      setPermission("granted");
      toast.success("Notificações ativadas neste dispositivo.");
      await savePrefs({ ...prefs, push_enabled: true });
    } else if (res.reason === "denied") {
      setPermission("denied");
      toast.error("Permissão negada. Habilite as notificações nas configurações do navegador.");
    } else if (res.reason === "unsupported") {
      toast.error("Seu navegador não suporta notificações push. No iPhone, instale o app pela tela inicial primeiro.");
    } else {
      toast.error("Falha ao ativar: " + (res.reason ?? ""));
    }
  };

  const disablePush = async () => {
    await unsubscribeFromPush();
    setSubscribed(false);
    toast.success("Notificações desativadas neste dispositivo.");
  };

  const testPush = async () => {
    if (!store?.id) return;
    const ok = await sendTestPush(store.id);
    if (ok) toast.success("Notificação de teste enviada!");
    else toast.error("Não foi possível enviar o teste.");
  };

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <Bell className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h3 className="font-semibold">Notificações</h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Receba alertas em tempo real no celular e no navegador, mesmo com o app fechado.
              No iPhone, adicione o site à tela inicial antes de ativar.
            </p>
          </div>
        </div>
        {supported && subscribed && (
          <Button variant="ghost" size="sm" onClick={testPush} className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> Testar
          </Button>
        )}
      </div>

      {/* Estado da permissão */}
      <div className="rounded-lg border border-border p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          {subscribed ? (
            <><Bell className="h-4 w-4 text-success" />
              <span className="text-sm">Notificações ativas neste dispositivo</span></>
          ) : (
            <><BellOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Notificações desativadas neste dispositivo</span></>
          )}
        </div>
        {!supported ? (
          <div className="text-xs text-warning flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Navegador sem suporte
          </div>
        ) : subscribed ? (
          <Button variant="outline" size="sm" onClick={disablePush}>Desativar</Button>
        ) : (
          <Button size="sm" onClick={enablePush} disabled={permission === "denied"}>
            {permission === "denied" ? "Permissão bloqueada" : "Ativar neste dispositivo"}
          </Button>
        )}
      </div>

      {/* Master switch */}
      <div className="flex items-center justify-between py-2 border-b border-border mb-2">
        <div>
          <Label className="text-sm font-medium">Receber notificações</Label>
          <p className="text-xs text-muted-foreground">Master geral — desligue para pausar todos os alertas.</p>
        </div>
        <Switch
          checked={prefs.push_enabled}
          disabled={loading || saving}
          onCheckedChange={(v) => toggleField("push_enabled", v)}
        />
      </div>

      {/* Categorias */}
      <div className="divide-y divide-border">
        {CATEGORIES.map(({ key, label, description, Icon }) => (
          <div key={key} className="flex items-center justify-between py-3 gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="min-w-0">
                <Label className="text-sm font-medium block">{label}</Label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
            <Switch
              checked={prefs[key] as boolean}
              disabled={loading || saving || !prefs.push_enabled}
              onCheckedChange={(v) => toggleField(key, v)}
            />
          </div>
        ))}
      </div>

      {permission === "denied" && supported && (
        <div className="mt-4 text-xs text-warning rounded-lg border border-warning/30 bg-warning/5 p-3">
          O navegador está bloqueando notificações. Vá nas configurações do site (cadeado ao lado do endereço) e habilite "Notificações".
        </div>
      )}
    </Card>
  );
}