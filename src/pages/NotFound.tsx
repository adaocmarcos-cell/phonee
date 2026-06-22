import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-grid">
      <div className="text-center max-w-sm">
        <div className="metric text-7xl font-bold text-primary mb-2">404</div>
        <h1 className="text-xl font-bold mb-2">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground mb-6">A rota que você acessou não existe no Mobile+.</p>
        <Button asChild className="bg-gradient-primary"><Link to="/app">Voltar ao dashboard</Link></Button>
      </div>
    </div>
  );
}