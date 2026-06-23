import { useEffect, useState, FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";
import logoAsset from "@/assets/phonee-logo.png.asset.json";
const logo = logoAsset.url;
import { Eye, EyeOff, ArrowRight } from "lucide-react";

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passwordSchema = z.string().min(6, "Mínimo 6 caracteres").max(72);

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("mobileplus.rememberedEmail");
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  if (loading) return null;
  if (user) return <Navigate to="/painel" replace />;

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    const eRes = emailSchema.safeParse(email);
    const pRes = passwordSchema.safeParse(password);
    if (!eRes.success) return toast.error(eRes.error.issues[0].message);
    if (!pRes.success) return toast.error(pRes.error.issues[0].message);
    setBusy(true);
    const { data: signin, error } = await supabase.auth.signInWithPassword({ email: eRes.data, password: pRes.data });
    if (error) {
      setBusy(false);
      const msg = /invalid login credentials/i.test(error.message)
        ? "E-mail ou senha incorretos."
        : error.message;
      return toast.error(msg);
    }

    // Verifica se há assinatura ativa OU se é admin_master (acesso interno)
    const userId = signin.user?.id;
    const mustChangePw = signin.user?.user_metadata?.must_change_password === true;
    let allowed = false;
    let initialPath = "/painel";
    let isAdminMaster = false;
    if (userId) {
      const [{ data: roles }, { data: myStores }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.rpc("my_stores", { _user_id: userId }),
      ]);
      isAdminMaster = (roles ?? []).some((r: any) => r.role === "admin_master");
      const activeStatuses = new Set(["active", "ativa", "trialing", "vitalicio"]);
      const hasActive = (myStores ?? []).some((s: any) => activeStatuses.has(s.subscription_status));
      allowed = isAdminMaster || hasActive;
      const gestorRoles = new Set(["admin_master", "dono", "administrador"]);
      const isGestor = (roles ?? []).some((r: any) => gestorRoles.has(r.role));
      initialPath = isAdminMaster
        ? "/phonee/visao-geral"
        : (isGestor ? "/painel" : "/painel/vendas");
    }
    if (!allowed) {
      await supabase.auth.signOut();
      setBusy(false);
      return toast.error("Nenhum plano ativo encontrado. Adquira um plano para acessar o Phonee.");
    }
    setBusy(false);
    if (remember) localStorage.setItem("mobileplus.rememberedEmail", eRes.data);
    else localStorage.removeItem("mobileplus.rememberedEmail");
    if (mustChangePw) {
      toast.info("Defina sua nova senha para continuar.");
      navigate("/redefinir-senha");
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate(initialPath);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col items-center justify-center p-10 relative overflow-hidden bg-gradient-surface border-r border-border">
        <div className="absolute inset-0 bg-grid opacity-[0.18] pointer-events-none" />
        <div className="relative flex flex-col items-center text-center">
          <img src={logo} alt="Phonee" className="h-32 w-auto object-contain mb-6" />
          <div className="text-[11px] font-mono text-muted-foreground tracking-widest">ERP · SMARTPHONES</div>
        </div>
        <div className="absolute bottom-6 text-[11px] font-mono text-muted-foreground tracking-widest">© MOBILE+ · 2026</div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 bg-card border-border shadow-card">
          {/* Logo centralizado acima do formulário */}
          <div className="flex flex-col items-center text-center mb-8 lg:hidden">
            <img src={logo} alt="Phonee" className="h-20 w-auto object-contain" />
          </div>

          <h2 className="text-xl font-semibold mb-1 text-center">Acesse sua conta</h2>
          <p className="text-sm text-muted-foreground mb-6 text-center">Apenas clientes com plano ativo.</p>

              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@loja.com" autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                      <Checkbox
                        checked={remember}
                        onCheckedChange={(v) => setRemember(v === true)}
                        className="h-4 w-4"
                      />
                      Salvar senha e manter conectado
                    </label>
                    <Link to="/esqueci-senha" className="text-xs text-primary hover:underline">
                      Esqueceu a senha?
                    </Link>
                  </div>
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary shadow-glow">
                  {busy ? "Entrando…" : "Entrar"}
                </Button>
              </form>

          <div className="mt-6 pt-6 border-t border-border text-center space-y-2">
            <p className="text-sm text-muted-foreground">Ainda não é cliente?</p>
            <Link to="/comprar">
              <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary hover:text-white">
                Adquirir um plano <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}