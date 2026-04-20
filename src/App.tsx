import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserProvider } from "./contexts/UserContext";
import Layout from "./components/Layout";
import Index from "./pages/Index";
import Solucoes from "./pages/Solucoes";
import DiagnosticoRapido from "./pages/DiagnosticoRapido";
import SolvenciaReestruturacao from "./pages/SolvenciaReestruturacao";
import ConsultoriaCompleta from "./pages/ConsultoriaCompleta";
import Insights from "./pages/Insights";
import Sobre from "./pages/Sobre";
import Contato from "./pages/Contato";
import Login from "./pages/Login";
import RoleSelection from "./pages/RoleSelection";
import Dashboard from "./pages/Dashboard";
import UserDashboard from "./pages/UserDashboard";
import Audit from "./pages/Audit";
import ModeloMatematico from "./pages/ModeloMatematico";
import GestorIA from "./pages/GestorIA";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import UserManagement from "./pages/UserManagement";
import ReportView from "./pages/ReportView";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
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

            {/* Plataforma de Auditoria */}
            <Route path="/login" element={<Login />} />
            <Route path="/select-role" element={<RoleSelection />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/user" element={<UserDashboard />} />
            <Route path="/user/report/:id" element={<ReportView />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/gestor-ia" element={<GestorIA />} />
            <Route path="/modelo-matematico" element={<ModeloMatematico />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/usuarios" element={<UserManagement />} />

            <Route path="*" element={<Layout><NotFound /></Layout>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </UserProvider>
  </QueryClientProvider>
);

export default App;
