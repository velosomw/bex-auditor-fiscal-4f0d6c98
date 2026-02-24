import { ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Shield, User, LogOut, ArrowLeft, Settings } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";

const PlatformLayout = ({ children }: { children: ReactNode }) => {
  const { role, logout } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const isAuditPage = location.pathname === "/audit";
  const showBack = isAuditPage || (role === "usuario" && location.pathname !== "/user") || (role === "auditor_chefe" && location.pathname !== "/dashboard");

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(230,30%,98%)]">
      {/* Platform Header */}
      <header className="sticky top-0 z-50 bg-[hsl(230,25%,18%)]/95 backdrop-blur-md border-b border-[hsl(230,20%,25%)]">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center gap-3">
            {showBack && (
              <button onClick={() => navigate(-1)} className="text-[hsl(230,15%,55%)] hover:text-white transition-colors mr-1">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Link to={role === "auditor_chefe" ? "/dashboard" : "/user"} className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[hsl(258,90%,66%)]" />
              <span className="font-bold text-white text-sm">Plataforma de Auditoria IA</span>
            </Link>
            <span className="hidden md:inline-flex text-[hsl(230,15%,45%)] text-xs gap-1.5 ml-3">
              <span>CPC</span>•<span>IFRS</span>•<span>NBC TA</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {role && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(230,25%,22%)] border border-[hsl(230,20%,28%)]">
                {role === "auditor_chefe" ? (
                  <Shield className="w-3.5 h-3.5 text-[hsl(258,90%,66%)]" />
                ) : (
                  <User className="w-3.5 h-3.5 text-[hsl(200,98%,55%)]" />
                )}
                <span className="text-xs font-medium text-white hidden sm:inline">
                  {role === "auditor_chefe" ? "Auditor Chefe" : "Usuário"}
                </span>
              </div>
            )}
            <button className="p-2 text-[hsl(230,15%,50%)] hover:text-white transition-colors">
              <Settings className="w-4 h-4" />
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { logout(); navigate("/login"); }}
              className="text-[hsl(230,15%,50%)] hover:text-white hover:bg-[hsl(230,25%,22%)] text-xs gap-1.5"
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
      <footer className="bg-[hsl(230,25%,14%)] border-t border-[hsl(230,20%,22%)] py-4 px-6 text-center text-xs text-[hsl(230,15%,40%)]">
        © {new Date().getFullYear()} Plataforma de Auditoria IA — Inteligência de Dados. BEX Auditoria.
      </footer>
    </div>
  );
};

export default PlatformLayout;
