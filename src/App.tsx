import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import Auth from "./pages/auth/Auth";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import Comece from "./pages/Comece";
import { Navigate, useLocation } from "react-router-dom";
import { MetaPixel } from "./components/MetaPixel";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { SplashScreen } from "./components/SplashScreen";
import AdminMasterRoute from "@/components/layout/AdminMasterRoute";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";

// Lazy-loaded: layout + páginas do painel ERP e do painel Phonee.
// Landing e telas de auth ficam eager para não atrasar o primeiro paint.
const AppLayout = lazy(() => import("@/components/layout/AppLayout"));
const Comprar = lazy(() => import("./pages/Comprar"));
const ComprarSucesso = lazy(() => import("./pages/ComprarSucesso"));

const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Estoque = lazy(() => import("./pages/app/Estoque"));
const ProductForm = lazy(() => import("./pages/app/ProductForm"));
const EstoqueRelatorio = lazy(() => import("./pages/app/EstoqueRelatorio"));
const EstoqueRelatoriosCentral = lazy(() => import("./pages/app/EstoqueRelatoriosCentral"));
const EstoqueAuditoriaPDF = lazy(() => import("./pages/app/EstoqueAuditoriaPDF"));
const Vendas = lazy(() => import("./pages/app/Vendas"));
const VendaNova = lazy(() => import("./pages/app/VendaNova"));
const Alertas = lazy(() => import("./pages/app/Alertas"));
const CurvaABC = lazy(() => import("./pages/app/CurvaABC"));
const TradeIn = lazy(() => import("./pages/app/TradeIn"));
const TradeInForm = lazy(() => import("./pages/app/TradeInForm"));
const TradeInDetails = lazy(() => import("./pages/app/TradeInDetails"));
const TradeInReconciliacao = lazy(() => import("./pages/app/TradeInReconciliacao"));
const Pedidos = lazy(() => import("./pages/app/Pedidos"));
const PedidoNovo = lazy(() => import("./pages/app/PedidoNovo"));
const Despesas = lazy(() => import("./pages/app/Despesas"));
const Financeiro = lazy(() => import("./pages/app/Financeiro"));
const OrdensServico = lazy(() => import("./pages/app/OrdensServico"));
const OrdemServicoForm = lazy(() => import("./pages/app/OrdemServicoForm"));
const PartsInventory = lazy(() => import("./pages/app/PartsInventory"));
const VendasPecas = lazy(() => import("./pages/app/VendasPecas"));
const Configuracoes = lazy(() => import("./pages/app/Configuracoes"));
const TabelasPreco = lazy(() => import("./pages/app/TabelasPreco"));
const ComingSoon = lazy(() => import("./pages/app/ComingSoon"));
const Usuarios = lazy(() => import("./pages/app/admin/Usuarios"));
const Cargos = lazy(() => import("./pages/app/admin/Cargos"));
const Garantias = lazy(() => import("./pages/app/admin/Garantias"));
const PagamentosAsaas = lazy(() => import("./pages/app/admin/PagamentosAsaas"));
const Planos = lazy(() => import("./pages/app/admin/Planos"));
const Assinaturas = lazy(() => import("./pages/app/admin/Assinaturas"));
const LogsPagamento = lazy(() => import("./pages/app/admin/LogsPagamento"));
const LogsPage = lazy(() => import("./pages/app/admin/Logs"));
const AjustesEstoque = lazy(() => import("./pages/app/admin/AjustesEstoque"));
const Suporte = lazy(() => import("./pages/app/Suporte"));
const Notificacoes = lazy(() => import("./pages/app/Notificacoes"));
const SuporteAdmin = lazy(() => import("./pages/app/admin/SuporteAdmin"));
const Clientes = lazy(() => import("./pages/app/Clientes"));
const MinhasLojas = lazy(() => import("./pages/app/MinhasLojas"));
const TransferenciaProdutos = lazy(() => import("./pages/app/TransferenciaProdutos"));
const Compras = lazy(() => import("./pages/app/Compras"));
const Fornecedores = lazy(() => import("./pages/app/Fornecedores"));
const MeuTeste = lazy(() => import("./pages/app/MeuTeste"));

const PhoneeLogin = lazy(() => import("./pages/phonee/Login"));
const PhoneeLayout = lazy(() => import("./pages/phonee/Layout"));
const PhoneeVisaoGeral = lazy(() => import("./pages/phonee/VisaoGeral"));
const PhoneeLojas = lazy(() => import("./pages/phonee/Lojas"));
const PhoneeUsuarios = lazy(() => import("./pages/phonee/Usuarios"));
const PhoneeAssinaturas = lazy(() => import("./pages/phonee/Assinaturas"));
const PhoneeFinanceiro = lazy(() => import("./pages/phonee/Financeiro"));
const PhoneeCrescimento = lazy(() => import("./pages/phonee/Crescimento"));
const PhoneeLeads = lazy(() => import("./pages/phonee/Leads"));
const PhoneeLeadsAds = lazy(() => import("./pages/phonee/LeadsAds"));
const PhoneeMarketing = lazy(() => import("./pages/phonee/Marketing"));
const PhoneeCupons = lazy(() => import("./pages/phonee/Cupons"));
const PhoneeAuditoria = lazy(() => import("./pages/phonee/Auditoria"));
const PhoneeAssinaturaSolicitacoes = lazy(() => import("./pages/phonee/AssinaturaSolicitacoes"));
const PhoneeAdminMasters = lazy(() => import("./pages/phonee/AdminMasters"));
const PhoneeContas = lazy(() => import("./pages/phonee/Contas"));
const PhoneeDiagnostico = lazy(() => import("./pages/phonee/Diagnostico"));
const PhoneeVinculos = lazy(() => import("./pages/phonee/Vinculos"));
const PhoneeAuditLog = lazy(() => import("./pages/phonee/AuditLog"));

