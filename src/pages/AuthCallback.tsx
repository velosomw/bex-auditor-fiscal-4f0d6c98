import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

/**
 * Página de callback após confirmação de e-mail.
 * - Lê tokens do hash (#access_token=...) deixado pelo Supabase
 * - Estabelece sessão e redireciona conforme o papel do usuário
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const { setRole } = useUser();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Validando confirmação...");

  useEffect(() => {
    const run = async () => {
      try {
        // Supabase coloca os tokens em window.location.hash após confirmação
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const params = new URLSearchParams(hash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const type = params.get("type");
        const errDesc = params.get("error_description");

        if (errDesc) throw new Error(errDesc);

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sessão não estabelecida.");

        // Busca papel
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .limit(1);

        const role = roles?.[0]?.role as string | undefined;
        if (role) setRole(role as any);

        setStatus("success");
        setMessage(type === "recovery" ? "Sessão restaurada. Redirecionando..." : "E-mail confirmado! Redirecionando...");

        const target =
          role === "gestor_ia" ? "/gestor-ia"
          : role === "auditor_chefe" || role === "coordenadora" ? "/dashboard"
          : "/user";

        setTimeout(() => navigate(target, { replace: true }), 1200);
      } catch (e: any) {
        console.error("[AuthCallback] erro:", e);
        setStatus("error");
        setMessage(e?.message || "Não foi possível confirmar o e-mail.");
        toast.error("Falha na confirmação. Tente novamente ou contate o suporte.");
        setTimeout(() => navigate("/login", { replace: true }), 2500);
      }
    };
    void run();
  }, [navigate, setRole]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(220,30%,96%)] px-4">
      <div className="w-full max-w-md bg-white border border-[hsl(220,20%,90%)] rounded-2xl p-10 shadow-lg text-center space-y-4">
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ${
          status === "success" ? "bg-emerald-500" : status === "error" ? "bg-red-500" : "bg-[hsl(217,91%,50%)]"
        }`}>
          {status === "loading" && <Loader2 className="w-7 h-7 text-white animate-spin" />}
          {status === "success" && <CheckCircle2 className="w-7 h-7 text-white" />}
          {status === "error" && <AlertTriangle className="w-7 h-7 text-white" />}
        </div>
        <h1 className="text-xl font-semibold text-[hsl(222,25%,18%)]">
          {status === "success" ? "Tudo certo!" : status === "error" ? "Algo deu errado" : "Aguarde..."}
        </h1>
        <p className="text-sm text-[hsl(220,15%,50%)]">{message}</p>
      </div>
    </div>
  );
};

export default AuthCallback;
