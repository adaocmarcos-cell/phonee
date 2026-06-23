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
import { Navigate, useLocation } from "react-router-dom";
import MobilePlusLogin from "./pages/mobileplus/Login";
import MobilePlusLayout from "./pages/mobileplus/Layout";
import MobilePlusVisaoGeral from "./pages/mobileplus/VisaoGeral";
import MobilePlusLojas from "./pages/mobileplus/Lojas";
import MobilePlusUsuarios from "./pages/mobileplus/Usuarios";
import MobilePlusAssinaturas from "./pages/mobileplus/Assinaturas";
import MobilePlusFinanceiro from "./pages/mobileplus/Financeiro";
import MobilePlusCrescimento from "./pages/mobileplus/Crescimento";
import AdminMasterRoute from "@/components/layout/AdminMasterRoute";

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
              <Route path="troca" element={<TradeIn />} />
              <Route path="troca/novo" element={<TradeInForm />} />
              <Route path="troca/:id" element={<TradeInForm />} />
              <Route path="pedidos" element={<Pedidos />} />
              <Route path="pedidos/novo" element={<PedidoNovo />} />
              <Route path="vendas" element={<Vendas />} />
              <Route path="vendas/nova" element={<VendaNova />} />
              <Route path="despesas" element={<Despesas />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="lojas" element={<MinhasLojas />} />
              <Route path="estoque/transferencia" element={<TransferenciaProdutos />} />
              <Route path="ordens" element={<OrdensServico />} />
              <Route path="ordens/nova" element={<OrdemServicoForm />} />
              <Route path="ordens/:id" element={<OrdemServicoForm />} />
              <Route path="pecas" element={<PartsInventory />} />
              <Route path="pecas/vendas" element={<VendasPecas />} />
              <Route path="alertas" element={<Alertas />} />
              <Route path="tabelas" element={<TabelasPreco />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="cargos" element={<Cargos />} />
              <Route path="garantias" element={<Garantias />} />
              <Route path="permissoes" element={<ComingSoon title="Permissões" description="Matriz de permissões por cargo × módulo × ação. Disponível na próxima fase." />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="ajustes-estoque" element={<AjustesEstoque />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="pagamentos" element={<PagamentosAsaas />} />
              <Route path="planos" element={<Planos />} />
              <Route path="assinaturas" element={<Assinaturas />} />
              <Route path="logs-pagamento" element={<LogsPagamento />} />
              <Route path="suporte" element={<Suporte />} />
              <Route path="suporte-admin" element={<SuporteAdmin />} />
            </Route>
            {/* Redirects: URLs antigas /app/* -> /painel/* e /auth -> /entrar */}
            <Route path="/auth" element={<Navigate to="/entrar" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/esqueci-senha" replace />} />
            <Route path="/reset-password" element={<Navigate to="/redefinir-senha" replace />} />
            <Route path="/app/*" element={<RedirectAppToPainel />} />
            <Route path="/app" element={<Navigate to="/painel" replace />} />

            {/* Painel oculto Mobile+ (gestor da plataforma) */}
            <Route path="/mobileplus" element={<MobilePlusLogin />} />
            <Route path="/mobileplus" element={<AdminMasterRoute><MobilePlusLayout /></AdminMasterRoute>}>
              <Route path="visao-geral" element={<MobilePlusVisaoGeral />} />
              <Route path="lojas" element={<MobilePlusLojas />} />
              <Route path="usuarios" element={<MobilePlusUsuarios />} />
              <Route path="assinaturas" element={<MobilePlusAssinaturas />} />
              <Route path="financeiro" element={<MobilePlusFinanceiro />} />
              <Route path="crescimento" element={<MobilePlusCrescimento />} />
              <Route path="suporte" element={<SuporteAdmin />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

function RedirectAppToPainel() {
  const { pathname, search, hash } = useLocation();
  const remapped = pathname
    .replace(/^\/app\/admin\/lojas/, "/painel/lojas")
    .replace(/^\/app\/admin\/suporte/, "/painel/suporte-admin")
    .replace(/^\/app\/admin\//, "/painel/")
    .replace(/^\/app\/trade-in/, "/painel/troca")
    .replace(/^\/app\/os/, "/painel/ordens")
    .replace(/^\/app\/tabelas-preco/, "/painel/tabelas")
    .replace(/^\/app/, "/painel");
  return <Navigate to={remapped + search + hash} replace />;
}
