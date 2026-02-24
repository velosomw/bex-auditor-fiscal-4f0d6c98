import { useNavigate } from "react-router-dom";
import { Shield, User } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { motion } from "framer-motion";

const RoleSelection = () => {
  const { setRole, authenticated } = useUser();
  const navigate = useNavigate();

  if (!authenticated) {
    navigate("/login");
    return null;
  }

  const selectRole = (role: "auditor_chefe" | "usuario" | "empresa") => {
    setRole(role);
    navigate(role === "auditor_chefe" ? "/dashboard" : "/user");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(230,30%,12%)] via-[hsl(258,40%,18%)] to-[hsl(230,25%,15%)] px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Selecione seu Perfil</h1>
          <p className="text-[hsl(230,15%,55%)]">Escolha como deseja acessar a plataforma</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              role: "auditor_chefe" as const,
              icon: Shield,
              title: "Auditor Chefe",
              desc: "Dashboard consolidado de todas as auditorias. Visão gerencial com KPIs, tendências e alertas.",
              color: "hsl(258,90%,66%)",
            },
            {
              role: "empresa" as const,
              icon: User,
              title: "Empresa",
              desc: "Dashboard simplificado com suas auditorias contábeis. Acompanhe conformidade e documentos.",
              color: "hsl(38,92%,50%)",
            },
            {
              role: "usuario" as const,
              icon: User,
              title: "Usuário",
              desc: "Dashboard simplificado com suas auditorias. Acesso ao fluxo de auditoria em 5 etapas.",
              color: "hsl(200,98%,55%)",
            },
          ].map((item, i) => (
            <motion.button
              key={item.role}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15 }}
              onClick={() => selectRole(item.role)}
              className="group bg-[hsl(230,25%,18%)]/80 backdrop-blur-sm border border-[hsl(230,20%,25%)] rounded-2xl p-8 text-left hover:border-[hsl(258,60%,50%)] hover:bg-[hsl(230,25%,20%)]/80 transition-all duration-300 hover:-translate-y-1"
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-5"
                style={{ backgroundColor: `${item.color}20` }}
              >
                <item.icon className="w-7 h-7" style={{ color: item.color }} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
              <p className="text-sm text-[hsl(230,15%,55%)] leading-relaxed">{item.desc}</p>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;