const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
    Carregando…
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SplashScreen />
          <MetaPixel />
          <CookieConsentBanner />
          <ChunkErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/comece" element={<Comece />} />
            <Route path="/entrar" element={<Auth />} />
            <Route path="/esqueci-senha" element={<ForgotPassword />} />
            <Route path="/redefinir-senha" element={<ResetPassword />} />
            <Route path="/comprar" element={<Comprar />} />
            <Route path="/comprar/sucesso/:id" element={<ComprarSucesso />} />
            <Route path="/parceiros" element={<Navigate to="/" replace />} />
            <Route path="/testegratis" element={<Navigate to="/?trial=1" replace />} />
            <Route path="/teste-gratis" element={<Navigate to="/?trial=1" replace />} />
            <Route path="/painel" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="estoque" element={<Estoque />} />
              <Route path="estoque/novo" element={<ProductForm />} />
              <Route path="estoque/relatorio" element={<EstoqueRelatorio />} />
              <Route path="estoque/relatorios" element={<EstoqueRelatoriosCentral />} />
              <Route path="estoque/auditoria-pdf" element={<EstoqueAuditoriaPDF />} />
              <Route path="estoque/:id" element={<ProductForm />} />
              <Route path="curva-abc" element={<CurvaABC />} />
              <Route path="troca" element={<TradeIn />} />
              <Route path="troca/novo" element={<TradeInForm />} />
              <Route path="troca/:id/detalhes" element={<TradeInDetails />} />
              <Route path="troca/:id" element={<TradeInForm />} />
              <Route path="troca/reconciliacao" element={<TradeInReconciliacao />} />
              <Route path="pedidos" element={<Pedidos />} />
              <Route path="pedidos/novo" element={<PedidoNovo />} />
              <Route path="vendas" element={<Vendas />} />
              <Route path="vendas/nova" element={<VendaNova />} />
              <Route path="vendas/:id/editar" element={<VendaNova />} />
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
              <Route path="notificacoes" element={<Notificacoes />} />
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
              <Route path="meu-teste" element={<MeuTeste />} />
            </Route>
            {/* Redirects: URLs antigas /app/* -> /painel/* e /auth -> /entrar */}
            <Route path="/auth" element={<Navigate to="/entrar" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/esqueci-senha" replace />} />
            <Route path="/reset-password" element={<Navigate to="/redefinir-senha" replace />} />
            <Route path="/app/*" element={<RedirectAppToPainel />} />
            <Route path="/app" element={<Navigate to="/painel" replace />} />

            {/* Compat: rota antiga /mobileplus/* -> /phonee/* */}
            <Route path="/mobileplus" element={<Navigate to="/phonee" replace />} />
            <Route path="/mobileplus/*" element={<RedirectMobileplusToPhonee />} />

            {/* Painel oculto Phonee (gestor da plataforma) */}
            <Route path="/phonee" element={<PhoneeLogin />} />
            <Route path="/phonee" element={<AdminMasterRoute><PhoneeLayout /></AdminMasterRoute>}>
              <Route path="visao-geral" element={<PhoneeVisaoGeral />} />
              <Route path="contas" element={<PhoneeContas />} />
              <Route path="lojas" element={<PhoneeLojas />} />
              <Route path="usuarios" element={<PhoneeUsuarios />} />
              <Route path="parceiros" element={<Navigate to="/phonee/contas" replace />} />
              <Route path="assinaturas" element={<PhoneeAssinaturas />} />
              <Route path="financeiro" element={<PhoneeFinanceiro />} />
              <Route path="crescimento" element={<PhoneeCrescimento />} />
              <Route path="leads" element={<PhoneeLeads />} />
              <Route path="leads-ads" element={<PhoneeLeadsAds />} />
              <Route path="marketing" element={<PhoneeMarketing />} />
              <Route path="cupons" element={<PhoneeCupons />} />
              <Route path="suporte" element={<SuporteAdmin />} />
              <Route path="auditoria" element={<PhoneeAuditoria />} />
              <Route path="assinaturas/solicitacoes" element={<PhoneeAssinaturaSolicitacoes />} />
              <Route path="admins" element={<PhoneeAdminMasters />} />
              <Route path="vinculos" element={<PhoneeVinculos />} />
              <Route path="audit-log" element={<PhoneeAuditLog />} />
              <Route path="diagnostico" element={<PhoneeDiagnostico />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ChunkErrorBoundary>
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

function RedirectMobileplusToPhonee() {
  const { pathname, search, hash } = useLocation();
  const remapped = pathname.replace(/^\/mobileplus/, "/phonee");
  return <Navigate to={remapped + search + hash} replace />;
}
