import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// rotas liberadas mesmo após expiração do teste
const TRIAL_EXPIRED_ALLOWED = [
  "/painel/meu-teste",
  "/painel/configuracoes",
  "/comprar",
  "/redefinir-senha",
];

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [extras, setExtras] = useState<{ expires_at: string | null } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setExtras(null); return; }
    (async () => {
      const { data } = await supabase
        .from("user_profile_extras")
        .select("expires_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setExtras((data as any) ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading || extras === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="font-mono text-xs text-muted-foreground tracking-widest">CARREGANDO…</div>
      </div>
    );
  }
  if (!user) {
    const returnTo = location.pathname + location.search;
    const skip = returnTo === "/" || returnTo.startsWith("/entrar");
    const to = skip ? "/entrar" : `/entrar?returnTo=${encodeURIComponent(returnTo)}`;
    return <Navigate to={to} replace state={{ from: returnTo }} />;
  }
  const mustChange = (user.user_metadata as any)?.must_change_password === true;
  if (mustChange && location.pathname !== "/redefinir-senha") {
    return <Navigate to="/redefinir-senha" replace />;
  }

  const expiresAt = extras?.expires_at ? new Date(extras.expires_at).getTime() : null;
  const expired = expiresAt !== null && expiresAt <= Date.now();
  if (expired) {
    const allowed = TRIAL_EXPIRED_ALLOWED.some((p) => location.pathname.startsWith(p));
    if (!allowed) return <Navigate to="/painel/meu-teste" replace />;
  }
  return <>{children}</>;
}