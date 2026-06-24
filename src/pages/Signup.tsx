import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, UserPlus, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoBEx from "@/assets/marca_logo_BEx.jpeg";

const FREE_DOMAINS = new Set<string>([]); // E-mails pessoais agora são permitidos

const Signup = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selectedPlan = params.get("plan") || "pro";
  const redirectAfter = params.get("redirect") || (selectedPlan === "enterprise" ? "/minha-assinatura?upgrade=enterprise" : "/user");
  const loginHref = `/login?redirect=${encodeURIComponent(redirectAfter)}`;
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [crc, setCrc] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resending, setResending] = useState(false);

  const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

  const formatCpf = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    let out = d;
    if (d.length > 9) out = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
    else if (d.length > 6) out = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    else if (d.length > 3) out = `${d.slice(0,3)}.${d.slice(3)}`;
    return out;
  };

  const formatCrc = (v: string) => {
    const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const uf = raw.slice(0, 2).replace(/[^A-Z]/g, "");
    const num = raw.slice(uf.length).replace(/\D/g, "").slice(0, 12);
    if (!uf) return "";
    if (!num) return uf;
    return `${uf}-${num}`;
  };

  const isValidCrc = (v: string) => {
    const m = v.match(/^([A-Z]{2})-(\d{10,12})$/);
    return !!m && UFS.includes(m[1]);
  };

  const isValidCpf = (v: string) => v.replace(/\D/g, "").length === 11;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = email.split("@")[1]?.toLowerCase().trim();
    if (!domain) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (FREE_DOMAINS.has(domain)) {
      toast.error("Use um e-mail comercial (corporativo). E-mails pessoais não são aceitos.");
      return;
    }
    if (password.length < 8) {
      toast.error("A senha deve ter ao menos 8 caracteres.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectAfter)}`,
        data: {
          full_name: fullName,
          company_name: companyName,
          cnpj: cnpj,
          signup_source: "public",
        },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message.includes("already registered")
        ? "Este e-mail já possui cadastro. Use o login."
        : "Não foi possível concluir o cadastro. Tente novamente.");
      return;
    }
    setSubmitted(true);
  };

  const handleResendEmail = async () => {
    if (!email) {
      toast.error("Informe seu e-mail.");
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      }
    });
    setResending(false);

    if (error) {
      toast.error("Erro ao reenviar: " + error.message);
    } else {
      toast.success("Novo link de confirmação enviado!");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(220,30%,96%)]">
      <header className="bg-white border-b border-[hsl(220,20%,90%)] px-6 py-3">
        <img src={logoBEx} alt="Brasil Expert" className="h-10 w-auto object-contain" />
      </header>

      <div className="px-6 py-4">
        <button
          onClick={() => navigate("/login")}
          className="flex items-center gap-2 text-[hsl(217,91%,50%)] hover:text-[hsl(217,91%,40%)] transition-colors text-sm"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)] text-white">
            <ArrowLeft className="w-4 h-4" />
          </span>
          Voltar para Login
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[hsl(217,91%,50%)] mb-4">
              {submitted ? <MailCheck className="w-8 h-8 text-white" /> : <UserPlus className="w-8 h-8 text-white" />}
            </div>
            <h1 className="text-2xl font-bold text-[hsl(222,25%,18%)]">
              {submitted ? "Confirme seu e-mail" : "Criar conta — Contabilidade"}
            </h1>
            <p className="text-sm text-[hsl(220,15%,50%)] mt-1">
              {submitted
                ? "Enviamos um link de confirmação para sua caixa de entrada."
                : "Acesso para escritórios e profissionais contábeis."}
            </p>
          </div>

          <div className="bg-white border border-[hsl(220,20%,90%)] rounded-2xl p-8 shadow-lg">
            {submitted ? (
              <div className="space-y-4 text-sm text-[hsl(220,15%,40%)]">
                <p>
                  Acesse o e-mail <strong className="text-[hsl(222,25%,18%)]">{email}</strong> e clique no link de confirmação que enviamos.
                  Após confirmar, você será redirecionado automaticamente para a plataforma.
                </p>
                <p className="text-xs text-[hsl(220,15%,55%)]">
                  Não recebeu? Verifique a pasta de spam/lixo eletrônico. O link expira em 24h.
                </p>
                <div className="space-y-3">
                  <Button 
                    onClick={handleResendEmail} 
                    disabled={resending}
                    variant="outline"
                    className="w-full border-[hsl(217,91%,50%)] text-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,98%)] h-11"
                  >
                    {resending ? "Reenviando..." : "Reenviar e-mail de confirmação"}
                  </Button>
                  <Button onClick={() => navigate("/login")} className="w-full text-white border-0 h-11 [background:var(--btn-gradient)] hover:[background:var(--btn-gradient-hover)]">
                    Ir para o login
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[hsl(220,15%,40%)] text-sm">Nome completo</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required
                    placeholder="Seu nome"
                    className="bg-[hsl(220,30%,96%)] border-[hsl(220,20%,88%)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[hsl(220,15%,40%)] text-sm">Escritório / Contabilidade</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required
                    placeholder="Razão social do escritório"
                    className="bg-[hsl(220,30%,96%)] border-[hsl(220,20%,88%)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[hsl(220,15%,40%)] text-sm">CNPJ</Label>
                  <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="bg-[hsl(220,30%,96%)] border-[hsl(220,20%,88%)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[hsl(220,15%,40%)] text-sm">E-mail</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    placeholder="voce@email.com"
                    className="bg-[hsl(220,30%,96%)] border-[hsl(220,20%,88%)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[hsl(220,15%,40%)] text-sm">Senha (mín. 8 caracteres)</Label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} value={password}
                      onChange={(e) => setPassword(e.target.value)} required minLength={8}
                      className="bg-[hsl(220,30%,96%)] border-[hsl(220,20%,88%)] pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(220,15%,55%)]">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" disabled={loading}
                  className="w-full text-white border-0 h-11 text-base font-semibold [background:var(--btn-gradient)] hover:[background:var(--btn-gradient-hover)]">
                  {loading ? "Criando conta..." : "Criar conta"}
                </Button>

                <p className="text-xs text-center text-[hsl(220,15%,55%)]">
                  Já tem conta?{" "}
                  <Link to="/login" className="text-[hsl(217,91%,50%)] hover:underline">Entrar</Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
