import { ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Shield, User, LogOut, ArrowLeft, Settings, Brain, Eye, EyeOff } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const PlatformLayout = ({ children }: { children: ReactNode }) => {
  const { role, realRole, viewAsRole, isReadOnly, setViewAsRole, logout } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const isAuditPage = location.pathname === "/audit";
  const showBack =
    isAuditPage ||
    (role === "usuario" && location.pathname !== "/user") ||
    (role === "auditor_chefe" && location.pathname !== "/dashboard") ||
    (role === "gestor_ia" && location.pathname !== "/gestor-ia");

  const canImpersonate = realRole === "auditor_chefe";

  const handleViewAs = (target: "usuario" | "empresa" | null) => {
    setViewAsRole(target);
    // Send the user to the matching dashboard so the impersonated view loads.
    if (target === "usuario" || target === "empresa") {
      navigate("/user");
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(220,30%,98%)]">
      {/* Platform Header */}
      <header className="sticky top-0 z-50 bg-[hsl(222,25%,18%)]/95 backdrop-blur-md border-b border-[hsl(222,20%,25%)]">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center gap-3">
            {showBack && (
              <button
                onClick={() => navigate(-1)}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white transition-colors mr-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Link to={role === "gestor_ia" ? "/gestor-ia" : role === "auditor_chefe" ? "/dashboard" : "/user"} className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[hsl(217,91%,50%)]" />
              <span className="font-bold text-white text-sm">BEX Contábil IA</span>
            </Link>
            <span className="hidden md:inline-flex text-[hsl(220,15%,45%)] text-xs gap-1.5 ml-3">
              <span>CPC</span>•<span>IFRS</span>•<span>NBC TA</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* "Visualizar como" — somente para Auditor Chefe */}
            {canImpersonate && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1.5 text-white hover:bg-[hsl(222,25%,22%)]"
                  >
                    <Eye className="w-3.5 h-3.5 text-[hsl(38,92%,50%)]" />
                    <span className="hidden sm:inline">
                      {viewAsRole ? `Visualizando: ${viewAsRole === "empresa" ? "Contabilidade" : "Usuário"}` : "Visualizar como"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-xs">Modo de Visualização</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleViewAs(null)}
                    className="gap-2 text-xs"
                  >
                    <Shield className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
                    <div className="flex-1">
                      <p className="font-medium">Auditor Chefe</p>
                      <p className="text-[10px] text-muted-foreground">Acesso completo (padrão)</p>
                    </div>
                    {!viewAsRole && <Badge variant="outline" className="text-[9px]">Atual</Badge>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleViewAs("empresa")}
                    className="gap-2 text-xs"
                  >
                    <User className="w-3.5 h-3.5 text-[hsl(38,92%,50%)]" />
                    <div className="flex-1">
                      <p className="font-medium">Contabilidade (Empresa)</p>
                      <p className="text-[10px] text-muted-foreground">Somente leitura</p>
                    </div>
                    {viewAsRole === "empresa" && <Badge variant="outline" className="text-[9px]">Atual</Badge>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleViewAs("usuario")}
                    className="gap-2 text-xs"
                  >
                    <User className="w-3.5 h-3.5 text-[hsl(200,98%,55%)]" />
                    <div className="flex-1">
                      <p className="font-medium">Usuário</p>
                      <p className="text-[10px] text-muted-foreground">Somente leitura</p>
                    </div>
                    {viewAsRole === "usuario" && <Badge variant="outline" className="text-[9px]">Atual</Badge>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

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
                  {role === "gestor_ia" ? "Gestor IA" : role === "auditor_chefe" ? "Auditor Chefe" : role === "empresa" ? "Contabilidade" : "Usuário"}
                </span>
              </div>
            )}
            <button className="p-2 text-[hsl(220,15%,50%)] hover:text-white transition-colors">
              <Settings className="w-4 h-4" />
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { logout(); navigate("/"); }}
              className="text-[hsl(220,15%,50%)] hover:text-white hover:bg-[hsl(222,25%,22%)] text-xs gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Banner de impersonação somente leitura */}
      {isReadOnly && (
        <div className="bg-[hsl(38,92%,50%)]/15 border-b border-[hsl(38,92%,50%)]/40">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-2 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <Eye className="w-3.5 h-3.5 text-[hsl(38,92%,50%)]" />
              <span className="font-medium text-foreground">
                Visualizando como {viewAsRole === "empresa" ? "Contabilidade" : "Usuário"}
              </span>
              <span className="text-muted-foreground hidden sm:inline">
                — modo somente leitura. Edições e cadastros estão desabilitados.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleViewAs(null)}
              className="h-7 text-[11px] gap-1.5 border-[hsl(38,92%,50%)]/40"
            >
              <EyeOff className="w-3 h-3" /> Sair da visualização
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1">{children}</main>

      {/* Platform Footer */}
      <footer className="bg-[hsl(222,25%,14%)] border-t border-[hsl(222,20%,22%)] py-4 px-6 text-center text-xs text-[hsl(220,15%,40%)]">
        © {new Date().getFullYear()} BEX Contábil IA — Inteligência de Dados. BEX Auditoria.
      </footer>
    </div>
  );
};

export default PlatformLayout;
