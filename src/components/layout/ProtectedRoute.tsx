import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="font-mono text-xs text-muted-foreground tracking-widest">CARREGANDO…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/entrar" replace />;
  return <>{children}</>;
}