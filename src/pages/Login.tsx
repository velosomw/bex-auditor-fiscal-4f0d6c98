import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Shield } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const USERS = [
  { email: "auditor@auditor.com.br", password: "Hm4dR92x@bex2025#Aud$", role: "auditor_chefe" as const },
  { email: "usuario@usuario.com.br", password: "Tp7kW31z@bex2025#Usr$", role: "usuario" as const },
  { email: "empresa@empresa.com.br", password: "Qn9fL85v@bex2025#Emp$", role: "empresa" as const },
  { email: "gestor@gestor.com.br", password: "Jx6mB42s@bex2025#Gia$", role: "gestor_ia" as const },
];

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, setRole } = useUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      const user = USERS.find(u => u.email === email && u.password === password);
      if (user) {
        login();
        setRole(user.role);
        if (user.role === "auditor_chefe") navigate("/dashboard");
        else if (user.role === "gestor_ia") navigate("/gestor-ia");
        else navigate("/user");
        toast.success("Login realizado com sucesso!");
      } else {
        toast.error("Credenciais inválidas. Verifique e-mail e senha.");
      }
      setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(220,30%,96%)]">
      {/* Top bar with back button */}
      <div className="px-6 py-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-[hsl(217,91%,50%)] hover:text-[hsl(217,91%,40%)] transition-colors text-sm"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)] text-white">
            <ArrowLeft className="w-4 h-4" />
          </span>
          Voltar para Home
        </button>
      </div>

      {/* Centered content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[hsl(217,91%,50%)] mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[hsl(222,25%,18%)]">Plataforma de</h1>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-[hsl(217,91%,50%)] to-[hsl(200,98%,60%)] bg-clip-text text-transparent">
              Auditoria IA
            </h2>
          </div>

          {/* Card */}
          <div className="bg-white border border-[hsl(220,20%,90%)] rounded-2xl p-8 shadow-lg">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-[hsl(220,15%,40%)] text-sm">E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="auditor@auditor.com.br"
                  className="bg-[hsl(220,30%,96%)] border-[hsl(220,20%,88%)] text-[hsl(222,25%,18%)] placeholder:text-[hsl(220,15%,65%)] focus-visible:ring-[hsl(217,91%,50%)]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[hsl(220,15%,40%)] text-sm">Senha</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-[hsl(220,30%,96%)] border-[hsl(220,20%,88%)] text-[hsl(222,25%,18%)] placeholder:text-[hsl(220,15%,65%)] focus-visible:ring-[hsl(217,91%,50%)] pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(220,15%,55%)] hover:text-[hsl(222,25%,18%)] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full text-white border-0 h-11 text-base font-semibold [background:var(--btn-gradient)] hover:[background:var(--btn-gradient-hover)]"
              >
                {loading ? "Autenticando..." : "Entrar"}
              </Button>
            </form>
          </div>

          {/* Normas */}
          <div className="text-center mt-6">
            <div className="flex items-center justify-center gap-3 text-[hsl(220,15%,55%)] text-xs">
              <span className="px-2 py-1 rounded bg-white border border-[hsl(220,20%,90%)]">CPC</span>
              <span>•</span>
              <span className="px-2 py-1 rounded bg-white border border-[hsl(220,20%,90%)]">IFRS</span>
              <span>•</span>
              <span className="px-2 py-1 rounded bg-white border border-[hsl(220,20%,90%)]">NBC TA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
