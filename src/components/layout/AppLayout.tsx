import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { StoreSubscriptionBanner } from "./StoreSubscriptionBanner";
import { TrialExpiryBanner } from "@/components/billing/TrialExpiryBanner";
import { Bell, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { DemoBanner } from "./DemoBanner";
import { isDemoMode, isDemoUserEmail, clearDemoMode } from "@/lib/demoMode";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AppLayout() {
  const { user, store, role, signOut } = useAuth();
  const navigate = useNavigate();
  const demo = isDemoMode() || isDemoUserEmail(user?.email);

  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    clearDemoMode();
    await signOut();
    navigate(demo ? "/" : "/entrar");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {demo && <DemoBanner />}
          <header className="h-14 flex items-center gap-2 sm:gap-3 border-b border-border bg-surface/40 backdrop-blur px-3 sm:px-4 sticky top-0 z-30">
            <SidebarTrigger />
            <div className="flex-1 max-w-md relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[1.15rem] w-[1.15rem] text-muted-foreground" />
              <Input
                placeholder="Buscar produto, SKU, IMEI, cliente…"
                className="pl-10 h-9 bg-background/60 border-border"
              />
            </div>
            <div className="flex-1 sm:hidden" />
            <div className="flex items-center gap-1 sm:gap-2">
              {store && (
                <Badge variant="outline" className="border-border text-muted-foreground hidden md:inline-flex">
                  {store.name}
                </Badge>
              )}
              <Button variant="ghost" size="icon" onClick={() => navigate("/painel/alertas")}>
                <Bell className="h-[1.15rem] w-[1.15rem]" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 px-1.5 sm:px-2 gap-2">
                    <Avatar className="h-[2.1rem] w-[2.1rem]">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start leading-tight">
                      <span className="text-xs font-medium truncate max-w-[140px]">{user?.email}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {role === "dono" ? "Administrador" : (role ?? "—")}
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/painel/configuracoes")}>Configurações</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut} className="text-danger focus:text-danger">
                    <LogOut className="h-4 w-4 mr-2" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="hidden sm:inline-flex h-9 gap-1.5 border-border text-muted-foreground hover:text-danger hover:border-danger/50"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </Button>
            </div>
          </header>
          <StoreSubscriptionBanner />
          <TrialExpiryBanner />
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto overflow-x-hidden" key={store?.id ?? "no-store"}>
            <Outlet />
          </main>
          <footer className="border-t border-border bg-surface/40 px-4 py-2.5">
            <div className="max-w-5xl mx-auto rounded-xl border border-border bg-background/40 px-4 py-2 text-[11px] md:text-xs text-muted-foreground text-center leading-snug">
              <span className="font-semibold text-foreground">Use como app:</span>{" "}
              <span className="md:hidden">
                iPhone (Safari): Compartilhar → "Adicionar à Tela de Início".<br />
                Android (Chrome): menu ⋮ → "Adicionar à tela inicial".
              </span>
              <span className="hidden md:inline">
                iPhone/Safari: Compartilhar → "Adicionar à Tela de Início" · Android/Chrome: menu ⋮ → "Adicionar à tela inicial".
              </span>
            </div>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}