import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Shield } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoBEx from "@/assets/marca_logo_BEx.jpeg";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const navigate = useNavigate();
  const { setRole } = useUser();

  const getRedirectPath = (role: string) => {
    if (role === "gestor_ia") return "/gestor-ia";
    if (role === "auditor_chefe" || role === "coordenadora") return "/dashboard";
    return "/user"; // usuario, empresa, contabilidade
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error("Credenciais inválidas. Verifique e-mail e senha.");
      setLoading(false);
      return;
    }

    if (data.user) {
      // Reaproveita a sessão recém-criada — não refaz fetch (UserContext já dispara via onAuthStateChange).
      // Busca role uma única vez para definir o redirect.
      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .limit(1)
        .maybeSingle();

      if (roleError) {
        toast.error("Login realizado, mas houve erro ao carregar o perfil de acesso.");
        setLoading(false);
        return;
      }

      if (roles?.role) {
        const role = roles.role as string;
        setRole(role as any);
        toast.success("Login realizado com sucesso!");
        navigate(getRedirectPath(role), { replace: true });
      } else {
        toast.error("Login autenticado, mas este usuário está sem perfil vinculado no sistema.");
      }
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Informe seu e-mail.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error("Erro ao enviar e-mail de recuperação.");
    } else {
      toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(220,30%,96%)]">
      {/* Header with brand only */}
      <header className="bg-white border-b border-[hsl(220,20%,90%)] px-6 py-3">
        <img src={logoBEx} alt="Brasil Expert" className="h-10 w-auto object-contain" />
      </header>

      {/* Back button */}
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
              Contábil IA
            </h2>
          </div>

          {/* Card */}
          <div className="bg-white border border-[hsl(220,20%,90%)] rounded-2xl p-8 shadow-lg">
            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-[hsl(220,15%,40%)] text-sm">E-mail</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com.br"
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

                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="w-full text-center text-sm text-[hsl(220,15%,50%)] hover:text-[hsl(217,91%,50%)] transition-colors"
                >
                  Esqueci minha senha
                </button>

                <div className="pt-3 border-t border-[hsl(220,20%,90%)] text-center text-sm text-[hsl(220,15%,50%)]">
                  Não tem conta?{" "}
                  <Link to="/signup" className="font-semibold text-[hsl(217,91%,50%)] hover:underline">
                    Criar conta de Contabilidade
                  </Link>
                </div>
              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="text-center mb-2">
                  <h3 className="text-lg font-semibold text-[hsl(222,25%,18%)]">Recuperar Senha</h3>
                  <p className="text-sm text-[hsl(220,15%,50%)]">Informe seu e-mail para receber o link de recuperação.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-[hsl(220,15%,40%)] text-sm">E-mail</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com.br"
                    className="bg-[hsl(220,30%,96%)] border-[hsl(220,20%,88%)] text-[hsl(222,25%,18%)] placeholder:text-[hsl(220,15%,65%)] focus-visible:ring-[hsl(217,91%,50%)]"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white border-0 h-11 text-base font-semibold [background:var(--btn-gradient)] hover:[background:var(--btn-gradient-hover)]"
                >
                  {loading ? "Enviando..." : "Enviar Link de Recuperação"}
                </Button>

                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="w-full text-center text-sm text-[hsl(220,15%,50%)] hover:text-[hsl(217,91%,50%)] transition-colors"
                >
                  Voltar para o login
                </button>
              </form>
            )}
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
