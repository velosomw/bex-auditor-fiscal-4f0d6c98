import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const SolvenciaReestruturacao = () => {
  return (
    <>
      <section className="relative py-24 md:py-32 bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-3">Pacote Intermediário</p>
          <h1 className="text-4xl md:text-5xl font-serif font-bold max-w-2xl mb-4">Solvência + Plano de Reestruturação</h1>
          <p className="text-primary-foreground/70 max-w-xl">
            Para empresas em crise moderada que necessitam de um plano estruturado de recuperação financeira.
          </p>
        </div>
      </section>

      <section className="section-padding bg-background">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-serif font-bold text-foreground mb-6">O que entregamos</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Parecer de Solvência utilizando modelos preditivos reconhecidos internacionalmente, combinado com um Plano Financeiro de Reestruturação completo com projeções e cenários.
              </p>
              <ul className="space-y-3">
                {[
                  "Parecer de Solvência (Z-Score de Altman)",
                  "Modelo de Kanitz para previsão de insolvência",
                  "Análise pelo Modelo de Matias",
                  "Plano Financeiro de Reestruturação",
                  "Projeções financeiras multi-cenário",
                  "Modelagem de reestruturação de dívidas",
                  "Estratégias de alongamento de prazos",
                  "Simulações de impacto financeiro",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-foreground">
                    <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-muted rounded-lg p-8">
              <h3 className="font-serif font-bold text-lg text-foreground mb-4">Para quem é indicado?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Empresas em crise moderada que precisam de uma avaliação profunda da solvência e um plano estruturado para reverter a situação.
              </p>
              <h3 className="font-serif font-bold text-lg text-foreground mb-4">Prazo estimado</h3>
              <p className="text-sm text-muted-foreground mb-8">4 a 8 semanas para parecer e plano completos.</p>
              <Link
                to="/contato"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                Solicitar Proposta <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default SolvenciaReestruturacao;
