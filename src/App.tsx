import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import Auth from "./pages/auth/Auth";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import Dashboard from "./pages/app/Dashboard";
import Estoque from "./pages/app/Estoque";
import ProductForm from "./pages/app/ProductForm";
import Vendas from "./pages/app/Vendas";
import Alertas from "./pages/app/Alertas";
import CurvaABC from "./pages/app/CurvaABC";
import TradeIn from "./pages/app/TradeIn";
import TradeInForm from "./pages/app/TradeInForm";
import Pedidos from "./pages/app/Pedidos";
import PedidoNovo from "./pages/app/PedidoNovo";
import ComingSoon from "./pages/app/ComingSoon";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="estoque" element={<Estoque />} />
              <Route path="estoque/novo" element={<ProductForm />} />
              <Route path="estoque/:id" element={<ProductForm />} />
              <Route path="curva-abc" element={<CurvaABC />} />
              <Route path="trade-in" element={<TradeIn />} />
              <Route path="trade-in/novo" element={<TradeInForm />} />
              <Route path="trade-in/:id" element={<TradeInForm />} />
              <Route path="pedidos" element={<Pedidos />} />
              <Route path="pedidos/novo" element={<PedidoNovo />} />
              <Route path="vendas" element={<Vendas />} />
              <Route path="clientes" element={<ComingSoon title="Clientes" description="CRM básico por CPF." />} />
              <Route path="os" element={<ComingSoon title="Ordens de Serviço" description="Assistência técnica." />} />
              <Route path="alertas" element={<Alertas />} />
              <Route path="catalogo-config" element={<ComingSoon title="Catálogo público" description="Personalize seu minisite." />} />
              <Route path="admin/usuarios" element={<ComingSoon title="Usuários & permissões" description="Gestão de funcionários por perfil." />} />
              <Route path="admin/configuracoes" element={<ComingSoon title="Configurações" description="Configurações gerais da loja." />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
