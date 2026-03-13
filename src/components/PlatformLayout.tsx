import { ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Shield, User, LogOut, ArrowLeft, Settings, Brain } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";

const PlatformLayout = ({ children }: { children: ReactNode }) => {
  const { role, logout } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const isAuditPage = location.pathname === "/audit";
  const showBack = isAuditPage || (role === "usuario" && location.pathname !== "/user") || (role === "auditor_chefe" && location.pathname !== "/dashboard") || (role === "gestor_ia" && location.pathname !== "/gestor-ia");

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(220,30%,98%)]">
      {/* Platform Header */}
      <header className="sticky top-0 z-50 bg-[hsl(222,25%,18%)]/95 backdrop-blur-md border-b border-[hsl(222,20%,25%)]">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center gap-3">
            {showBack && (
              <button onClick={() => navigate(-1)} className="text-[hsl(220,15%,55%)] hover:text-white transition-colors mr-1">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Link to={role === "gestor_ia" ? "/gestor-ia" : role === "auditor_chefe" ? "/dashboard" : "/user"} className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[hsl(217,91%,50%)]" />
              <span className="font-bold text-white text-sm">BEX Auditoria IA</span>
            </Link>
            <span className="hidden md:inline-flex text-[hsl(220,15%,45%)] text-xs gap-1.5 ml-3">
              <span>CPC</span>•<span>IFRS</span>•<span>NBC TA</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {role && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(222,25%,22%)] border border-[hsl(222,20%,28%)]">
                {role === "gestor_ia" ? (
                  <Brain className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
                ) : role === "auditor_chefe" ? (
                  <Shield className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
                ) : (
                  <User className="w-3.5 h-3.5 text-[hsl(200,98%,55%)]" />
                )}
                <span className="text-xs font-medium text-white hidden sm:inline">
                  {role === "gestor_ia" ? "Gestor IA" : role === "auditor_chefe" ? "Auditor Chefe" : role === "empresa" ? "Empresa" : "Usuário"}
                </span>
              </div>
            )}
            <button className="p-2 text-[hsl(220,15%,50%)] hover:text-white transition-colors">
              <Settings className="w-4 h-4" />
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { logout(); navigate("/login"); }}
              className="text-[hsl(220,15%,50%)] hover:text-white hover:bg-[hsl(222,25%,22%)] text-xs gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">{children}</main>

      {/* Platform Footer */}
      <footer className="bg-[hsl(222,25%,14%)] border-t border-[hsl(222,20%,22%)] py-4 px-6 text-center text-xs text-[hsl(220,15%,40%)]">
        © {new Date().getFullYear()} Plataforma de Auditoria IA — Inteligência de Dados. BEX Auditoria.
      </footer>
    </div>
  );
};

export default PlatformLayout;
