import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Props = { children?: ReactNode };

export default function AdminMasterRoute({ children }: Props) {
  const [state, setState] = useState<"loading" | "ok" | "deny">("loading");
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setState("deny"); return; }
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin_master")
        .maybeSingle();
      if (cancelled) return;
      setState(!error && data ? "ok" : "deny");
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Verificando acesso…
      </div>
    );
  }
  if (state === "deny") {
    return <Navigate to="/mobileplus" replace state={{ from: location }} />;
  }
  return <>{children ?? <Outlet />}</>;
}