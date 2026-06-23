import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import EstoqueRelatorio from "./pages/app/EstoqueRelatorio";
import Vendas from "./pages/app/Vendas";
import VendaNova from "./pages/app/VendaNova";
import Alertas from "./pages/app/Alertas";
import CurvaABC from "./pages/app/CurvaABC";
import TradeIn from "./pages/app/TradeIn";
import TradeInForm from "./pages/app/TradeInForm";
import Pedidos from "./pages/app/Pedidos";
import PedidoNovo from "./pages/app/PedidoNovo";
import Despesas from "./pages/app/Despesas";
import OrdensServico from "./pages/app/OrdensServico";
import OrdemServicoForm from "./pages/app/OrdemServicoForm";
import PartsInventory from "./pages/app/PartsInventory";
import VendasPecas from "./pages/app/VendasPecas";
import Configuracoes from "./pages/app/Configuracoes";
import TabelasPreco from "./pages/app/TabelasPreco";
import ComingSoon from "./pages/app/ComingSoon";
import Usuarios from "./pages/app/admin/Usuarios";
import Cargos from "./pages/app/admin/Cargos";
import Garantias from "./pages/app/admin/Garantias";
import PagamentosAsaas from "./pages/app/admin/PagamentosAsaas";
import Planos from "./pages/app/admin/Planos";
import Assinaturas from "./pages/app/admin/Assinaturas";
import LogsPagamento from "./pages/app/admin/LogsPagamento";
import LogsPage from "./pages/app/admin/Logs";
import AjustesEstoque from "./pages/app/admin/AjustesEstoque";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import Comprar from "./pages/Comprar";
import ComprarSucesso from "./pages/ComprarSucesso";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/comprar" element={<Comprar />} />
            <Route path="/comprar/sucesso/:id" element={<ComprarSucesso />} />
            <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="estoque" element={<Estoque />} />
              <Route path="estoque/novo" element={<ProductForm />} />
              <Route path="estoque/relatorio" element={<EstoqueRelatorio />} />
              <Route path="estoque/:id" element={<ProductForm />} />
              <Route path="curva-abc" element={<CurvaABC />} />
              <Route path="trade-in" element={<TradeIn />} />
              <Route path="trade-in/novo" element={<TradeInForm />} />
              <Route path="trade-in/:id" element={<TradeInForm />} />
              <Route path="pedidos" element={<Pedidos />} />
              <Route path="pedidos/novo" element={<PedidoNovo />} />
              <Route path="vendas" element={<Vendas />} />
              <Route path="vendas/nova" element={<VendaNova />} />
              <Route path="despesas" element={<Despesas />} />
              <Route path="clientes" element={<ComingSoon title="Clientes" description="CRM básico por CPF." />} />
              <Route path="os" element={<OrdensServico />} />
              <Route path="os/nova" element={<OrdemServicoForm />} />
              <Route path="os/:id" element={<OrdemServicoForm />} />
              <Route path="pecas" element={<PartsInventory />} />
              <Route path="pecas/vendas" element={<VendasPecas />} />
              <Route path="alertas" element={<Alertas />} />
              <Route path="tabelas-preco" element={<TabelasPreco />} />
              <Route path="admin/usuarios" element={<Usuarios />} />
              <Route path="admin/cargos" element={<Cargos />} />
              <Route path="admin/garantias" element={<Garantias />} />
              <Route path="admin/permissoes" element={<ComingSoon title="Permissões" description="Matriz de permissões por cargo × módulo × ação. Disponível na próxima fase." />} />
              <Route path="admin/logs" element={<LogsPage />} />
              <Route path="admin/ajustes-estoque" element={<AjustesEstoque />} />
              <Route path="admin/configuracoes" element={<Configuracoes />} />
              <Route path="admin/pagamentos" element={<PagamentosAsaas />} />
              <Route path="admin/planos" element={<Planos />} />
              <Route path="admin/assinaturas" element={<Assinaturas />} />
              <Route path="admin/logs-pagamento" element={<LogsPagamento />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
