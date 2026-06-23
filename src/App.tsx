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
import Financeiro from "./pages/app/Financeiro";
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
import Suporte from "./pages/app/Suporte";
import SuporteAdmin from "./pages/app/admin/SuporteAdmin";
import Clientes from "./pages/app/Clientes";
import MinhasLojas from "./pages/app/MinhasLojas";
import TransferenciaProdutos from "./pages/app/TransferenciaProdutos";
import Compras from "./pages/app/Compras";
import Fornecedores from "./pages/app/Fornecedores";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import Comprar from "./pages/Comprar";
import ComprarSucesso from "./pages/ComprarSucesso";
import { Navigate, useLocation } from "react-router-dom";
import PhoneeLogin from "./pages/mobileplus/Login";
import PhoneeLayout from "./pages/mobileplus/Layout";
import PhoneeVisaoGeral from "./pages/mobileplus/VisaoGeral";
import PhoneeLojas from "./pages/mobileplus/Lojas";
import PhoneeUsuarios from "./pages/mobileplus/Usuarios";
import PhoneeAssinaturas from "./pages/mobileplus/Assinaturas";
import PhoneeFinanceiro from "./pages/mobileplus/Financeiro";
import PhoneeCrescimento from "./pages/mobileplus/Crescimento";
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
              <Route path="compras" element={<Compras />} />
              <Route path="fornecedores" element={<Fornecedores />} />
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

            {/* Painel oculto Phonee (gestor da plataforma) */}
            <Route path="/mobileplus" element={<PhoneeLogin />} />
            <Route path="/mobileplus" element={<AdminMasterRoute><PhoneeLayout /></AdminMasterRoute>}>
              <Route path="visao-geral" element={<PhoneeVisaoGeral />} />
              <Route path="lojas" element={<PhoneeLojas />} />
              <Route path="usuarios" element={<PhoneeUsuarios />} />
              <Route path="assinaturas" element={<PhoneeAssinaturas />} />
              <Route path="financeiro" element={<PhoneeFinanceiro />} />
              <Route path="crescimento" element={<PhoneeCrescimento />} />
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
