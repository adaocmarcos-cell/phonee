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
import Dashboard from "./pages/painel/Dashboard";
import Estoque from "./pages/painel/Estoque";
import ProductForm from "./pages/painel/ProductForm";
import EstoqueRelatorio from "./pages/painel/EstoqueRelatorio";
import Vendas from "./pages/painel/Vendas";
import VendaNova from "./pages/painel/VendaNova";
import Alertas from "./pages/painel/Alertas";
import CurvaABC from "./pages/painel/CurvaABC";
import TradeIn from "./pages/painel/TradeIn";
import TradeInForm from "./pages/painel/TradeInForm";
import Pedidos from "./pages/painel/Pedidos";
import PedidoNovo from "./pages/painel/PedidoNovo";
import Despesas from "./pages/painel/Despesas";
import Financeiro from "./pages/painel/Financeiro";
import OrdensServico from "./pages/painel/OrdensServico";
import OrdemServicoForm from "./pages/painel/OrdemServicoForm";
import PartsInventory from "./pages/painel/PartsInventory";
import VendasPecas from "./pages/painel/VendasPecas";
import Configuracoes from "./pages/painel/Configuracoes";
import TabelasPreco from "./pages/painel/TabelasPreco";
import ComingSoon from "./pages/painel/ComingSoon";
import Usuarios from "./pages/painel/admin/Usuarios";
import Cargos from "./pages/painel/admin/Cargos";
import Garantias from "./pages/painel/admin/Garantias";
import PagamentosAsaas from "./pages/painel/admin/PagamentosAsaas";
import Planos from "./pages/painel/admin/Planos";
import Assinaturas from "./pages/painel/admin/Assinaturas";
import LogsPagamento from "./pages/painel/admin/LogsPagamento";
import LogsPage from "./pages/painel/admin/Logs";
import AjustesEstoque from "./pages/painel/admin/AjustesEstoque";
import Suporte from "./pages/painel/Suporte";
import SuporteAdmin from "./pages/painel/admin/SuporteAdmin";
import Clientes from "./pages/painel/Clientes";
import MinhasLojas from "./pages/painel/MinhasLojas";
import TransferenciaProdutos from "./pages/painel/TransferenciaProdutos";
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
            <Route path="/entrar" element={<Auth />} />
            <Route path="/esqueci-senha" element={<ForgotPassword />} />
            <Route path="/redefinir-senha" element={<ResetPassword />} />
            <Route path="/comprar" element={<Comprar />} />
            <Route path="/comprar/sucesso/:id" element={<ComprarSucesso />} />
            <Route path="/painel" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
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
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="admin/lojas" element={<MinhasLojas />} />
              <Route path="estoque/transferencia" element={<TransferenciaProdutos />} />
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
              <Route path="suporte" element={<Suporte />} />
              <Route path="admin/suporte" element={<SuporteAdmin />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
