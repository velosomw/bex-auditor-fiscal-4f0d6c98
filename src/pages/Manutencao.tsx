import { Shield, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Manutencao = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(222,40%,12%)] via-[hsl(220,45%,18%)] to-[hsl(217,40%,15%)] px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[hsl(38,92%,50%)]/15 mb-6">
          <Wrench className="w-10 h-10 text-[hsl(38,92%,50%)]" />
        </div>

        <h1 className="text-3xl font-bold text-white mb-3">
          Plataforma em Manutenção
        </h1>
        <p className="text-[hsl(220,15%,55%)] text-base leading-relaxed mb-8">
          Estamos realizando melhorias na plataforma de auditoria.
          <br />
          O acesso será restabelecido em breve.
        </p>

        <div className="bg-[hsl(222,25%,18%)]/80 backdrop-blur-sm border border-[hsl(222,20%,25%)] rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-[hsl(217,91%,50%)]" />
            <span className="font-semibold text-white text-sm">BEX Auditoria IA</span>
          </div>
          <p className="text-[hsl(220,15%,50%)] text-xs">
            Todos os dados estão seguros. Nenhuma informação foi comprometida.
          </p>
        </div>

        <button
          onClick={() => navigate("/")}
          className="text-[hsl(217,91%,50%)] hover:text-[hsl(217,91%,60%)] text-sm font-medium transition-colors"
        >
          ← Voltar para o site
        </button>

        <div className="mt-10 flex items-center justify-center gap-3 text-[hsl(220,15%,40%)] text-xs">
          <span className="px-2 py-1 rounded bg-[hsl(222,25%,18%)] border border-[hsl(222,20%,25%)]">CPC</span>
          <span>•</span>
          <span className="px-2 py-1 rounded bg-[hsl(222,25%,18%)] border border-[hsl(222,20%,25%)]">IFRS</span>
          <span>•</span>
          <span className="px-2 py-1 rounded bg-[hsl(222,25%,18%)] border border-[hsl(222,20%,25%)]">NBC TA</span>
        </div>
      </div>
    </div>
  );
};

export default Manutencao;
