import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="font-mono text-xs text-muted-foreground tracking-widest">CARREGANDO…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/entrar" replace />;
  const mustChange = (user.user_metadata as any)?.must_change_password === true;
  if (mustChange && location.pathname !== "/redefinir-senha") {
    return <Navigate to="/redefinir-senha" replace />;
  }
  return <>{children}</>;
}