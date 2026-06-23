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
import logoAsset from "@/assets/mobileplus-logo.png.asset.json";
const logo = logoAsset.url;
import { Boxes, Zap, ShieldCheck, Eye, EyeOff, ArrowRight } from "lucide-react";

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
    if (error) { setBusy(false); return toast.error(error.message); }

    // Verifica se há assinatura ativa OU se é admin_master (acesso interno)
    const userId = signin.user?.id;
    let allowed = false;
    let initialPath = "/painel";
    if (userId) {
      const [{ data: roles }, { data: subs }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("subscriptions").select("id,status").eq("user_id", userId).eq("status", "active").limit(1),
      ]);
      const isAdminMaster = (roles ?? []).some((r: any) => r.role === "admin_master");
      const hasActive = (subs ?? []).length > 0;
      allowed = isAdminMaster || hasActive;
      // Rota inicial: gestores → Dashboard; demais → Vendas
      const gestorRoles = new Set(["admin_master", "dono", "administrador"]);
      const isGestor = (roles ?? []).some((r: any) => gestorRoles.has(r.role));
      initialPath = isGestor ? "/painel" : "/painel/vendas";
    }
    if (!allowed) {
      await supabase.auth.signOut();
      setBusy(false);
      return toast.error("Nenhum plano ativo encontrado. Adquira um plano para acessar o Mobile+.");
    }
    setBusy(false);
    if (remember) localStorage.setItem("mobileplus.rememberedEmail", eRes.data);
    else localStorage.removeItem("mobileplus.rememberedEmail");
    toast.success("Bem-vindo de volta!");
    navigate(initialPath);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-10 relative overflow-hidden bg-gradient-surface border-r border-border">
        <div className="absolute inset-0 bg-grid opacity-[0.18] pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Mobile+" width={40} height={40} className="h-10 w-10" />
            <div>
              <div className="text-lg font-bold tracking-tight">Mobile+</div>
              <div className="text-[11px] font-mono text-muted-foreground tracking-widest">ERP · SMARTPHONES</div>
            </div>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            Inteligência de estoque para lojas que <span className="text-primary">não podem perder venda</span>.
          </h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3"><Boxes className="h-4 w-4 text-primary mt-0.5" /> Curva ABC e regra 80/20 calculadas automaticamente</li>
            <li className="flex gap-3"><Zap className="h-4 w-4 text-success mt-0.5" /> Alertas de ruptura, encalhe e crediário em tempo real</li>
            <li className="flex gap-3"><ShieldCheck className="h-4 w-4 text-warning mt-0.5" /> Controle de seminovos, IMEI e checklist com fotos</li>
          </ul>
        </div>
        <div className="relative text-[11px] font-mono text-muted-foreground tracking-widest">© MOBILE+ · 2026</div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 bg-card border-border shadow-card">
          {/* Logo em destaque, centralizado acima do formulário */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-gradient-primary opacity-30 blur-2xl rounded-full" aria-hidden />
              <div className="relative h-24 w-24 rounded-2xl bg-gradient-surface border border-border shadow-glow flex items-center justify-center p-3">
                <img src={logo} alt="Mobile+" width={96} height={96} className="h-full w-full object-contain" />
              </div>
            </div>
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