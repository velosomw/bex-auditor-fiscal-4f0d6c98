import { Link, useNavigate } from "react-router-dom";
import { Check, X, Sparkles, Crown } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";

const proFeatures = [
  { ok: true, label: "Cadastro com CNPJ e CRC" },
  { ok: true, label: "Até 3 relatórios PRO por mês" },
  { ok: true, label: "Gráficos e análise básica de balancetes" },
  { ok: true, label: "Visibilidade Kanitz (resumida)" },
  { ok: false, label: "Workspace de análise pós-relatório" },
  { ok: false, label: "Relatórios completos BEx Auditoria IA" },
  { ok: false, label: "Kanitz completo + análise ampliada" },
];

const entFeatures = [
  { ok: true, label: "Tudo do plano PRO" },
  { ok: true, label: "6 relatórios completos BEx Auditoria IA/mês" },
  { ok: true, label: "+10 relatórios PRO (desbloqueio PRO 10)" },
  { ok: true, label: "Total de 16 relatórios mensais" },
  { ok: true, label: "2 relatórios simultâneos PRO + Kanitz" },
  { ok: true, label: "Workspace de análise pós-relatório" },
  { ok: true, label: "Kanitz completo + análise aprofundada" },
];

const Planos = () => {
  const navigate = useNavigate();
  const { user } = useUser();

  const handleContratarEnterprise = () => {
    if (user) navigate("/minha-assinatura?upgrade=enterprise");
    else navigate("/signup?plan=enterprise&redirect=/minha-assinatura?upgrade=enterprise");
  };

  return (
    <Layout>
      <section className="bg-[hsl(222,47%,11%)] text-white py-20 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <Badge className="mb-4 bg-[hsl(217,91%,50%)]/20 text-[hsl(217,91%,70%)] border-[hsl(217,91%,50%)]/30">
            Planos e Assinatura
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Escolha o plano ideal para o seu escritório
          </h1>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">
            Auditoria contábil inteligente com IA. Comece grátis com o plano PRO ou avance seu negócio com o Enterprise.
          </p>
        </div>
      </section>

      <section className="py-16 px-6 bg-background">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PRO */}
          <Card className="p-8 border-2 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-[hsl(217,91%,50%)]" />
              <h2 className="text-2xl font-bold">Plano PRO</h2>
            </div>
            <p className="text-muted-foreground mb-6">Para começar a usar a plataforma sem custo.</p>
            <div className="mb-6">
              <span className="text-5xl font-bold">Grátis</span>
              <span className="text-muted-foreground ml-2">para sempre</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {proFeatures.map((f) => (
                <li key={f.label} className="flex items-start gap-2 text-sm">
                  {f.ok ? <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-muted-foreground/50 mt-0.5 shrink-0" />}
                  <span className={f.ok ? "" : "text-muted-foreground/60 line-through"}>{f.label}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full h-12 text-base" onClick={() => navigate("/signup?plan=pro")}>
              Fazer Cadastro
            </Button>
          </Card>

          {/* ENTERPRISE */}
          <Card className="p-8 border-2 border-[hsl(217,91%,50%)] flex flex-col relative shadow-xl">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[hsl(217,91%,50%)] text-white">
              Recomendado
            </Badge>
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-[hsl(217,91%,50%)]" />
              <h2 className="text-2xl font-bold">Plano Enterprise</h2>
            </div>
            <p className="text-muted-foreground mb-6">Avance seu negócio com auditoria IA completa.</p>
            <div className="mb-6">
              <span className="text-5xl font-bold">R$ 5,00</span>
              <span className="text-muted-foreground ml-2">/mês</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {entFeatures.map((f) => (
                <li key={f.label} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full h-12 text-base text-white [background:var(--btn-gradient)] hover:[background:var(--btn-gradient-hover)]" onClick={handleContratarEnterprise}>
              Contratar
            </Button>
            {!user && (
              <p className="text-xs text-center text-muted-foreground mt-3">
                Já é cadastrado?{" "}
                <Link to="/login?redirect=/minha-assinatura?upgrade=enterprise" className="text-[hsl(217,91%,50%)] hover:underline font-medium">
                  Clique aqui para entrar
                </Link>
              </p>
            )}
          </Card>
        </div>

        <div className="max-w-3xl mx-auto mt-16 text-center">
          <h3 className="text-xl font-semibold mb-3">Dúvidas sobre os planos?</h3>
          <p className="text-muted-foreground mb-4">Fale com nosso time. Ajustamos a melhor opção para o seu escritório.</p>
          <Button variant="outline" onClick={() => navigate("/contato")}>Fale Conosco</Button>
        </div>
      </section>
    </Layout>
  );
};

export default Planos;
