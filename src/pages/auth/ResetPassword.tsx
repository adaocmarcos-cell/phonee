import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";
import logoAsset from "@/assets/mobileplus-logo.png.asset.json";
const logo = logoAsset.url;

const passwordSchema = z.string().min(6, "Mínimo 6 caracteres").max(72);

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    const r = passwordSchema.safeParse(password);
    if (!r.success) return toast.error(r.error.issues[0].message);
    if (password !== confirm) return toast.error("As senhas não conferem");
    setBusy(true);
    const { data: upd, error } = await supabase.auth.updateUser({
      password: r.data,
      data: { must_change_password: false },
    });
    if (error) { setBusy(false); return toast.error(error.message); }
    // Decide destino: admin_master → painel Phonee
    let dest = "/painel";
    const uid = upd.user?.id;
    if (uid) {
      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", uid);
      if ((roles ?? []).some((r: any) => r.role === "admin_master")) {
        dest = "/mobileplus/visao-geral";
      }
    }
    setBusy(false);
    toast.success("Senha atualizada!");
    navigate(dest);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8 bg-card border-border shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
          <span className="text-lg font-bold">Phonee</span>
        </div>
        <h1 className="text-2xl font-bold mb-1">Redefinir senha</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {ready ? "Defina sua nova senha de acesso." : "Validando link…"}
        </p>
        {ready && (
          <form onSubmit={handle} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">Nova senha</Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirmar senha</Label>
              <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-gradient-primary shadow-glow">
              {busy ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}