import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserProvider } from "./contexts/UserContext";
import Layout from "./components/Layout";
import ScrollToTop from "./components/ScrollToTop";
import PerfRouteTracker from "./components/PerfRouteTracker";
import Index from "./pages/Index"; // landing page eager (LCP)

// Code-splitting: cada rota vira um chunk sob demanda — reduz drasticamente o JS inicial.
const Solucoes = lazy(() => import("./pages/Solucoes"));
const DiagnosticoRapido = lazy(() => import("./pages/DiagnosticoRapido"));
const SolvenciaReestruturacao = lazy(() => import("./pages/SolvenciaReestruturacao"));
const ConsultoriaCompleta = lazy(() => import("./pages/ConsultoriaCompleta"));
const Insights = lazy(() => import("./pages/Insights"));
const Sobre = lazy(() => import("./pages/Sobre"));
const Contato = lazy(() => import("./pages/Contato"));
const Login = lazy(() => import("./pages/Login"));
const RoleSelection = lazy(() => import("./pages/RoleSelection"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const Audit = lazy(() => import("./pages/Audit"));
const ModeloMatematico = lazy(() => import("./pages/ModeloMatematico"));
const GestorIA = lazy(() => import("./pages/GestorIA"));
const GestaoAgentes = lazy(() => import("./pages/GestaoAgentes"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const ReportView = lazy(() => import("./pages/ReportView"));
const CompanyPage = lazy(() => import("./pages/CompanyPage"));
const Empresas = lazy(() => import("./pages/Empresas"));
const UserEmpresas = lazy(() => import("./pages/UserEmpresas"));
const SolicitarCadastro = lazy(() => import("./pages/SolicitarCadastro"));
const PerfReport = lazy(() => import("./pages/PerfReport"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh] text-sm text-muted-foreground">
    Carregando…
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Site público */}
              <Route path="/" element={<Layout><Index /></Layout>} />
              <Route path="/solucoes" element={<Layout><Solucoes /></Layout>} />
              <Route path="/solucoes/diagnostico-rapido" element={<Layout><DiagnosticoRapido /></Layout>} />
              <Route path="/solucoes/solvencia-reestruturacao" element={<Layout><SolvenciaReestruturacao /></Layout>} />
              <Route path="/solucoes/consultoria-completa" element={<Layout><ConsultoriaCompleta /></Layout>} />
              <Route path="/insights" element={<Layout><Insights /></Layout>} />
              <Route path="/sobre" element={<Layout><Sobre /></Layout>} />
              <Route path="/contato" element={<Layout><Contato /></Layout>} />
              <Route path="/solicitar-cadastro" element={<Layout><SolicitarCadastro /></Layout>} />

              {/* Plataforma de Auditoria */}
              <Route path="/login" element={<Login />} />
              <Route path="/select-role" element={<RoleSelection />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/user" element={<UserDashboard />} />
              <Route path="/user/empresas" element={<UserEmpresas />} />
              <Route path="/user/report/:id" element={<ReportView />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/gestor-ia" element={<GestorIA />} />
              <Route path="/gestor-ia/agentes" element={<GestaoAgentes />} />
              <Route path="/modelo-matematico" element={<ModeloMatematico />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/usuarios" element={<UserManagement />} />
              <Route path="/empresa/:id" element={<CompanyPage />} />
              <Route path="/empresas" element={<Empresas />} />

              <Route path="*" element={<Layout><NotFound /></Layout>} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </UserProvider>
  </QueryClientProvider>
);

export default App;
