import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AccountBlocked from "@/pages/AccountBlocked";

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
  const [blocked, setBlocked] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setExtras(null); setBlocked(false); return; }
    (async () => {
      const [{ data: extrasData }, { data: blockData }] = await Promise.all([
        supabase
          .from("user_profile_extras")
          .select("expires_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.rpc("my_access_block_status" as any),
      ]);
      if (cancelled) return;
      setExtras((extrasData as any) ?? null);
      const row = Array.isArray(blockData) ? blockData[0] : blockData;
      setBlocked(!!(row as any)?.is_blocked);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading || extras === undefined || blocked === undefined) {
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

  // Bloqueio de acesso decidido pelo Admin Master (ou por falta de pagamento):
  // trava TODAS as rotas internas, exceto /comprar e /redefinir-senha.
  if (blocked) {
    const allowWhileBlocked =
      location.pathname.startsWith("/comprar") ||
      location.pathname.startsWith("/redefinir-senha");
    if (!allowWhileBlocked) return <AccountBlocked />;
  }

  const expiresAt = extras?.expires_at ? new Date(extras.expires_at).getTime() : null;
  const expired = expiresAt !== null && expiresAt <= Date.now();
  if (expired) {
    const allowed = TRIAL_EXPIRED_ALLOWED.some((p) => location.pathname.startsWith(p));
    if (!allowed) return <Navigate to="/painel/meu-teste" replace />;
  }
  return <>{children}</>;
}