import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { StoreSubscriptionBanner } from "./StoreSubscriptionBanner";
import { Bell, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AppLayout() {
  const { user, store, role, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/entrar");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border bg-surface/40 backdrop-blur px-4 sticky top-0 z-30">
            <SidebarTrigger />
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto, SKU, IMEI, cliente…"
                className="pl-9 h-9 bg-background/60 border-border"
              />
            </div>
            <div className="flex items-center gap-2">
              {store && (
                <Badge variant="outline" className="border-border text-muted-foreground hidden md:inline-flex">
                  {store.name}
                </Badge>
              )}
              <Button variant="ghost" size="icon" onClick={() => navigate("/painel/alertas")}>
                <Bell className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 px-2 gap-2">
                    <Avatar className="h-7 w-7">
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
            </div>
          </header>
          <StoreSubscriptionBanner />
          <main className="flex-1 p-6 overflow-auto" key={store?.id ?? "no-store"}>
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}